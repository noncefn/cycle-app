import type { MonthKey, MonthSeries } from "../types";

export interface Ctx {
  key: string;            // indicator key
  series: MonthSeries;    // canonical series (what rules read)
  month: MonthKey;        // current month under evaluation
  months: MonthKey[];     // sorted union of all months (not just series keys)
}

// ---- series-window helpers ----

export function valueAt(s: MonthSeries, m: MonthKey): number | null {
  const v = s.get(m);
  return v === undefined ? null : v;
}

/**
 * Return the last `n` monthly values ending at (and including) `month`,
 * keeping only months where the series has a value. Uses the global months
 * axis so we step through gaps consistently.
 */
export function lastN(ctx: Ctx, n: number): Array<{ k: MonthKey; v: number }> {
  const idx = ctx.months.indexOf(ctx.month);
  if (idx < 0) return [];
  const start = Math.max(0, idx - n + 1);
  const out: Array<{ k: MonthKey; v: number }> = [];
  for (let i = start; i <= idx; i++) {
    const k = ctx.months[i];
    const v = ctx.series.get(k);
    if (v !== undefined) out.push({ k, v });
  }
  return out;
}

// ---- primitives ----

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const v of xs) s += v;
  return s / xs.length;
}

export function linSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Ratio of linear slope to typical magnitude — in units of "per-month fraction". */
export function normalizedSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const s = linSlope(values);
  const scale = Math.max(1e-6, mean(values.map((v) => Math.abs(v))));
  return s / scale;
}

/** Location of current value within window: 0 = min, 1 = max. */
export function highPct(values: number[]): number {
  if (values.length < 2) return 0.5;
  const last = values[values.length - 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return 0.5;
  return (last - lo) / (hi - lo);
}

/** Max drop from any point in window down to last. Unit: value magnitude. */
export function maxDropFromPeak(values: number[]): number {
  if (values.length < 2) return 0;
  const last = values[values.length - 1];
  const hi = Math.max(...values);
  return hi - last;
}
export function maxRiseFromTrough(values: number[]): number {
  if (values.length < 2) return 0;
  const last = values[values.length - 1];
  const lo = Math.min(...values);
  return last - lo;
}

/** How close to the recent peak was `window` ago → 1 means peak was recent. */
export function peakRecencyFrac(values: number[]): number {
  if (values.length < 2) return 0;
  const hiIdx = values.indexOf(Math.max(...values));
  return hiIdx / (values.length - 1);
}
export function troughRecencyFrac(values: number[]): number {
  if (values.length < 2) return 0;
  const loIdx = values.indexOf(Math.min(...values));
  return loIdx / (values.length - 1);
}

// Does any value in the window dip below a threshold? Useful for inversion.
export function anyBelow(values: number[], threshold: number): boolean {
  return values.some((v) => v < threshold);
}

// ---- match scoring helpers ----

/** 0 if x <= a, 1 if x >= b, linear between. */
export function ramp(x: number, a: number, b: number): number {
  if (x <= a) return 0;
  if (x >= b) return 1;
  return (x - a) / (b - a);
}

/** Mirror of ramp: 1 below a, 0 above b. */
export function rampDown(x: number, a: number, b: number): number {
  return 1 - ramp(x, a, b);
}

/** Combine multiple sub-matches (OR semantics by taking max). */
export function anyOf(...xs: number[]): number {
  return xs.reduce((m, x) => Math.max(m, x), 0);
}

/** Combine (AND — take min). */
export function allOf(...xs: number[]): number {
  return xs.reduce((m, x) => Math.min(m, x), 1);
}

/** Format a number for reason strings. */
export function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "N/A";
  return n.toFixed(digits);
}
