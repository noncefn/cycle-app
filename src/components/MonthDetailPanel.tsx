import { useApp } from "../store";
import type { IndicatorDef } from "../types";
import { PHASES, PHASE_COLORS, type Phase } from "../types";
import { MANUAL_COMMENTARY } from "../data/manualCommentary";

export function MonthDetailPanel() {
  const month = useApp((s) => s.selectedMonth);
  const scores = useApp((s) => s.scores);
  const edit = useApp((s) => s.editIndicator);
  const reset = useApp((s) => s.resetMonth);
  const checklist = useApp((s) => s.checklist);

  if (!month) return <div className="card">월을 선택하세요.</div>;
  const ms = scores[month];
  if (!ms) return <div className="card">{month} 점수 없음.</div>;
  if (!checklist) return <div className="card">체크리스트 로딩 중...</div>;

  const byCategory: Record<string, IndicatorDef[]> = {};
  for (const ind of checklist.indicators) {
    (byCategory[ind.category] ||= []).push(ind);
  }

  return (
    <div className="card" style={{ overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{month} 체크리스트</h2>
        <button onClick={() => reset(month)} style={{ fontSize: 12 }}>자동 채점으로 복원</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 10, fontSize: 12 }}>
        {PHASES.map((p) => (
          <div key={p} style={{ padding: "6px 8px", background: PHASE_COLORS[p] + "22", border: `1px solid ${PHASE_COLORS[p]}66`, borderRadius: 4 }}>
            <div style={{ color: PHASE_COLORS[p], fontWeight: 600 }}>{p}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{ms.totals[p].toFixed(1)}</div>
          </div>
        ))}
      </div>

      {Object.entries(byCategory).map(([cat, inds]) => (
        <div key={cat} style={{ marginBottom: 10 }}>
          <h3 style={{ margin: "6px 0", fontSize: 12, color: "var(--text-muted)" }}>{cat}</h3>
          {inds.map((ind) => {
            const score = ms.perIndicator[ind.key];
            if (!score) return null;
            return (
              <div key={ind.key} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>
                    {ind.label} <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 11 }}>({ind.points}점)</span>
                    {score.manualJudgment && !score.edited && (
                      <span style={{ fontSize: 10, marginLeft: 4, padding: "1px 5px", borderRadius: 3, background: "var(--accent)", color: "#fff" }}>AI 판정</span>
                    )}
                    {score.edited && <span style={{ fontSize: 10, marginLeft: 4, color: "var(--accent)" }}>수정됨</span>}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, fontSize: 11, marginTop: 4 }}>
                  {PHASES.map((p) => {
                    const isMain = score.main === p;
                    const isSide = score.side.includes(p);
                    const pts = isMain ? ind.points : isSide ? ind.points / 2 : 0;
                    return (
                      <button
                        key={p}
                        onClick={() => toggleScore(p, score.main, score.side, ind.key, edit, month)}
                        style={{
                          textAlign: "left",
                          padding: 4,
                          border: `1px solid ${isMain ? PHASE_COLORS[p] : "var(--border)"}`,
                          background: isMain ? PHASE_COLORS[p] + "33" : isSide ? PHASE_COLORS[p] + "18" : "var(--bg-elev)",
                          borderRadius: 4,
                          cursor: "pointer",
                          color: "var(--text)",
                        }}
                        title={score.reasons?.[p] ?? ""}
                      >
                        <div style={{ fontWeight: 600, color: PHASE_COLORS[p] }}>
                          {p} · {pts}점 {isMain ? "●" : isSide ? "◐" : "○"}
                        </div>
                        <div style={{ color: "var(--text)", marginTop: 2, lineHeight: 1.3, fontSize: 10 }}>
                          {ind.questions?.[p] ?? ""}
                        </div>
                        <div style={{ color: "var(--text-muted)", marginTop: 2, fontSize: 10 }}>
                          근거: {score.reasons?.[p] ?? ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
        클릭하여 순환: ○ 비해당 → ◐ 부(Half) → ● 주(Full) → ○. 주 국면은 지표당 1개만.
      </div>

      {MANUAL_COMMENTARY[month] && (
        <div style={{
          marginTop: 12, padding: "10px 12px",
          background: "var(--bg-elev)",
          border: "1px solid var(--border-subtle)",
          borderLeft: "3px solid var(--accent)",
          borderRadius: 4,
          fontSize: 12, lineHeight: 1.55, color: "var(--text)",
        }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 }}>
            총정리
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{MANUAL_COMMENTARY[month]}</div>
        </div>
      )}
    </div>
  );
}

function toggleScore(
  p: Phase,
  main: Phase | null,
  side: Phase[],
  key: string,
  edit: (month: string, key: string, update: { main?: Phase | null; side?: Phase[] }) => void,
  month: string,
) {
  // cycle: none → half → full → none
  const isMain = main === p;
  const isSide = side.includes(p);

  if (!isMain && !isSide) {
    // Add to side
    edit(month, key, { side: [...side, p] });
  } else if (isSide) {
    // Promote to main: remove from side, set as main (previous main moves to side)
    const newSide = side.filter((x) => x !== p);
    if (main) newSide.push(main);
    edit(month, key, { main: p, side: newSide });
  } else if (isMain) {
    // Clear main
    edit(month, key, { main: null, side });
  }
}
