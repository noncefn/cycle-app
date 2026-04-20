import type {
  IndicatorScore, MonthKey, MonthScores, Phase,
} from "../types";
import { PHASES } from "../types";
import { INDICATORS, INDICATOR_BY_KEY } from "../data/indicators";
import type { LoadedData } from "../data/loadCsv";
import { evalIndicator } from "./rules";
import { MANUAL_SCORES } from "../data/manualScores";

const HALF_MATCH_THRESHOLD = 0.5;

export function scoreMonth(data: LoadedData, month: MonthKey): MonthScores {
  const perIndicator: Record<string, IndicatorScore> = {};
  const totals: Record<Phase, number> = { 침체: 0, 회복: 0, 확장: 0, 둔화: 0 };

  for (const meta of INDICATORS) {
    const series = data.series[meta.key];
    const output = evalIndicator(meta.key, {
      key: meta.key,
      series,
      month,
      months: data.months,
    });

    // Pick main phase (max match). If all zero, main = null.
    let bestPhase: Phase | null = null;
    let bestMatch = -1;
    for (const p of PHASES) {
      const m = output[p].match;
      if (m > bestMatch) { bestMatch = m; bestPhase = p; }
    }
    const main: Phase | null = bestMatch > 0 ? bestPhase : null;

    // Side phases = any phase (other than main) whose match >= threshold.
    const side: Phase[] = [];
    for (const p of PHASES) {
      if (p === main) continue;
      if (output[p].match >= HALF_MATCH_THRESHOLD) side.push(p);
    }

    const reasons: Record<Phase, string> = {
      침체: output.침체.reason,
      회복: output.회복.reason,
      확장: output.확장.reason,
      둔화: output.둔화.reason,
    };

    perIndicator[meta.key] = { main, side, reasons };
  }

  // Overlay manual qualitative judgments (LLM / human) when present for this month.
  const manual = MANUAL_SCORES[month];
  if (manual) {
    for (const [key, override] of Object.entries(manual)) {
      perIndicator[key] = { ...override, manualJudgment: true };
    }
  }

  // Sum points from final perIndicator (post-override).
  for (const [key, score] of Object.entries(perIndicator)) {
    const meta = INDICATOR_BY_KEY[key];
    if (!meta) continue;
    if (score.main) totals[score.main] += meta.points;
    for (const p of score.side) totals[p] += meta.points / 2;
  }

  return { month, perIndicator, totals };
}

export function scoreAllMonths(data: LoadedData, monthsToScore: MonthKey[]): Record<MonthKey, MonthScores> {
  const out: Record<MonthKey, MonthScores> = {};
  for (const m of monthsToScore) out[m] = scoreMonth(data, m);
  return out;
}

// Recompute totals from an (edited) per-indicator map.
export function recomputeTotals(perIndicator: Record<string, IndicatorScore>): Record<Phase, number> {
  const totals: Record<Phase, number> = { 침체: 0, 회복: 0, 확장: 0, 둔화: 0 };
  for (const [key, score] of Object.entries(perIndicator)) {
    const meta = INDICATOR_BY_KEY[key];
    if (!meta) continue;
    if (score.main) totals[score.main] += meta.points;
    for (const p of score.side) totals[p] += meta.points / 2;
  }
  return totals;
}
