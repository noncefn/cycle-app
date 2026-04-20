// Indicator metadata: key, label, category, points, data source mapping.
// Order matches D1 checklist.txt (① → ⑰).

export interface IndicatorMeta {
  key: string;
  label: string;
  category: string;
  points: 1 | 2;
  source: "heatmap" | "m2" | "ust10" | "hyoas" | "commodities";
  heatmapCol?: string; // column name in valley_cycle_heatmap when source=heatmap
  seriesType: "level" | "yoy" | "spread" | "yield" | "rate"; // hint for rules
}

export const INDICATORS: IndicatorMeta[] = [
  // 1. 총생산 (성장)
  { key: "gdp",       label: "실질 GDP",                category: "총생산 (성장)",  points: 1, source: "heatmap", heatmapCol: "실질 국내총생산",         seriesType: "yoy" },
  { key: "indprod",   label: "산업생산",                 category: "총생산 (성장)",  points: 1, source: "heatmap", heatmapCol: "산업생산",              seriesType: "yoy" },
  { key: "capu",      label: "설비가동률",               category: "총생산 (성장)",  points: 1, source: "heatmap", heatmapCol: "설비가동률",            seriesType: "rate" },
  { key: "ism",       label: "ISM 제조업 PMI",           category: "총생산 (성장)",  points: 1, source: "heatmap", heatmapCol: "ISM 제조업 PMI",        seriesType: "level" },

  // 2. 노동시장
  { key: "payrolls",  label: "비농업 취업자수",           category: "노동시장",       points: 1, source: "heatmap", heatmapCol: "비농업 취업자 수",       seriesType: "yoy" },
  { key: "unrate",    label: "실업률",                  category: "노동시장",       points: 1, source: "heatmap", heatmapCol: "실업률",                seriesType: "rate" },
  { key: "claims",    label: "주간 실업수당 청구건수",      category: "노동시장",       points: 1, source: "heatmap", heatmapCol: "주당 실업수당 신청건수",   seriesType: "level" },

  // 3. 소비자
  { key: "income",    label: "개인 소득",                category: "소비자",         points: 1, source: "heatmap", heatmapCol: "개인 소득",             seriesType: "yoy" },
  { key: "sentiment", label: "미시간 소비자 심리지수",      category: "소비자",         points: 1, source: "heatmap", heatmapCol: "미시간 소비자 심리지수",   seriesType: "level" },

  // 4. 주택 & 건설
  { key: "permits",   label: "주택 건설허가건수",          category: "주택 & 건설",     points: 1, source: "heatmap", heatmapCol: "주택 건설허가건수",      seriesType: "yoy" },

  // 5. 통화량 & 금리
  { key: "ffr",       label: "기준금리",                 category: "통화량 & 금리",    points: 2, source: "heatmap", heatmapCol: "기준금리",              seriesType: "rate" },
  { key: "m2",        label: "실질 M2",                  category: "통화량 & 금리",    points: 2, source: "m2",       seriesType: "yoy" },
  { key: "spread",    label: "장단기 금리차",              category: "통화량 & 금리",    points: 2, source: "heatmap", heatmapCol: "장단기 금리 (10년-3개월)", seriesType: "spread" },

  // 6. 자산군
  { key: "spx",       label: "주가지수",                 category: "자산군",         points: 2, source: "heatmap", heatmapCol: "S&P 500 지수",          seriesType: "level" },
  { key: "ust10",     label: "장기채 금리",               category: "자산군",         points: 2, source: "ust10",    seriesType: "yield" },
  { key: "comdty",    label: "원자재 가격",               category: "자산군",         points: 1, source: "commodities", seriesType: "level" },
  { key: "hyoas",     label: "하이일드 스프레드",           category: "자산군",         points: 2, source: "hyoas",    seriesType: "spread" },
];

export const INDICATOR_BY_KEY: Record<string, IndicatorMeta> = Object.fromEntries(
  INDICATORS.map((i) => [i.key, i])
);

export const INDICATOR_BY_LABEL: Record<string, IndicatorMeta> = Object.fromEntries(
  INDICATORS.map((i) => [i.label, i])
);
