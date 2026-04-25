import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);

  const togglePin = (key: string) => {
    setPinnedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [key, ...prev],
    );
  };
  const resetPins = () => setPinnedKeys([]);

  if (!selectedMonth || !data) return <div className="card">로딩 중...</div>;

  const pinnedSet = new Set(pinnedKeys);
  const pinnedIndicators = pinnedKeys
    .map((k) => INDICATORS.find((i) => i.key === k))
    .filter((i): i is IndicatorMeta => !!i);

  const byCategory: Record<string, IndicatorMeta[]> = {};
  for (const ind of INDICATORS) {
    if (pinnedSet.has(ind.key)) continue;
    (byCategory[ind.category] ||= []).push(ind);
  }

  const renderRow = (ind: IndicatorMeta, isPinned: boolean) => {
    const series = data.series[ind.key];
    const direction = INDICATOR_DIRECTION[ind.key] ?? "pro";
    return (
      <tr key={ind.key}>
        <td
          onClick={() => togglePin(ind.key)}
          style={{
            ...labelCellStyle,
            cursor: "pointer",
            borderLeft: isPinned ? "2px solid var(--accent)" : "2px solid transparent",
          }}
          title={isPinned ? "클릭하여 고정 해제" : "클릭하여 상단 고정"}
        >
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
  };

  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
        <h2 style={{ margin: 0 }}>경제지표 히트맵</h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            직전 24개월 · 색상: 60M percentile · 지표명 클릭 시 상단 고정
          </span>
          {pinnedKeys.length > 0 && (
            <button
              onClick={resetPins}
              style={resetBtnStyle}
              title="고정 지표 전체 해제"
            >
              초기화 ({pinnedKeys.length})
            </button>
          )}
        </div>
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
            {pinnedIndicators.length > 0 && (
              <Fragment>
                <tr>
                  <td colSpan={cols.length + 1} style={catRowStyle}>고정</td>
                </tr>
                {pinnedIndicators.map((ind) => renderRow(ind, true))}
              </Fragment>
            )}
            {Object.entries(byCategory).map(([cat, inds]) => (
              <Fragment key={cat}>
                <tr>
                  <td colSpan={cols.length + 1} style={catRowStyle}>{cat}</td>
                </tr>
                {inds.map((ind) => renderRow(ind, false))}
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

const resetBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 4,
  cursor: "pointer",
};
