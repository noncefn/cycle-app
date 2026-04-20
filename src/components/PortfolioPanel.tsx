import { useMemo, useState } from "react";
import { useApp } from "../store";
import { PHASES, PHASE_COLORS, type EraSegment, type Phase } from "../types";

interface AssetStats {
  asset: string;
  mean: number;     // weighted average % return over same-phase eras
  min: number;
  max: number;
  n: number;
  totalMonths: number;
}

function asset_stats(segments: EraSegment[], phase: Phase): AssetStats[] {
  const bucket: Record<string, { num: number; denom: number; min: number; max: number; n: number; months: number }> = {};
  for (const seg of segments) {
    if (seg.phase !== phase) continue;
    for (const [asset, ret] of Object.entries(seg.returns)) {
      const cur = bucket[asset] || { num: 0, denom: 0, min: Infinity, max: -Infinity, n: 0, months: 0 };
      cur.num += ret * seg.months;
      cur.denom += seg.months;
      cur.n += 1;
      cur.months += seg.months;
      if (ret < cur.min) cur.min = ret;
      if (ret > cur.max) cur.max = ret;
      bucket[asset] = cur;
    }
  }
  return Object.entries(bucket).map(([asset, b]) => ({
    asset,
    mean: b.denom > 0 ? b.num / b.denom : 0,
    min: b.min,
    max: b.max,
    n: b.n,
    totalMonths: b.months,
  })).sort((a, b) => b.mean - a.mean);
}

function buildWeights(stats: AssetStats[]): Array<{ asset: string; weight: number }> {
  // Only include assets with positive weighted-mean return in this phase.
  const positives = stats.filter((s) => s.mean > 0);
  if (positives.length === 0) {
    // fallback: top 3 by mean (capital preservation — still weight them)
    const top = stats.slice(0, 3);
    const total = top.reduce((s, x) => s + Math.max(0.01, 1 + x.mean / 100), 0);
    return top.map((x) => ({ asset: x.asset, weight: Math.max(0.01, 1 + x.mean / 100) / total }));
  }
  // Weight ∝ mean (linear). Could switch to softmax for smoother.
  const total = positives.reduce((s, x) => s + x.mean, 0);
  return positives.map((x) => ({ asset: x.asset, weight: x.mean / total }));
}

function dominantPhase(totals: Record<Phase, number>): Phase {
  let best: Phase = "침체";
  let bestV = -Infinity;
  for (const p of PHASES) {
    if (totals[p] > bestV) { bestV = totals[p]; best = p; }
  }
  return best;
}

export function PortfolioPanel() {
  const selectedMonth = useApp((s) => s.selectedMonth);
  const scoredMonths = useApp((s) => s.scoredMonths);
  const scores = useApp((s) => s.scores);
  const segments = useApp((s) => s.eraSegments);
  const [open, setOpen] = useState(false);

  const targetMonth = selectedMonth || scoredMonths[scoredMonths.length - 1];
  const monthScore = targetMonth ? scores[targetMonth] : undefined;

  const analysis = useMemo(() => {
    if (!monthScore) return null;
    const phase = dominantPhase(monthScore.totals);
    const stats = asset_stats(segments, phase);
    const weights = buildWeights(stats);
    return { phase, stats, weights };
  }, [monthScore, segments]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>포트폴리오</h2>
        <button className="primary" onClick={() => setOpen(true)} disabled={!analysis}>
          포트폴리오 생성
        </button>
      </div>

      {open && analysis && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>{targetMonth}</strong> 우세 국면:{" "}
            <span style={{
              display: "inline-block", padding: "1px 8px", borderRadius: 3,
              background: PHASE_COLORS[analysis.phase] + "33",
              color: PHASE_COLORS[analysis.phase],
              border: `1px solid ${PHASE_COLORS[analysis.phase]}66`,
            }}>{analysis.phase}</span>
            <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>
              (과거 동일 국면 구간 {new Set(segments.filter(s => s.phase === analysis.phase)).size}개 집계)
            </span>
          </div>

          <h3>제안 비중</h3>
          <table>
            <thead><tr><th>자산</th><th style={{ textAlign: "right" }}>비중</th><th style={{ textAlign: "right" }}>과거 평균</th></tr></thead>
            <tbody>
              {analysis.weights.map((w) => {
                const st = analysis.stats.find((s) => s.asset === w.asset)!;
                return (
                  <tr key={w.asset}>
                    <td style={{ fontWeight: 600 }}>{w.asset}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{(w.weight * 100).toFixed(1)}%</td>
                    <td style={{ textAlign: "right", color: st.mean >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                      {st.mean >= 0 ? "+" : ""}{st.mean.toFixed(2)}% ({st.n}회)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 style={{ marginTop: 12 }}>전체 자산군 통계 (가중 평균 = 월 수 가중)</h3>
          <table>
            <thead><tr><th>자산</th><th style={{ textAlign: "right" }}>평균</th><th style={{ textAlign: "right" }}>최소</th><th style={{ textAlign: "right" }}>최대</th><th style={{ textAlign: "right" }}>구간 수</th><th style={{ textAlign: "right" }}>월 합계</th></tr></thead>
            <tbody>
              {analysis.stats.map((s) => (
                <tr key={s.asset}>
                  <td style={{ fontWeight: 600 }}>{s.asset}</td>
                  <td style={{ textAlign: "right", color: s.mean >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}>{s.mean >= 0 ? "+" : ""}{s.mean.toFixed(2)}%</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.min.toFixed(2)}%</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.max.toFixed(2)}%</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.n}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.totalMonths}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            비중은 양의 평균 수익률을 가진 자산에 대해 평균 비율로 배분합니다. 구간 수익률의 단순 누적이며, 복리/변동성/상관관계는 반영되지 않았습니다.
          </p>
        </div>
      )}
    </div>
  );
}
