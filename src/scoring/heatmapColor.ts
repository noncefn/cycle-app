// Heatmap cell coloring: direction-aware 60-month trailing percentile.
//
// Procyclical indicators (higher value = stronger economy): green-ish at high pct.
// Anticyclical indicators (higher value = weaker economy): red-ish at high pct.

export type Direction = "pro" | "anti";

export const INDICATOR_DIRECTION: Record<string, Direction> = {
  gdp: "pro",
  indprod: "pro",
  capu: "pro",
  ism: "pro",
  payrolls: "pro",
  unrate: "anti",
  claims: "anti",
  income: "pro",
  sentiment: "pro",
  permits: "pro",
  ffr: "anti",      // higher policy rate = tighter
  m2: "pro",
  spread: "pro",    // positive term spread = healthy
  spx: "pro",
  ust10: "anti",    // higher long yield = tighter financial conditions
  comdty: "pro",
  hyoas: "anti",    // higher HY spread = stress
};

/** Percentile rank (0..1) of `val` within `vals`. */
export function percentileRank(vals: number[], val: number): number {
  if (vals.length === 0) return 0.5;
  let lt = 0;
  let eq = 0;
  for (const v of vals) {
    if (v < val) lt++;
    else if (v === val) eq++;
  }
  return (lt + eq / 2) / vals.length;
}

/**
 * Map (value, trailing-window) to a CSS rgba string suitable for cell backgrounds.
 * Uses procyclical semantics by default; pass direction="anti" to invert.
 */
export function cellBg(pctRaw: number, direction: Direction): string {
  const pct = direction === "pro" ? pctRaw : 1 - pctRaw;
  const dev = pct - 0.5;                     // -0.5 .. 0.5
  const alpha = Math.min(0.65, Math.abs(dev) * 1.4);
  if (dev >= 0) return `rgba(52, 211, 153, ${alpha.toFixed(3)})`;   // success-green
  return `rgba(248, 113, 113, ${alpha.toFixed(3)})`;                 // danger-red
}

/** Text color: lighten cell text for low-alpha cells, darken for strong. */
export function cellFg(pctRaw: number, direction: Direction): string {
  const pct = direction === "pro" ? pctRaw : 1 - pctRaw;
  const dev = Math.abs(pct - 0.5);
  // For very strong cells, use white on top of color. Otherwise use main text.
  return dev > 0.35 ? "#fff" : "var(--text)";
}
