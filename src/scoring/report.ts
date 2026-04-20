import type { EraSegment, MonthScores, Phase } from "../types";
import { PHASES } from "../types";

// ---------- Next-phase prediction ----------

export interface NextPhasePrediction {
  currentPhase: Phase;
  currentGap: number;            // top − 2nd
  predicted: Phase;
  confidence: "high" | "medium" | "low";
  scores: Array<{ phase: Phase; score: number }>;  // normalized prediction scores
  momentum: Record<Phase, number>;                 // Δ over last 3M (avg) vs current
  rationale: string[];
}

// Standard cycle rotation.
const CYCLE_NEXT: Record<Phase, Phase> = {
  침체: "회복",
  회복: "확장",
  확장: "둔화",
  둔화: "침체",
};

export function predictNextPhase(
  current: MonthScores,
  last12m: MonthScores[],
): NextPhasePrediction {
  // Current ranking
  const ranked = PHASES.map((p) => ({ phase: p, score: current.totals[p] })).sort(
    (a, b) => b.score - a.score,
  );
  const currentPhase = ranked[0].phase;
  const currentGap = ranked[0].score - ranked[1].score;

  // Momentum: current totals minus 3M-ago avg (or earliest available)
  const n = last12m.length;
  const ref = last12m[Math.max(0, n - 3)]?.totals ?? current.totals;
  const refPrev = last12m[Math.max(0, n - 6)]?.totals ?? ref;
  const momentum: Record<Phase, number> = { 침체: 0, 회복: 0, 확장: 0, 둔화: 0 };
  for (const p of PHASES) {
    const d3 = current.totals[p] - ref[p];
    const d6 = current.totals[p] - refPrev[p];
    momentum[p] = d3 * 0.6 + d6 * 0.4;
  }

  // Prediction score = current weight (0.55) + momentum (0.25) + cycle-rotation bias (+2 for next in cycle, 0.20 weight)
  const predScores: Record<Phase, number> = { 침체: 0, 회복: 0, 확장: 0, 둔화: 0 };
  for (const p of PHASES) {
    predScores[p] = current.totals[p] * 0.55 + momentum[p] * 0.25;
    if (p === CYCLE_NEXT[currentPhase]) predScores[p] += 2.0;
  }

  const predRanked = PHASES.map((p) => ({ phase: p, score: predScores[p] })).sort(
    (a, b) => b.score - a.score,
  );
  const predicted = predRanked[0].phase;
  const predGap = predRanked[0].score - predRanked[1].score;
  const confidence: NextPhasePrediction["confidence"] = predGap > 3 ? "high" : predGap > 1 ? "medium" : "low";

  const topMomentum = PHASES.slice().sort((a, b) => momentum[b] - momentum[a])[0];
  const botMomentum = PHASES.slice().sort((a, b) => momentum[a] - momentum[b])[0];

  const rationale: string[] = [];
  rationale.push(
    `현재 주 국면: ${currentPhase} (${current.totals[currentPhase].toFixed(1)}점, 2위와 격차 ${currentGap.toFixed(1)})`,
  );
  rationale.push(
    `사이클 순환 기준 다음 국면 후보: ${CYCLE_NEXT[currentPhase]} (${currentPhase}→${CYCLE_NEXT[currentPhase]})`,
  );
  rationale.push(
    `12M 모멘텀 상승폭 1위: ${topMomentum} (Δ${momentum[topMomentum].toFixed(1)}), 하락폭 1위: ${botMomentum} (Δ${momentum[botMomentum].toFixed(1)})`,
  );
  if (predGap < 1) {
    rationale.push(`예측 신뢰도 낮음 — 상위 2개 국면 점수 격차 < 1.0`);
  }

  return {
    currentPhase,
    currentGap,
    predicted,
    confidence,
    scores: predRanked,
    momentum,
    rationale,
  };
}

// ---------- Phase asset statistics ----------

export interface AssetStat {
  asset: string;
  mean: number;          // month-weighted average % return
  min: number;
  max: number;
  n: number;             // number of eras
  totalMonths: number;
}

export function computePhaseAssetStats(segments: EraSegment[], phase: Phase): AssetStat[] {
  const bucket: Record<string, { num: number; denom: number; min: number; max: number; n: number; months: number }> = {};
  for (const seg of segments) {
    if (seg.phase !== phase) continue;
    for (const [asset, ret] of Object.entries(seg.returns)) {
      const cur =
        bucket[asset] || { num: 0, denom: 0, min: Infinity, max: -Infinity, n: 0, months: 0 };
      cur.num += ret * seg.months;
      cur.denom += seg.months;
      cur.n += 1;
      cur.months += seg.months;
      if (ret < cur.min) cur.min = ret;
      if (ret > cur.max) cur.max = ret;
      bucket[asset] = cur;
    }
  }
  return Object.entries(bucket)
    .map(([asset, b]) => ({
      asset,
      mean: b.denom > 0 ? b.num / b.denom : 0,
      min: b.min,
      max: b.max,
      n: b.n,
      totalMonths: b.months,
    }))
    .sort((a, b) => b.mean - a.mean);
}

// ---------- Portfolio weights ----------

export interface AssetWeight {
  asset: string;
  weight: number;        // 0..1
  meanReturn: number;    // expected % return per era (reference)
}

export function buildWeights(stats: AssetStat[]): AssetWeight[] {
  const positives = stats.filter((s) => s.mean > 0);
  if (positives.length === 0) {
    const top = stats.slice(0, 3);
    const total = top.reduce((s, x) => s + Math.max(0.01, 1 + x.mean / 100), 0);
    return top.map((x) => ({
      asset: x.asset,
      weight: Math.max(0.01, 1 + x.mean / 100) / total,
      meanReturn: x.mean,
    }));
  }
  const total = positives.reduce((s, x) => s + x.mean, 0);
  return positives.map((x) => ({ asset: x.asset, weight: x.mean / total, meanReturn: x.mean }));
}

// ---------- Latest prices (from most recent era segment) ----------

export function getLatestPrices(segments: EraSegment[]): { label: string; prices: Record<string, number> } | null {
  if (segments.length === 0) return null;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.prices && Object.keys(seg.prices).length > 0) {
      const prices: Record<string, number> = {};
      for (const [asset, p] of Object.entries(seg.prices)) prices[asset] = p.end;
      return { label: seg.rawLabel, prices };
    }
  }
  return null;
}

// ---------- Allocation plan ----------

export interface AllocationRow {
  asset: string;
  weight: number;          // %
  meanReturn: number;      // %
  lastPrice: number | null;
  amountPerCapital: number; // $ allocated from a reference capital
  shares: number | null;    // approximate share count (price-floored)
}

export function buildAllocationPlan(
  weights: AssetWeight[],
  latestPrices: Record<string, number>,
  capital = 10_000,
): AllocationRow[] {
  return weights.map((w) => {
    const amount = w.weight * capital;
    const price = latestPrices[w.asset] ?? null;
    const shares = price && price > 0 ? Math.floor(amount / price * 1000) / 1000 : null;
    return {
      asset: w.asset,
      weight: w.weight * 100,
      meanReturn: w.meanReturn,
      lastPrice: price,
      amountPerCapital: amount,
      shares,
    };
  });
}

// ---------- Rebalancing strategy ----------

export interface RebalancingStrategy {
  triggers: string[];
  cadence: string;
  notes: string[];
}

export function buildRebalancingStrategy(prediction: NextPhasePrediction): RebalancingStrategy {
  const { currentPhase, predicted, confidence, currentGap } = prediction;

  const triggers: string[] = [];
  triggers.push(`월별 판정 시 주 국면이 ${currentPhase}에서 이탈할 때 (main phase 변경)`);
  triggers.push(
    `상위 2개 국면 점수 격차가 1.0 이하로 축소될 때 (현재 격차 ${currentGap.toFixed(1)})`,
  );
  triggers.push(
    `예측 국면 ${predicted}의 선행지표(ISM, spread, FFR, HY OAS) 중 2개 이상 주 국면 전환 시`,
  );
  triggers.push(`HY OAS가 직전 저점 대비 +1.5%p 이상 상승 시 — 크레딧 스트레스 경보`);
  triggers.push(`SPX 6M 내 -10% 조정 발생 시 — 조정장/하락장 체크 대응`);

  const cadence =
    confidence === "high"
      ? "월 1회 체크리스트 갱신 시 포트폴리오 재점검, 분기 1회 전면 리밸런싱"
      : confidence === "medium"
      ? "월 1회 재점검 + 주요 지표 임계치 도달 시 수시 조정"
      : "보수적으로 월 1회 의무 재점검, 판정 격차 축소 시 즉시 대응";

  const notes: string[] = [];
  notes.push(
    `예측 국면 ${predicted} 기반 비중은 과거 동일 국면 구간의 월 수 가중 평균 수익률 기반 (변동성/상관관계 미반영)`,
  );
  notes.push(
    `마지막 종가(era.txt 최신 구간 종가) 기준 편입 권장. 급등/급락 자산(comdty 등)은 분할 매수 고려`,
  );
  if (confidence === "low") {
    notes.push(`현재 전환기 경계 국면으로 예측 신뢰도 낮음 — 현금 10~20% 유보 권장`);
  }

  return { triggers, cadence, notes };
}
