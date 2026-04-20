import type { EraSegment, Phase } from "../types";

// Parse era.txt — OECD CLI phase segments with asset returns.
//
// Format examples:
//   "2008년 11월 ~ 2009년 03월 침체기 (5개월)"
//   "2024년 06월 침체기 (1개월)"  (single-month)
//   "2026년 04월 01일 ~ 2026년 04월 19일 국면 미정 (19일)"
//   "* SPX: 968.67 → 797.87 (-17.63%)"

const PHASE_MAP: Record<string, Phase> = {
  침체기: "침체",
  회복기: "회복",
  확장기: "확장",
  둔화기: "둔화",
};

const MONTH_RE = /(\d{4})년\s*(\d{1,2})월/g;

function mkKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function parseHeader(line: string): Omit<EraSegment, "returns"> | null {
  // Collect all YYYY년 MM월 tokens
  const matches = [...line.matchAll(MONTH_RE)];
  if (matches.length === 0) return null;

  const first = matches[0];
  const last = matches[matches.length - 1];
  const startY = Number(first[1]);
  const startM = Number(first[2]);
  const endY = Number(last[1]);
  const endM = Number(last[2]);

  let phase: Phase | "미정" = "미정";
  for (const [ko, p] of Object.entries(PHASE_MAP)) {
    if (line.includes(ko)) {
      phase = p;
      break;
    }
  }
  if (phase === "미정" && !line.includes("국면 미정")) return null;

  // Duration: "(5개월)" or "(19일)"
  let months = 0;
  const mm = line.match(/\((\d+)개월\)/);
  if (mm) months = Number(mm[1]);
  else {
    // partial period — count by month span
    months = (endY - startY) * 12 + (endM - startM) + 1;
  }

  return {
    start: mkKey(startY, startM),
    end: mkKey(endY, endM),
    phase,
    months,
    rawLabel: line.trim(),
  };
}

function parseReturn(line: string): { asset: string; pct: number; start: number; end: number } | null {
  // "* SPX: 968.67 → 797.87 (-17.63%)"
  const m = line.match(/^\*\s*([A-Z0-9]+)\s*:\s*([\d.,]+)\s*→\s*([\d.,]+)\s*\(([+-]?\d+(?:\.\d+)?)%\)/);
  if (!m) return null;
  return {
    asset: m[1],
    start: Number(m[2].replace(/,/g, "")),
    end: Number(m[3].replace(/,/g, "")),
    pct: Number(m[4]),
  };
}

export function parseEra(text: string): EraSegment[] {
  const lines = text.split(/\r?\n/);
  const segments: EraSegment[] = [];
  let current: (Omit<EraSegment, "returns" | "prices"> & { returns: Record<string, number>; prices: Record<string, { start: number; end: number }> }) | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("*")) {
      const r = parseReturn(line);
      if (r && current) {
        current.returns[r.asset] = r.pct;
        current.prices[r.asset] = { start: r.start, end: r.end };
      }
      continue;
    }

    const header = parseHeader(line);
    if (header) {
      if (current) segments.push(current);
      current = { ...header, returns: {}, prices: {} };
    }
  }
  if (current) segments.push(current);

  return segments;
}

// Expand segments into a month → segment-index mapping.
// Note: partial-period segments like "2026-04-01 ~ 2026-04-19 국면 미정" are
// treated as covering just that one month (2026-04). Adjacent overlapping
// claims over the same YYYY-MM should not occur in a clean dataset.
export function monthsToSegmentIndex(segments: EraSegment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const [sy, sm] = s.start.split("-").map(Number);
    const [ey, em] = s.end.split("-").map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!out.has(key)) out.set(key, i);
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }
  return out;
}
