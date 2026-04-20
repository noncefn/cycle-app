import Papa from "papaparse";
import type { MonthKey, MonthSeries } from "../types";
import { INDICATORS } from "./indicators";

// ---- helpers ----

function mkKey(y: number, m: number): MonthKey {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function parseIsoMonthKey(iso: string): MonthKey | null {
  // "2006-01-01" → "2006-01"
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

function parseKoreanMonth(s: string): MonthKey | null {
  // "2006년 01월" → "2006-01"
  const m = s.match(/(\d{4})년\s*(\d{1,2})월/);
  if (!m) return null;
  return mkKey(Number(m[1]), Number(m[2]));
}

function numFromStr(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  // drop commas (thousand-sep), percent signs, "K" suffix
  s = s.replace(/,/g, "");
  const hasPct = s.endsWith("%");
  if (hasPct) s = s.slice(0, -1);
  const hasK = s.toUpperCase().endsWith("K");
  if (hasK) s = s.slice(0, -1);
  const n = Number(s);
  if (!isFinite(n)) return null;
  return hasK ? n * 1000 : n;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return res.text();
}

// ---- aggregate daily → monthly (last available day of month) ----

function dailyToMonthly(
  rows: Array<{ date: string; value: number }>,
): MonthSeries {
  const byMonth = new Map<MonthKey, { key: MonthKey; day: number; value: number }>();
  for (const r of rows) {
    const key = parseIsoMonthKey(r.date);
    if (!key) continue;
    const day = Number(r.date.slice(8, 10));
    const prev = byMonth.get(key);
    if (!prev || day > prev.day) {
      byMonth.set(key, { key, day, value: r.value });
    }
  }
  const out: MonthSeries = new Map();
  for (const [k, v] of byMonth) out.set(k, v.value);
  return out;
}

// ---- compute YoY % from a level series ----

export function computeYoY(level: MonthSeries): MonthSeries {
  const out: MonthSeries = new Map();
  for (const [k, v] of level) {
    const [y, m] = k.split("-").map(Number);
    const prevKey = mkKey(y - 1, m);
    const prev = level.get(prevKey);
    if (prev && prev !== 0) {
      out.set(k, ((v - prev) / prev) * 100);
    }
  }
  return out;
}

// ---- forward fill (for quarterly GDP YoY) ----
// If `untilMonth` is provided, fills past the original last key up to that month.

function forwardFill(s: MonthSeries, untilMonth?: MonthKey): MonthSeries {
  const keys = [...s.keys()].sort();
  if (keys.length === 0) return s;
  const out = new Map(s);
  const first = keys[0];
  const last = keys[keys.length - 1];
  const endKey = untilMonth && untilMonth > last ? untilMonth : last;
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = endKey.split("-").map(Number);
  let y = fy, m = fm;
  let carry: number | undefined = undefined;
  while (y < ly || (y === ly && m <= lm)) {
    const k = mkKey(y, m);
    if (out.has(k)) carry = out.get(k);
    else if (carry !== undefined) out.set(k, carry);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// ---- main loader ----

export interface LoadedData {
  // canonical series used by scoring rules (indicator.key → MonthSeries)
  series: Record<string, MonthSeries>;
  // optional auxiliary level series (for rules needing levels vs yoy)
  levels: Record<string, MonthSeries>;
  // all months present across at least one indicator (sorted)
  months: MonthKey[];
}

async function loadHeatmap(): Promise<{
  byCol: Record<string, MonthSeries>;
}> {
  const text = await fetchText("/data/valley_cycle_heatmap_2006_2026.csv");
  // The CSV has a 2-row header. Row 1 is category group, row 2 is actual column
  // names. Easiest: parse without header and treat row index 1 as the header.
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = parsed.data as string[][];
  const header = rows[1];
  const dataRows = rows.slice(2);

  const byCol: Record<string, MonthSeries> = {};
  for (let c = 1; c < header.length; c++) {
    const col = (header[c] || "").trim();
    if (!col) continue;
    if (!byCol[col]) byCol[col] = new Map();
  }

  for (const row of dataRows) {
    const dateStr = row[0];
    const key = parseKoreanMonth(dateStr);
    if (!key) continue;
    for (let c = 1; c < header.length; c++) {
      const col = (header[c] || "").trim();
      if (!col) continue;
      const n = numFromStr(row[c]);
      if (n === null) continue;
      byCol[col].set(key, n);
    }
  }
  return { byCol };
}

async function loadM2(): Promise<MonthSeries> {
  const text = await fetchText("/data/M2REAL.csv");
  const parsed = Papa.parse<{ observation_date: string; M2REAL: string }>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const level: MonthSeries = new Map();
  for (const r of parsed.data) {
    const key = parseIsoMonthKey(r.observation_date);
    const v = numFromStr(r.M2REAL);
    if (key && v !== null) level.set(key, v);
  }
  return level;
}

async function loadCommodities(): Promise<MonthSeries> {
  const text = await fetchText("/data/GlobalCommoditiesIndex.csv");
  const parsed = Papa.parse<{ observation_date: string; PALLFNFINDEXM: string }>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const level: MonthSeries = new Map();
  for (const r of parsed.data) {
    const key = parseIsoMonthKey(r.observation_date);
    const v = numFromStr(r.PALLFNFINDEXM);
    if (key && v !== null) level.set(key, v);
  }
  return level;
}

async function loadDaily(url: string, col: string): Promise<MonthSeries> {
  const text = await fetchText(url);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const rows: Array<{ date: string; value: number }> = [];
  for (const r of parsed.data) {
    const v = numFromStr(r[col]);
    if (v === null) continue;
    rows.push({ date: r.Date, value: v });
  }
  return dailyToMonthly(rows);
}

export async function loadAllData(): Promise<LoadedData> {
  const [heatmap, m2Level, commodityLevel, ust10Daily, hyoasDaily] = await Promise.all([
    loadHeatmap(),
    loadM2(),
    loadCommodities(),
    loadDaily("/data/US_10Y_Treasury_Yield_2006_2026.csv", "10Y US Treasury Yield %"),
    loadDaily("/data/ICE_BofA_US_HighYield_OAS_2006_2026.csv", "ICE BofA US High Yield Spread (OAS) %"),
  ]);

  const series: Record<string, MonthSeries> = {};
  const levels: Record<string, MonthSeries> = {};

  // First pass: compute the union max month across all raw series so we can
  // forward-fill slow-frequency indicators (e.g., quarterly GDP) up to the end.
  const maxMonthUnion = (() => {
    let hi = "";
    const visit = (s: MonthSeries) => { for (const k of s.keys()) if (k > hi) hi = k; };
    for (const col of Object.values(heatmap.byCol)) visit(col);
    visit(m2Level); visit(commodityLevel); visit(ust10Daily); visit(hyoasDaily);
    return hi;
  })();

  for (const meta of INDICATORS) {
    const { key, source, heatmapCol, seriesType } = meta;
    let s: MonthSeries | undefined;
    let levelOnly: MonthSeries | undefined;

    switch (source) {
      case "heatmap": {
        if (!heatmapCol) throw new Error(`heatmap 지표 "${key}" 에 컬럼 매핑 누락`);
        s = heatmap.byCol[heatmapCol];
        if (!s || s.size === 0)
          throw new Error(`heatmap CSV 에 "${heatmapCol}" 컬럼이 비어있거나 없음`);
        // Forward-fill quarterly GDP up to union-last month so recent months have a value.
        if (key === "gdp") s = forwardFill(s, maxMonthUnion);
        break;
      }
      case "m2": {
        levelOnly = m2Level;
        s = computeYoY(m2Level);
        break;
      }
      case "commodities": {
        levelOnly = commodityLevel;
        s = commodityLevel; // rules reference level (trend/high/low)
        break;
      }
      case "ust10": {
        s = ust10Daily;
        break;
      }
      case "hyoas": {
        s = hyoasDaily;
        break;
      }
    }

    if (!s) throw new Error(`지표 "${key}" 데이터 로드 실패`);
    series[key] = s;
    if (levelOnly) levels[key] = levelOnly;
    // seriesType only used downstream in rules (for commentary/thresholds)
    void seriesType;
  }

  // months = union of months where any indicator has data, sorted.
  const monthSet = new Set<MonthKey>();
  for (const s of Object.values(series)) for (const k of s.keys()) monthSet.add(k);
  const months = [...monthSet].sort();

  return { series, levels, months };
}

export function monthsBetween(
  start: MonthKey,
  end: MonthKey,
  allMonths: MonthKey[],
): MonthKey[] {
  return allMonths.filter((m) => m >= start && m <= end);
}

export const _internals = { numFromStr, parseIsoMonthKey, parseKoreanMonth, dailyToMonthly, forwardFill };
