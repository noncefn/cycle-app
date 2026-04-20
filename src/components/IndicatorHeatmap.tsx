import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useApp } from "../store";
import { INDICATORS, type IndicatorMeta } from "../data/indicators";
import { cellBg, cellFg, percentileRank, INDICATOR_DIRECTION } from "../scoring/heatmapColor";
import type { MonthKey, MonthSeries } from "../types";

const WINDOW = 24;           // 24 columns
const PCTILE_LOOKBACK = 60;  // 60 months trailing window for percentile

function formatValue(meta: IndicatorMeta, v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "–";
  switch (meta.seriesType) {
    case "yoy":
    case "rate":
    case "yield":
    case "spread":
      return `${v.toFixed(2)}%`;
    case "level":
      // Different indicators have very different magnitudes; pick a sane default.
      if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
      if (Math.abs(v) >= 100) return v.toFixed(1);
      return v.toFixed(2);
    default:
      return String(v);
  }
}

// Collect lookback values (up to PCTILE_LOOKBACK, excluding gaps) ending at `atMonth`.
function lookbackVals(series: MonthSeries, allMonths: MonthKey[], atMonth: MonthKey): number[] {
  const idx = allMonths.indexOf(atMonth);
  if (idx < 0) return [];
  const start = Math.max(0, idx - PCTILE_LOOKBACK + 1);
  const out: number[] = [];
  for (let i = start; i <= idx; i++) {
    const v = series.get(allMonths[i]);
    if (v !== undefined) out.push(v);
  }
  return out;
}

export function IndicatorHeatmap() {
  const selectedMonth = useApp((s) => s.selectedMonth);
  const data = useApp((s) => s.data);
  const selectMonth = useApp((s) => s.selectMonth);
  const selectEra = useApp((s) => s.selectEraMonth);

  const cols = useMemo(() => {
    if (!selectedMonth || !data) return [];
    const allMonths = data.months;
    const endIdx = allMonths.indexOf(selectedMonth);
    if (endIdx < 0) return [];
    const startIdx = Math.max(0, endIdx - WINDOW + 1);
    return allMonths.slice(startIdx, endIdx + 1);
  }, [selectedMonth, data]);

  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep the selected (rightmost) column in view when the month changes.
    const el = scrollerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [selectedMonth, cols.length]);

  if (!selectedMonth || !data) return <div className="card">로딩 중...</div>;

  const byCategory: Record<string, IndicatorMeta[]> = {};
  for (const ind of INDICATORS) (byCategory[ind.category] ||= []).push(ind);

  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>경제지표 히트맵</h2>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          직전 24개월 · 색상: 60M percentile · 숫자 클릭 시 해당 월 선택
        </span>
      </div>

      <div ref={scrollerRef} style={{ overflowX: "auto", overflowY: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th style={thLabelStyle}>지표</th>
              {cols.map((m) => (
                <th
                  key={m}
                  onClick={() => { selectMonth(m); selectEra(m); }}
                  style={{
                    ...thColStyle,
                    background: m === selectedMonth ? "var(--accent)" : "var(--bg-elev)",
                    color: m === selectedMonth ? "#fff" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                  title={m}
                >
                  {m.slice(2, 4)}/{m.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(byCategory).map(([cat, inds]) => (
              <Fragment key={cat}>
                <tr>
                  <td colSpan={cols.length + 1} style={catRowStyle}>{cat}</td>
                </tr>
                {inds.map((ind) => {
                  const series = data.series[ind.key];
                  const direction = INDICATOR_DIRECTION[ind.key] ?? "pro";
                  return (
                    <tr key={ind.key}>
                      <td style={labelCellStyle}>
                        <span style={{ fontWeight: 600 }}>{ind.label}</span>
                        <span style={{ color: "var(--text-dim)", fontSize: 9, marginLeft: 4 }}>
                          ({direction === "pro" ? "↑강세" : "↑약세"})
                        </span>
                      </td>
                      {cols.map((m) => {
                        const v = series?.get(m);
                        const lookback = series ? lookbackVals(series, data.months, m) : [];
                        const pct = v !== undefined && lookback.length >= 6
                          ? percentileRank(lookback, v)
                          : 0.5;
                        const bg = v !== undefined && lookback.length >= 6
                          ? cellBg(pct, direction)
                          : "transparent";
                        const fg = v !== undefined && lookback.length >= 6
                          ? cellFg(pct, direction)
                          : "var(--text-dim)";
                        const isSelected = m === selectedMonth;
                        return (
                          <td
                            key={m}
                            onClick={() => { selectMonth(m); selectEra(m); }}
                            style={{
                              ...cellStyle,
                              background: bg,
                              color: fg,
                              outline: isSelected ? "1.5px solid var(--accent)" : "none",
                              outlineOffset: -1,
                              cursor: "pointer",
                            }}
                            title={`${ind.label} ${m}: ${formatValue(ind, v)} (percentile ${Math.round(pct * 100)}%)`}
                          >
                            {formatValue(ind, v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thLabelStyle: CSSProperties = {
  position: "sticky", left: 0, top: 0, zIndex: 3,
  background: "var(--bg-card)",
  padding: "4px 8px",
  textAlign: "left", borderBottom: "1px solid var(--border)",
  fontSize: 10, color: "var(--text-muted)", fontWeight: 600,
  minWidth: 140,
};

const thColStyle: CSSProperties = {
  position: "sticky", top: 0, zIndex: 2,
  padding: "4px 6px",
  borderBottom: "1px solid var(--border)",
  fontSize: 10, fontWeight: 500,
  textAlign: "center",
  minWidth: 38, whiteSpace: "nowrap",
};

const catRowStyle: CSSProperties = {
  padding: "6px 8px 2px",
  fontSize: 10,
  color: "var(--text-dim)",
  background: "var(--bg)",
  letterSpacing: 0.3,
  textTransform: "uppercase",
  fontWeight: 600,
  borderBottom: "1px solid var(--border-subtle)",
};

const labelCellStyle: CSSProperties = {
  position: "sticky", left: 0, zIndex: 1,
  background: "var(--bg-card)",
  padding: "4px 8px",
  borderBottom: "1px solid var(--border-subtle)",
  whiteSpace: "nowrap",
};

const cellStyle: CSSProperties = {
  padding: "4px 2px",
  textAlign: "center",
  borderBottom: "1px solid var(--border-subtle)",
  borderRight: "1px solid var(--border-subtle)",
  minWidth: 38,
  fontVariantNumeric: "tabular-nums",
};
