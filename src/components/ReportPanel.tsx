import { useMemo } from "react";
import { useApp } from "../store";
import { PHASES, PHASE_COLORS, type Phase } from "../types";
import {
  predictNextPhase,
  computePhaseAssetStats,
  buildWeights,
  buildAllocationPlan,
  buildRebalancingStrategy,
  getLatestPrices,
} from "../scoring/report";

const DEFAULT_CAPITAL = 10_000;

function phaseBadge(p: Phase, opts?: { large?: boolean }) {
  const large = opts?.large;
  return (
    <span
      style={{
        display: "inline-block",
        padding: large ? "4px 14px" : "1px 8px",
        borderRadius: 4,
        background: PHASE_COLORS[p] + "33",
        color: PHASE_COLORS[p],
        border: `1px solid ${PHASE_COLORS[p]}66`,
        fontWeight: large ? 700 : 500,
        fontSize: large ? 14 : 12,
      }}
    >
      {p}
    </span>
  );
}

export function ReportPanel() {
  const scoredMonths = useApp((s) => s.scoredMonths);
  const scores = useApp((s) => s.scores);
  const segments = useApp((s) => s.eraSegments);

  const report = useMemo(() => {
    if (scoredMonths.length === 0) return null;
    const latestMonth = scoredMonths[scoredMonths.length - 1];
    const latestScores = scores[latestMonth];
    if (!latestScores) return null;

    // Last 12 months (excluding current)
    const last12m = scoredMonths
      .slice(Math.max(0, scoredMonths.length - 13), scoredMonths.length - 1)
      .map((m) => scores[m])
      .filter(Boolean);

    const prediction = predictNextPhase(latestScores, last12m);
    const predictedPhase = prediction.predicted;
    const stats = computePhaseAssetStats(segments, predictedPhase as Phase);
    const weights = buildWeights(stats);
    const latest = getLatestPrices(segments);
    const latestPrices = latest?.prices ?? {};
    const allocation = buildAllocationPlan(weights, latestPrices, DEFAULT_CAPITAL);
    const rebalancing = buildRebalancingStrategy(prediction);

    return {
      latestMonth,
      latestScores,
      prediction,
      predictedPhase,
      stats,
      allocation,
      latestPriceLabel: latest?.label ?? null,
      rebalancing,
    };
  }, [scoredMonths, scores, segments]);

  if (!report) {
    return (
      <div className="card">
        <h2 style={{ margin: 0 }}>투자 보고서</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const { latestMonth, latestScores, prediction, predictedPhase, allocation, latestPriceLabel, rebalancing } = report;

  const totalAmount = allocation.reduce((s, a) => s + a.amountPerCapital, 0);

  const confidenceColor =
    prediction.confidence === "high" ? "var(--success)" : prediction.confidence === "medium" ? "var(--warn)" : "var(--danger)";

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>투자 보고서 — {latestMonth} 기준</h2>
        <button className="primary" onClick={() => window.print()} style={{ whiteSpace: "nowrap" }}>
          인쇄
        </button>
      </div>

      {/* Section 1: 현재 판정 요약 */}
      <section style={{ marginTop: 16 }}>
        <h3>1. 현재 국면 판정 ({latestMonth})</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>주 국면:</span>
          {phaseBadge(prediction.currentPhase, { large: true })}
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            (2위 격차 {prediction.currentGap.toFixed(1)}점)
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>국면</th>
              <th style={{ textAlign: "right" }}>점수</th>
              <th style={{ textAlign: "right" }}>12M Δ</th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map((p) => (
              <tr key={p}>
                <td>{phaseBadge(p)}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {latestScores.totals[p].toFixed(1)}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: prediction.momentum[p] >= 0 ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {prediction.momentum[p] >= 0 ? "+" : ""}
                  {prediction.momentum[p].toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 2: 다음 국면 예측 */}
      <section style={{ marginTop: 20 }}>
        <h3>2. 다음 국면 예측</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>예측:</span>
          {phaseBadge(predictedPhase as Phase, { large: true })}
          <span style={{ color: confidenceColor, fontWeight: 600, fontSize: 13 }}>
            신뢰도 {prediction.confidence === "high" ? "높음" : prediction.confidence === "medium" ? "중간" : "낮음"}
          </span>
        </div>
        <div style={{ background: "var(--bg-elev)", padding: 10, borderRadius: 4, fontSize: 12, marginBottom: 10 }}>
          <strong style={{ fontSize: 11, color: "var(--text-muted)" }}>예측 근거</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {prediction.rationale.map((r, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{r}</li>
            ))}
          </ul>
        </div>
        <table>
          <thead>
            <tr>
              <th>국면</th>
              <th style={{ textAlign: "right" }}>예측 점수 (가중)</th>
            </tr>
          </thead>
          <tbody>
            {prediction.scores.map(({ phase, score }) => (
              <tr key={phase}>
                <td>{phaseBadge(phase)}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 3: 추천 포트폴리오 */}
      <section style={{ marginTop: 20 }}>
        <h3>3. 추천 자산 배분 — 예측 국면 {predictedPhase} 기반</h3>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
          기준 자본: ${DEFAULT_CAPITAL.toLocaleString()} · 종가 참고: {latestPriceLabel ?? "-"}
        </p>
        {allocation.length === 0 ? (
          <p style={{ color: "var(--danger)", fontSize: 13 }}>
            예측 국면({predictedPhase})에 해당하는 자산 통계가 없습니다.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>자산</th>
                <th style={{ textAlign: "right" }}>비중</th>
                <th style={{ textAlign: "right" }}>배분 ($)</th>
                <th style={{ textAlign: "right" }}>종가</th>
                <th style={{ textAlign: "right" }}>수량</th>
                <th style={{ textAlign: "right" }}>과거 평균</th>
              </tr>
            </thead>
            <tbody>
              {allocation.map((a) => (
                <tr key={a.asset}>
                  <td style={{ fontWeight: 600 }}>{a.asset}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{a.weight.toFixed(1)}%</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    ${a.amountPerCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {a.lastPrice !== null ? a.lastPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {a.shares !== null ? a.shares.toFixed(3) : "-"}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: a.meanReturn >= 0 ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {a.meanReturn >= 0 ? "+" : ""}
                    {a.meanReturn.toFixed(2)}%
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={{ fontWeight: 700 }}>합계</td>
                <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {allocation.reduce((s, a) => s + a.weight, 0).toFixed(1)}%
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  ${totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Section 4: 리밸런싱 전략 */}
      <section style={{ marginTop: 20 }}>
        <h3>4. 리밸런싱 전략</h3>
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          <strong>점검 주기:</strong> {rebalancing.cadence}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>트리거 조건</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
            {rebalancing.triggers.map((t, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{t}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong style={{ fontSize: 13 }}>참고 사항</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-muted)" }}>
            {rebalancing.notes.map((n, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{n}</li>
            ))}
          </ul>
        </div>
      </section>

      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.5 }}>
        본 보고서는 과거 OECD CLI 국면 구간의 자산군 수익률 기반 휴리스틱 분석입니다. 복리/변동성/상관관계 미반영, 과거 성과가 미래를 보장하지 않습니다. 투자 판단 참고 용도로만 사용하세요.
      </p>
    </div>
  );
}
