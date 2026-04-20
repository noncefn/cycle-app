import { create } from "zustand";
import type {
  Checklist, EraSegment, MonthKey, MonthScores, Phase,
} from "./types";
import { loadAllData, type LoadedData } from "./data/loadCsv";
import { parseChecklist } from "./data/parseChecklist";
import { parseEra, monthsToSegmentIndex } from "./data/parseEra";
import { scoreAllMonths, scoreMonth, recomputeTotals } from "./scoring/score";

interface AppState {
  loading: boolean;
  error: string | null;

  checklist: Checklist | null;
  eraSegments: EraSegment[];
  monthToEra: Map<MonthKey, number>;
  data: LoadedData | null;

  scoredMonths: MonthKey[];
  scores: Record<MonthKey, MonthScores>;

  selectedMonth: MonthKey | null;
  selectedEraMonth: MonthKey | null;

  init(): Promise<void>;
  selectMonth(m: MonthKey | null): void;
  selectEraMonth(m: MonthKey | null): void;
  editIndicator(month: MonthKey, key: string, update: { main?: Phase | null; side?: Phase[] }): void;
  resetMonth(month: MonthKey): void;
}

// Range we score: 2008-11 ~ 2026-03.
// Data before 2008-11 is loaded (for 24M lookback) but not scored/displayed.
const START = "2008-11";
const END = "2026-03";

function monthsInRange(allMonths: MonthKey[]): MonthKey[] {
  return allMonths.filter((m) => m >= START && m <= END);
}

export const useApp = create<AppState>((set, get) => ({
  loading: true,
  error: null,
  checklist: null,
  eraSegments: [],
  monthToEra: new Map(),
  data: null,
  scoredMonths: [],
  scores: {},
  selectedMonth: null,
  selectedEraMonth: null,

  async init() {
    try {
      const [checklistText, eraText, data] = await Promise.all([
        fetch("/data/checklist.txt").then((r) => r.text()),
        fetch("/data/era.txt").then((r) => r.text()),
        loadAllData(),
      ]);
      const checklist = parseChecklist(checklistText);
      const eraSegments = parseEra(eraText);
      const monthToEra = monthsToSegmentIndex(eraSegments);

      const scoredMonths = monthsInRange(data.months);
      const scores = scoreAllMonths(data, scoredMonths);

      // default selection: latest scored month
      const latest = scoredMonths[scoredMonths.length - 1] ?? null;

      set({
        loading: false,
        checklist,
        eraSegments,
        monthToEra,
        data,
        scoredMonths,
        scores,
        selectedMonth: latest,
        selectedEraMonth: latest,
        error: null,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  selectMonth(m) { set({ selectedMonth: m }); },
  selectEraMonth(m) { set({ selectedEraMonth: m }); },

  editIndicator(month, key, update) {
    const state = get();
    const m = state.scores[month];
    if (!m) return;
    const prev = m.perIndicator[key];
    if (!prev) return;

    const next = {
      ...prev,
      ...(update.main !== undefined ? { main: update.main } : {}),
      ...(update.side !== undefined ? { side: update.side } : {}),
      edited: true,
    };
    // If main changed to be in side, remove from side to enforce invariant.
    if (next.main && next.side.includes(next.main)) {
      next.side = next.side.filter((p) => p !== next.main);
    }

    const perIndicator = { ...m.perIndicator, [key]: next };
    const totals = recomputeTotals(perIndicator);
    const updatedMonth: MonthScores = { month, perIndicator, totals };
    set({ scores: { ...state.scores, [month]: updatedMonth } });
  },

  resetMonth(month) {
    const { data } = get();
    if (!data) return;
    const fresh = scoreMonth(data, month);
    set((s) => ({ scores: { ...s.scores, [month]: fresh } }));
  },
}));
