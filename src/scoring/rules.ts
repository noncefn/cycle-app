import type { Phase } from "../types";
import type { Ctx } from "./primitives";
import {
  lastN, normalizedSlope, highPct, peakRecencyFrac, troughRecencyFrac,
  anyBelow, ramp, rampDown, anyOf, allOf, fmt,
} from "./primitives";

export interface RuleResult { match: number; reason: string; }
export type IndicatorRuleOutput = Record<Phase, RuleResult>;

// ---- shared helpers ----

interface WinSummary {
  v: number | null;
  vals6: number[];
  vals12: number[];
  vals24: number[];
  slope6: number;
  slope3: number;
  peakRecent6: number;     // 1 = peak is current month; 0 = peak was 6 months ago
  troughRecent6: number;
  level24: number;         // 0..1 position within 24-month range
  level12: number;
  hadDataGap: boolean;
}

function summarize(ctx: Ctx): WinSummary {
  const w24 = lastN(ctx, 24);
  const w12 = lastN(ctx, 12);
  const w6 = lastN(ctx, 6);
  const w3 = lastN(ctx, 3);
  const vals = (arr: Array<{ v: number }>) => arr.map((x) => x.v);
  const vals24 = vals(w24);
  const vals12 = vals(w12);
  const vals6 = vals(w6);
  const vals3 = vals(w3);
  return {
    v: vals6.length ? vals6[vals6.length - 1] : null,
    vals6, vals12, vals24,
    slope6: vals6.length >= 3 ? normalizedSlope(vals6) : 0,
    slope3: vals3.length >= 2 ? normalizedSlope(vals3) : 0,
    peakRecent6: vals6.length >= 3 ? peakRecencyFrac(vals6) : 0.5,
    troughRecent6: vals6.length >= 3 ? troughRecencyFrac(vals6) : 0.5,
    level24: vals24.length >= 3 ? highPct(vals24) : 0.5,
    level12: vals12.length >= 3 ? highPct(vals12) : 0.5,
    hadDataGap: vals6.length < 4,
  };
}

// ---- pro-cyclical pattern (higher = stronger economy) ----

function evalProCyclical(ctx: Ctx, label: string, unit = ""): IndicatorRuleOutput {
  const s = summarize(ctx);
  if (s.v === null || s.vals6.length < 3) {
    return degenerate(`${label} 데이터 부족`);
  }
  const trend = `${fmt(s.slope6 * 100)}%/월 추세`;
  const valStr = `${fmt(s.v)}${unit}`;

  // 침체: slope down OR level is near bottom in 24m
  const m_침체 = anyOf(ramp(-s.slope6, 0.01, 0.08), ramp(1 - s.level24, 0.55, 0.85));
  // 회복: trough was recent (in 6m) and now turning up
  const m_회복 = anyOf(
    allOf(rampDown(s.troughRecent6, 0.0, 0.6), ramp(s.slope3, -0.02, 0.05)),
    allOf(ramp(1 - s.level12, 0.4, 0.8), ramp(s.slope3, 0, 0.05)),
  );
  // 확장: slope positive OR level near top, sustained
  const m_확장 = anyOf(ramp(s.slope6, 0.01, 0.08), ramp(s.level24, 0.55, 0.85));
  // 둔화: peaked recently and rolling over
  const m_둔화 = anyOf(
    allOf(rampDown(s.peakRecent6, 0.0, 0.6), ramp(-s.slope3, -0.02, 0.05)),
    allOf(ramp(s.level12, 0.55, 0.85), ramp(-s.slope3, 0, 0.05)),
  );

  return {
    침체: { match: m_침체, reason: `${valStr}, ${trend}, 24M 범위 상단 ${fmt(s.level24 * 100, 0)}%` },
    회복: { match: m_회복, reason: `${valStr}, 6M 저점 ${fmt((1 - s.troughRecent6) * 6, 0)}개월 전, 최근 추세 ${fmt(s.slope3 * 100)}%/월` },
    확장: { match: m_확장, reason: `${valStr}, ${trend}, 24M 상단 ${fmt(s.level24 * 100, 0)}%` },
    둔화: { match: m_둔화, reason: `${valStr}, 6M 고점 ${fmt((1 - s.peakRecent6) * 6, 0)}개월 전, 최근 추세 ${fmt(s.slope3 * 100)}%/월` },
  };
}

// ---- anti-cyclical pattern (higher = weaker economy): unrate, claims, hyoas ----

function evalAntiCyclical(ctx: Ctx, label: string, unit = ""): IndicatorRuleOutput {
  const s = summarize(ctx);
  if (s.v === null || s.vals6.length < 3) return degenerate(`${label} 데이터 부족`);

  const valStr = `${fmt(s.v)}${unit}`;

  // 침체: rising (higher-is-worse) OR was rising and now high
  const m_침체 = anyOf(ramp(s.slope6, 0.01, 0.08), ramp(s.level24, 0.55, 0.9));
  // 회복: peaked recently and rolling down
  const m_회복 = anyOf(
    allOf(rampDown(s.peakRecent6, 0.0, 0.6), ramp(-s.slope3, -0.02, 0.05)),
    allOf(ramp(s.level12, 0.55, 0.9), ramp(-s.slope3, 0, 0.05)),
  );
  // 확장: falling or sustained low
  const m_확장 = anyOf(ramp(-s.slope6, 0.01, 0.08), ramp(1 - s.level24, 0.55, 0.9));
  // 둔화: bottomed recently and turning up / or sustained-low signaling late-cycle
  const m_둔화 = anyOf(
    allOf(rampDown(s.troughRecent6, 0.0, 0.6), ramp(s.slope3, -0.02, 0.05)),
    allOf(ramp(1 - s.level24, 0.55, 0.9), ramp(s.slope3, 0, 0.03)),
  );

  return {
    침체: { match: m_침체, reason: `${valStr}, 상승 추세 ${fmt(s.slope6 * 100)}%/월, 24M 상단 ${fmt(s.level24 * 100, 0)}%` },
    회복: { match: m_회복, reason: `${valStr}, 6M 고점 ${fmt((1 - s.peakRecent6) * 6, 0)}개월 전, 최근 추세 ${fmt(s.slope3 * 100)}%/월` },
    확장: { match: m_확장, reason: `${valStr}, 하락 추세 ${fmt(-s.slope6 * 100)}%/월, 24M 하단 ${fmt((1 - s.level24) * 100, 0)}%` },
    둔화: { match: m_둔화, reason: `${valStr}, 6M 저점 ${fmt((1 - s.troughRecent6) * 6, 0)}개월 전, 최근 추세 ${fmt(s.slope3 * 100)}%/월` },
  };
}

// ---- degenerate result (data missing) ----

function degenerate(reason: string): IndicatorRuleOutput {
  return {
    침체: { match: 0, reason },
    회복: { match: 0, reason },
    확장: { match: 0, reason },
    둔화: { match: 0, reason },
  };
}

// ---- specialized rules ----

// 기준금리 (policy rate): rises late-cycle, cut during recession/recovery.
// 침체: rising into / just peaked (high level). 회복: cut from peak. 확장: flat/falling. 둔화: rising from low.
function evalFFR(ctx: Ctx): IndicatorRuleOutput {
  const s = summarize(ctx);
  if (s.v === null || s.vals12.length < 6) return degenerate("기준금리 데이터 부족");
  const valStr = `${fmt(s.v, 2)}%`;

  // peaked = max of vals12 is at least 3 months old AND current below max by > 0.25
  const hi12 = Math.max(...s.vals12);
  const dropFromPeak = hi12 - s.v;
  const peakedOut = s.peakRecent6 < 0.7 && dropFromPeak > 0.25;

  const m_침체 = anyOf(
    ramp(s.slope6, 0.005, 0.05),               // rising
    ramp(s.level24, 0.6, 0.9),                  // near cycle high
  );
  const m_회복 = anyOf(
    peakedOut ? ramp(dropFromPeak, 0.25, 1.5) : 0,
    ramp(-s.slope3, 0.005, 0.05),               // being cut
  );
  const m_확장 = anyOf(
    ramp(-s.slope6, -0.005, 0.02),              // flat or declining
    ramp(1 - s.level24, 0.5, 0.9),              // sustained low
  );
  const m_둔화 = anyOf(
    ramp(s.slope3, 0.005, 0.05),                // rising from trough
    allOf(rampDown(s.troughRecent6, 0.0, 0.6), ramp(s.slope3, 0, 0.03)),
  );

  return {
    침체: { match: m_침체, reason: `${valStr}, 추세 ${fmt(s.slope6 * 100)}%/월, 24M 상단 ${fmt(s.level24 * 100, 0)}%` },
    회복: { match: m_회복, reason: `${valStr}, 고점대비 ${fmt(dropFromPeak, 2)}%p 하락, 최근 추세 ${fmt(s.slope3 * 100)}%/월` },
    확장: { match: m_확장, reason: `${valStr}, 추세 ${fmt(s.slope6 * 100)}%/월, 24M 하단 ${fmt((1 - s.level24) * 100, 0)}%` },
    둔화: { match: m_둔화, reason: `${valStr}, 저점대비 ${fmt(s.v - Math.min(...s.vals12), 2)}%p 상승, 최근 추세 ${fmt(s.slope3 * 100)}%/월` },
  };
}

// 장단기 금리차 (term spread): 침체 needs inversion in ~12m.
// 회복: steepening (spread rising, short rate being cut faster).
// 확장: peak/flat or falling modestly. 둔화: falling and low.
function evalSpread(ctx: Ctx): IndicatorRuleOutput {
  const s = summarize(ctx);
  if (s.v === null || s.vals12.length < 4) return degenerate("장단기 금리차 데이터 부족");

  const valStr = `${fmt(s.v, 2)}%p`;
  const inverted12 = anyBelow(s.vals12, 0);

  const m_침체 = anyOf(
    inverted12 ? 1 : 0,
    ramp(-s.v, 0, 0.5),                          // currently inverted
  );
  const m_회복 = ramp(s.slope6, 0.005, 0.08);    // steepening strongly
  const m_확장 = anyOf(
    allOf(ramp(s.level24, 0.5, 0.9), rampDown(Math.abs(s.slope3), 0.005, 0.03)), // high + flat
    ramp(-s.slope6, 0.005, 0.05),                // gently falling from peak
  );
  const m_둔화 = anyOf(
    ramp(-s.slope6, 0.01, 0.08),                 // falling
    ramp(1 - s.level24, 0.5, 0.85),              // low level sustained
  );

  return {
    침체: { match: m_침체, reason: `${valStr}, 12M 내 역전 ${inverted12 ? "있음" : "없음"}` },
    회복: { match: m_회복, reason: `${valStr}, 6M 기울기 ${fmt(s.slope6 * 100)}%/월 (스티프닝)` },
    확장: { match: m_확장, reason: `${valStr}, 24M 상단 ${fmt(s.level24 * 100, 0)}%, 최근 변동 ${fmt(s.slope3 * 100)}%/월` },
    둔화: { match: m_둔화, reason: `${valStr}, 6M 기울기 ${fmt(s.slope6 * 100)}%/월, 24M 하단 ${fmt((1 - s.level24) * 100, 0)}%` },
  };
}

// 장기채 금리 (10Y yield): behavior similar to FFR but leads. Simplified rules:
// 침체: peaked out / falling / low. 회복: low sustained. 확장: rising. 둔화: high / rising to tightening.
function evalUST10(ctx: Ctx): IndicatorRuleOutput {
  const s = summarize(ctx);
  if (s.v === null || s.vals12.length < 4) return degenerate("10Y 금리 데이터 부족");
  const valStr = `${fmt(s.v, 2)}%`;

  const m_침체 = anyOf(
    ramp(-s.slope6, 0.005, 0.05),                // falling
    allOf(rampDown(s.peakRecent6, 0.0, 0.7), ramp(-s.slope3, 0, 0.03)),
  );
  const m_회복 = anyOf(
    ramp(1 - s.level24, 0.55, 0.9),              // low
    ramp(-s.slope6, -0.005, 0.03),               // flat/falling
  );
  const m_확장 = ramp(s.slope6, 0.005, 0.04);
  const m_둔화 = allOf(ramp(s.level24, 0.55, 0.9), ramp(s.slope6, 0, 0.03));

  return {
    침체: { match: m_침체, reason: `${valStr}, 6M 추세 ${fmt(s.slope6 * 100)}%/월` },
    회복: { match: m_회복, reason: `${valStr}, 24M 하단 ${fmt((1 - s.level24) * 100, 0)}%` },
    확장: { match: m_확장, reason: `${valStr}, 6M 추세 ${fmt(s.slope6 * 100)}%/월` },
    둔화: { match: m_둔화, reason: `${valStr}, 24M 상단 ${fmt(s.level24 * 100, 0)}%, 추세 ${fmt(s.slope6 * 100)}%/월` },
  };
}

// ---- dispatch ----

export function evalIndicator(key: string, ctx: Ctx): IndicatorRuleOutput {
  switch (key) {
    case "gdp":       return evalProCyclical(ctx, "실질 GDP YoY", "%");
    case "indprod":   return evalProCyclical(ctx, "산업생산 YoY", "%");
    case "capu":      return evalProCyclical(ctx, "설비가동률", "%");
    case "ism":       return evalProCyclical(ctx, "ISM", "");
    case "payrolls":  return evalProCyclical(ctx, "비농업 YoY", "%");
    case "unrate":    return evalAntiCyclical(ctx, "실업률", "%");
    case "claims":    return evalAntiCyclical(ctx, "실업수당", "");
    case "income":    return evalProCyclical(ctx, "개인소득 YoY", "%");
    case "sentiment": return evalProCyclical(ctx, "미시간심리", "");
    case "permits":   return evalProCyclical(ctx, "주택허가 YoY", "%");
    case "ffr":       return evalFFR(ctx);
    case "m2":        return evalProCyclical(ctx, "실질 M2 YoY", "%");
    case "spread":    return evalSpread(ctx);
    case "spx":       return evalProCyclical(ctx, "S&P500", "");
    case "ust10":     return evalUST10(ctx);
    case "comdty":    return evalProCyclical(ctx, "원자재", "");
    case "hyoas":     return evalAntiCyclical(ctx, "HY OAS", "%p");
    default:          return degenerate(`알 수 없는 지표: ${key}`);
  }
}
