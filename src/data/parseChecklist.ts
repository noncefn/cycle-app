import type { Checklist, IndicatorDef, Phase } from "../types";
import { INDICATORS } from "./indicators";

const CIRCLED = [
  "①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩",
  "⑪","⑫","⑬","⑭","⑮","⑯","⑰",
];

const PHASE_TAGS: Phase[] = ["침체", "회복", "확장", "둔화"];

export function parseChecklist(text: string): Checklist {
  const lines = text.split(/\r?\n/);

  // Walk lines; when we see a circled-number header, capture its label and the
  // next 4 question lines (one per phase).
  const byLabel: Record<string, Partial<Record<Phase, string>>> = {};
  let currentLabel: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const c = line[0];
    if (CIRCLED.includes(c)) {
      // e.g., "① 실질 GDP · 1점"
      const afterCircle = line.slice(1).trim();
      const label = afterCircle.split("·")[0].trim();
      currentLabel = label;
      byLabel[label] = {};
      continue;
    }

    if (!currentLabel) continue;

    // question line: "1. [침체] ..."
    const m = line.match(/^(\d)\.\s*\[(침체|회복|확장|둔화)\]\s*(.+)$/);
    if (m) {
      const phase = m[2] as Phase;
      const text = m[3].trim();
      byLabel[currentLabel][phase] = text;
    }
  }

  const indicators: IndicatorDef[] = INDICATORS.map((meta) => {
    const qs = byLabel[meta.label];
    if (!qs) throw new Error(`checklist 파싱 실패: 지표 "${meta.label}" 질문을 찾을 수 없음`);
    const missing = PHASE_TAGS.filter((p) => !qs[p]);
    if (missing.length)
      throw new Error(`checklist 파싱 실패: "${meta.label}" 에서 ${missing.join(",")} 질문 누락`);
    return {
      key: meta.key,
      label: meta.label,
      category: meta.category,
      points: meta.points,
      source: meta.source,
      questions: qs as Record<Phase, string>,
    };
  });

  const totalPerPhase = indicators.reduce((s, i) => s + i.points, 0);
  return { indicators, totalPerPhase };
}
