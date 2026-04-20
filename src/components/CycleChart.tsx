import { useMemo, useRef, useState } from "react";
import { PHASES, PHASE_COLORS, type MonthKey, type Phase } from "../types";
import { useApp } from "../store";

const AXIS_H = 22;
const BAR_GAP = 1;
const STACK_H = 220;
const CLI_H = 38;

export function CycleChart() {
  const months = useApp((s) => s.scoredMonths);
  const scores = useApp((s) => s.scores);
  const eraSegments = useApp((s) => s.eraSegments);
  const monthToEra = useApp((s) => s.monthToEra);
  const selectedMonth = useApp((s) => s.selectedMonth);
  const selectedEra = useApp((s) => s.selectedEraMonth);
  const selectMonth = useApp((s) => s.selectMonth);
  const selectEra = useApp((s) => s.selectEraMonth);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<MonthKey | null>(null);

  // Max possible stack height: sum of all indicator points (23) × 4 phases = 92 for worst-case.
  // Practical max is much lower; compute data-driven.
  const yMax = useMemo(() => {
    let max = 0;
    for (const m of months) {
      const t = scores[m]?.totals;
      if (!t) continue;
      const sum = t.침체 + t.회복 + t.확장 + t.둔화;
      if (sum > max) max = sum;
    }
    return Math.max(1, Math.ceil(max));
  }, [months, scores]);

  const N = months.length;
  const selectedEraIdx = selectedEra ? monthToEra.get(selectedEra) : undefined;

  return (
    <div ref={wrapRef} className="cycle-chart">
      <div className="cycle-chart-header">
        <Legend />
        {hover && (
          <div className="cycle-chart-hover">
            <strong>{hover}</strong>{"  "}
            {scores[hover] && (
              <span style={{ color: "var(--text-muted)" }}>
                총점: {PHASES.map((p) => `${p[0]} ${scores[hover].totals[p]}`).join(" / ")}
              </span>
            )}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${N} ${STACK_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: STACK_H, display: "block", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6 }}
        onMouseLeave={() => setHover(null)}
      >
        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={N} y1={STACK_H * (1 - f)} y2={STACK_H * (1 - f)} stroke="var(--grid)" strokeWidth={0.5} />
        ))}
        {months.map((m, i) => {
          const s = scores[m];
          if (!s) return null;
          const selected = m === selectedMonth;
          let yPx = STACK_H;
          const parts = PHASES.map((p) => {
            const pts = s.totals[p];
            const h = (pts / yMax) * STACK_H;
            yPx -= h;
            return (
              <rect
                key={p}
                x={i}
                y={yPx}
                width={1 - BAR_GAP / N}
                height={h}
                fill={PHASE_COLORS[p]}
                opacity={selected || !selectedMonth ? 1 : 0.7}
              />
            );
          });
          return (
            <g
              key={m}
              onMouseEnter={() => setHover(m)}
              onClick={() => { selectMonth(m); selectEra(m); }}
              style={{ cursor: "pointer" }}
            >
              {/* invisible hit-area covering full column */}
              <rect x={i} y={0} width={1} height={STACK_H} fill="transparent" />
              {parts}
              {selected && (
                <rect x={i} y={0} width={1} height={STACK_H} fill="none" stroke="var(--text)" strokeWidth={0.25} />
              )}
            </g>
          );
        })}
      </svg>

      {/* CLI phase bar */}
      <svg
        viewBox={`0 0 ${N} ${CLI_H}`}
        preserveAspectRatio="none"
        style={{
          width: "100%", height: CLI_H, display: "block",
          background: "var(--bg-card)",
          borderLeft: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          borderTop: "none",
          borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
        }}
      >
        {months.map((m, i) => {
          const segIdx = monthToEra.get(m);
          const phase = segIdx !== undefined ? eraSegments[segIdx]?.phase : undefined;
          const color = phase && phase !== "미정" ? PHASE_COLORS[phase as Phase] : "#4b5563";
          const isSelectedEra = segIdx !== undefined && segIdx === selectedEraIdx;
          return (
            <rect
              key={m}
              x={i}
              y={0}
              width={1 - BAR_GAP / N}
              height={CLI_H}
              fill={color}
              opacity={isSelectedEra || selectedEraIdx === undefined ? 1 : 0.5}
              onClick={() => selectEra(m)}
              onMouseEnter={() => setHover(m)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>

      {/* X axis labels (yearly) — HTML so text isn't stretched by SVG scaling */}
      <div style={{ position: "relative", height: AXIS_H, fontSize: 11, color: "var(--text-muted)" }}>
        {months.map((m, i) => {
          if (!m.endsWith("-01")) return null;
          const leftPct = ((i + 0.5) / N) * 100;
          return (
            <div
              key={m}
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                top: 4,
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
              }}
            >
              {m.slice(0, 4)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12 }}>
      {PHASES.map((p) => (
        <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, background: PHASE_COLORS[p], display: "inline-block", borderRadius: 2 }} />
          {p}
        </span>
      ))}
      <span style={{ marginLeft: 12, color: "var(--text-muted)" }}>위: 체크리스트 스택 / 아래: OECD CLI</span>
    </div>
  );
}
