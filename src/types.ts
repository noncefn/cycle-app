export type Phase = "침체" | "회복" | "확장" | "둔화";

export const PHASES: Phase[] = ["침체", "회복", "확장", "둔화"];

export const PHASE_COLORS: Record<Phase, string> = {
  침체: "#ef4444", // red
  회복: "#3b82f6", // blue
  확장: "#10b981", // green
  둔화: "#f59e0b", // amber
};

// Month key in the form "YYYY-MM"
export type MonthKey = string;

export interface IndicatorDef {
  key: string;          // e.g. "gdp"
  label: string;        // Korean label e.g. "실질 GDP"
  category: string;     // e.g. "총생산 (성장)"
  points: 1 | 2;        // 배점
  source: string;       // data source key
  questions: Record<Phase, string>; // 4 question texts
}

export interface Checklist {
  indicators: IndicatorDef[];
  totalPerPhase: number; // 23
}

export interface EraSegment {
  start: MonthKey;      // "YYYY-MM"
  end: MonthKey;
  phase: Phase | "미정";
  months: number;
  returns: Record<string, number>; // asset -> pct change
  prices?: Record<string, { start: number; end: number }>; // raw opening/closing prices
  rawLabel: string;     // original text line
}

export interface MonthScores {
  month: MonthKey;
  // per indicator key: main phase (full) + side phases (half)
  perIndicator: Record<string, IndicatorScore>;
  // summed points per phase
  totals: Record<Phase, number>;
}

export interface IndicatorScore {
  main: Phase | null;   // gets full points
  side: Phase[];        // each gets half points
  reasons: Record<Phase, string>; // reasoning per phase (auto or manual)
  edited?: boolean;           // user manually toggled this score
  manualJudgment?: boolean;   // LLM / human qualitative judgment overrides algo
}

// Raw series of numeric values keyed by month
export type MonthSeries = Map<MonthKey, number>;
