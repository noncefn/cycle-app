#!/usr/bin/env python3
"""
Refresh economic indicator data from FRED and Yahoo Finance.

Updates 14 FRED-sourced indicators + S&P 500 across 5 CSVs in public/data/.
Preserves ISM PMI (manually maintained) and all non-indicator columns.

Usage:
  python scripts/fetch_indicators.py             # apply changes
  python scripts/fetch_indicators.py --dry-run   # preview diff only
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from fredapi import Fred
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"

HEATMAP_CSV = DATA_DIR / "valley_cycle_heatmap_2006_2026.csv"
M2_CSV = DATA_DIR / "M2REAL.csv"
COMDTY_CSV = DATA_DIR / "GlobalCommoditiesIndex.csv"
UST10_CSV = DATA_DIR / "US_10Y_Treasury_Yield_2006_2026.csv"
HYOAS_CSV = DATA_DIR / "ICE_BofA_US_HighYield_OAS_2006_2026.csv"

FRED_START = "2005-01-01"  # 1yr before data start for YoY
DAILY_START = "2006-01-01"

# ---------- formatters ----------

def fmt_pct(v, decimals: int = 2) -> str:
    if v is None or pd.isna(v):
        return ""
    return f"{float(v):.{decimals}f}%"

def fmt_k(v, decimals: int = 2) -> str:
    """ICSA: raw value like 295750 -> '295.75K'."""
    if v is None or pd.isna(v):
        return ""
    return f"{float(v) / 1000:.{decimals}f}K"

def fmt_thousand(v, decimals: int = 2) -> str:
    """SPX: 1280.08 -> '1,280.08' (csv.writer will auto-quote)."""
    if v is None or pd.isna(v):
        return ""
    return f"{float(v):,.{decimals}f}"

def fmt_level(v, decimals: int = 1) -> str:
    if v is None or pd.isna(v):
        return ""
    return f"{float(v):.{decimals}f}"

# ---------- heatmap column config ----------
# column_name_in_heatmap -> (fred_series, aggregation, formatter)
# aggregation: 'level' = use raw; 'yoy' = compute YoY%; 'daily_monthend' = last daily obs of month

HEATMAP_COLS = [
    ("실질 국내총생산",          "GDPC1",    "yoy",            lambda v: fmt_pct(v, 2)),
    ("비농업 취업자 수",          "PAYEMS",   "yoy",            lambda v: fmt_pct(v, 2)),
    ("실업률",                  "UNRATE",   "level",          lambda v: fmt_pct(v, 1)),
    ("주당 실업수당 신청건수",     "ICSA",     "weekly_avg",     lambda v: fmt_k(v, 2)),
    ("미시간 소비자 심리지수",     "UMCSENT",  "level",          lambda v: fmt_level(v, 1)),
    ("개인 소득",                "PI",       "yoy",            lambda v: fmt_pct(v, 2)),
    ("산업생산",                 "INDPRO",   "yoy",            lambda v: fmt_pct(v, 2)),
    ("설비가동률",               "TCU",      "level",          lambda v: fmt_pct(v, 2)),
    ("주택 건설허가건수",         "PERMIT",   "yoy",            lambda v: fmt_pct(v, 2)),
    ("장단기 금리 (10년-3개월)",  "T10Y3M",   "daily_monthend", lambda v: fmt_pct(v, 2)),
    ("기준금리",                 "FEDFUNDS", "level",          lambda v: fmt_pct(v, 2)),
]

SPX_COL = "S&P 500 지수"  # filled from yfinance

# ---------- fetchers ----------

def fetch_fred_monthly(fred: Fred, series: str) -> pd.Series:
    s = fred.get_series(series, observation_start=FRED_START)
    s.index = pd.to_datetime(s.index).to_period("M").to_timestamp()
    # de-dup by month (keep last)
    s = s[~s.index.duplicated(keep="last")]
    return s.astype(float)

def fetch_fred_weekly_avg(fred: Fred, series: str) -> pd.Series:
    s = fred.get_series(series, observation_start=FRED_START)
    idx = pd.to_datetime(s.index)
    df = pd.DataFrame({"v": s.values}, index=idx)
    monthly = df.resample("MS").mean()
    return monthly["v"].astype(float)

def fetch_fred_daily_monthend(fred: Fred, series: str) -> pd.Series:
    s = fred.get_series(series, observation_start=DAILY_START)
    idx = pd.to_datetime(s.index)
    df = pd.DataFrame({"v": s.values}, index=idx).dropna()
    # last observation per month, aligned to month-start key
    df["month"] = df.index.to_period("M").to_timestamp()
    monthly = df.groupby("month")["v"].last()
    monthly.index.name = None
    return monthly.astype(float)

def fetch_fred_daily_raw(fred: Fred, series: str) -> pd.Series:
    """For UST10, HYOAS: keep daily, used by separate CSVs."""
    s = fred.get_series(series, observation_start=DAILY_START)
    s.index = pd.to_datetime(s.index)
    return s.dropna().astype(float)

def compute_yoy(level: pd.Series) -> pd.Series:
    """YoY% from level series indexed by month-start Timestamps."""
    prev = level.shift(12, freq="MS")
    # align by index
    yoy = (level - prev) / prev * 100.0
    return yoy

def fetch_spx_monthly() -> pd.Series:
    """^GSPC daily close -> last trading day of month."""
    t = yf.Ticker("^GSPC")
    hist = t.history(start=DAILY_START, interval="1d", auto_adjust=False)
    if hist.empty:
        raise RuntimeError("yfinance returned empty SPX history")
    closes = hist["Close"]
    closes.index = pd.to_datetime(closes.index).tz_localize(None)
    df = pd.DataFrame({"v": closes.values}, index=closes.index)
    df["month"] = df.index.to_period("M").to_timestamp()
    monthly = df.groupby("month")["v"].last()
    return monthly.astype(float)

# ---------- heatmap read/write ----------

def month_key_from_korean(s: str) -> str | None:
    m = re.match(r"(\d{4})년\s*(\d{1,2})월", s or "")
    if not m:
        return None
    return f"{m.group(1)}-{int(m.group(2)):02d}"

def korean_month_from_key(k: str) -> str:
    y, m = k.split("-")
    return f"{y}년 {int(m):02d}월"

def update_heatmap(fred: Fred, dry_run: bool) -> list[str]:
    """Rewrite heatmap CSV. Returns list of change descriptions."""
    changes: list[str] = []

    # Fetch all monthly series first
    fred_data: dict[str, pd.Series] = {}
    for col, series, agg, _fmt in HEATMAP_COLS:
        if agg in ("level", "yoy"):
            raw = fetch_fred_monthly(fred, series)
        elif agg == "weekly_avg":
            raw = fetch_fred_weekly_avg(fred, series)
        elif agg == "daily_monthend":
            raw = fetch_fred_daily_monthend(fred, series)
        else:
            raise ValueError(f"unknown agg {agg}")

        if agg == "yoy":
            fred_data[col] = compute_yoy(raw)
        else:
            fred_data[col] = raw
    # S&P 500
    fred_data[SPX_COL] = fetch_spx_monthly()

    # build month_key -> {col_name: formatted_value}
    formatter_by_col: dict[str, callable] = {c: fmt for (c, _s, _a, fmt) in HEATMAP_COLS}
    formatter_by_col[SPX_COL] = lambda v: fmt_thousand(v, 2)

    month_map: dict[str, dict[str, str]] = {}
    for col, series in fred_data.items():
        fmt = formatter_by_col[col]
        for ts, val in series.items():
            key = ts.strftime("%Y-%m")
            if key < "2006-01":
                continue
            formatted = fmt(val)
            if not formatted:
                continue  # skip NaN/empty to avoid spurious future-month rows
            month_map.setdefault(key, {})[col] = formatted

    # Read existing CSV preserving everything
    with open(HEATMAP_CSV, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    # rows[0] = category header, rows[1] = column header, rows[2:] = data
    header = rows[1]
    header_idx = {name: i for i, name in enumerate(header)}

    target_cols = list(formatter_by_col.keys())
    missing = [c for c in target_cols if c not in header_idx]
    if missing:
        raise RuntimeError(f"columns missing from heatmap header: {missing}")

    new_rows = rows[:2]  # copy headers
    data_rows = rows[2:]
    existing_months: set[str] = set()

    for row in data_rows:
        if not row or not row[0].strip():
            new_rows.append(row)
            continue
        mkey = month_key_from_korean(row[0])
        if mkey is None:
            new_rows.append(row)
            continue
        existing_months.add(mkey)
        new_row = list(row)
        # pad if row too short
        while len(new_row) < len(header):
            new_row.append("")
        for col in target_cols:
            new_val = month_map.get(mkey, {}).get(col, "")
            idx = header_idx[col]
            old_val = (new_row[idx] or "").strip()
            if new_val and new_val != old_val:
                changes.append(f"{mkey} {col}: {old_val!r} -> {new_val!r}")
                new_row[idx] = new_val
            elif new_val:
                # identical, no change
                pass
            # if new_val empty, keep old_val
        new_rows.append(new_row)

    # append months not in existing CSV (e.g., new months after current last)
    new_months_added = sorted(set(month_map.keys()) - existing_months)
    for mkey in new_months_added:
        if mkey < "2006-01":
            continue
        non_empty = {c: v for c, v in month_map[mkey].items() if v}
        if not non_empty:
            continue  # nothing to fill
        blank = [""] * len(header)
        blank[0] = korean_month_from_key(mkey)
        for col, val in non_empty.items():
            blank[header_idx[col]] = val
        new_rows.append(blank)
        changes.append(f"{mkey} [NEW ROW] {len(non_empty)} indicators filled")

    if dry_run:
        return changes

    with open(HEATMAP_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        for r in new_rows:
            w.writerow(r)
    return changes

# ---------- standalone CSV updates ----------

def update_monthly_csv(path: Path, fred: Fred, series: str, column: str, dry_run: bool) -> list[str]:
    """For M2REAL, PALLFNFINDEXM — simple observation_date,<series> CSV."""
    s = fred.get_series(series, observation_start=DAILY_START)
    s.index = pd.to_datetime(s.index)
    s = s.dropna()

    # read existing
    existing: dict[str, str] = {}
    with open(path, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) >= 2:
                existing[row[0]] = row[1]

    changes: list[str] = []
    new_lines: list[list[str]] = [header]
    seen: set[str] = set()
    for ts, val in s.items():
        date_str = ts.strftime("%Y-%m-%d")
        val_str = f"{float(val):.14f}" if series == "PALLFNFINDEXM" else f"{float(val):.1f}"
        new_lines.append([date_str, val_str])
        seen.add(date_str)
        if date_str in existing and existing[date_str] != val_str:
            # minor precision diffs are noisy; only log if numeric diff > tiny
            try:
                if abs(float(existing[date_str]) - float(val_str)) > 0.005:
                    changes.append(f"{path.name} {date_str}: {existing[date_str]} -> {val_str}")
            except ValueError:
                changes.append(f"{path.name} {date_str}: {existing[date_str]} -> {val_str}")

    added = sorted(seen - set(existing.keys()))
    for d in added:
        changes.append(f"{path.name} {d} [NEW]")

    if not dry_run:
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
            for r in new_lines:
                w.writerow(r)
    return changes

def update_daily_csv(path: Path, fred: Fred, series: str, column: str, dry_run: bool) -> list[str]:
    """For UST10, HY OAS — daily CSV with BOM and `Date,<col>` header.

    MERGE strategy: preserve all existing rows (FRED ICE BofA series only expose
    last ~3 years; overwriting would destroy historical data). Only append new
    dates and update values for dates FRED returns.
    """
    s = fetch_fred_daily_raw(fred, series)

    # read existing preserving order
    existing_order: list[str] = []
    existing_val: dict[str, str] = {}
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) >= 2 and row[0]:
                existing_order.append(row[0])
                existing_val[row[0]] = row[1]

    # build fresh values from FRED
    fresh: dict[str, str] = {}
    for ts, val in s.items():
        date_str = ts.strftime("%Y-%m-%d")
        fresh[date_str] = f"{float(val):.2f}"

    changes: list[str] = []
    merged_order = list(existing_order)
    seen = set(existing_order)
    for d in sorted(fresh.keys()):
        if d not in seen:
            merged_order.append(d)
            changes.append(f"{path.name} {d} [NEW]")
            seen.add(d)

    # compose final rows (existing values preserved; fresh values override on overlap)
    final: dict[str, str] = dict(existing_val)
    for d, v in fresh.items():
        if d in existing_val and existing_val[d] != v:
            try:
                if abs(float(existing_val[d]) - float(v)) > 0.005:
                    changes.append(f"{path.name} {d}: {existing_val[d]} -> {v}")
            except ValueError:
                changes.append(f"{path.name} {d}: {existing_val[d]} -> {v}")
        final[d] = v

    if not dry_run:
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
            w.writerow(header)
            for d in merged_order:
                w.writerow([d, final[d]])
    return changes

# ---------- main ----------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="preview diffs, don't write")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        print("ERROR: FRED_API_KEY not set (check .env or GitHub Secrets)", file=sys.stderr)
        sys.exit(1)
    fred = Fred(api_key=api_key)

    print(f"{'[DRY-RUN] ' if args.dry_run else ''}Refreshing indicators...")

    all_changes: list[str] = []

    print("- heatmap (14 indicators + SPX)")
    all_changes += update_heatmap(fred, args.dry_run)

    print("- M2REAL")
    all_changes += update_monthly_csv(M2_CSV, fred, "M2REAL", "M2REAL", args.dry_run)

    print("- PALLFNFINDEXM (commodities)")
    all_changes += update_monthly_csv(COMDTY_CSV, fred, "PALLFNFINDEXM", "PALLFNFINDEXM", args.dry_run)

    print("- DGS10 (UST10 daily)")
    all_changes += update_daily_csv(UST10_CSV, fred, "DGS10", "10Y US Treasury Yield %", args.dry_run)

    print("- BAMLH0A0HYM2 (HY OAS daily)")
    all_changes += update_daily_csv(HYOAS_CSV, fred, "BAMLH0A0HYM2", "ICE BofA US High Yield Spread (OAS) %", args.dry_run)

    print(f"\n=== {len(all_changes)} change(s) {'[preview]' if args.dry_run else 'applied'} ===")
    for c in all_changes[:60]:
        print(f"  {c}")
    if len(all_changes) > 60:
        print(f"  ... and {len(all_changes) - 60} more")

if __name__ == "__main__":
    main()
