import { useEffect } from "react";
import { useApp } from "../store";
import { PHASE_COLORS, type Phase } from "../types";

export function EraModal() {
  const open = useApp((s) => s.eraModalOpen);
  const close = useApp((s) => s.closeEraModal);
  const selectedEraMonth = useApp((s) => s.selectedEraMonth);
  const eraSegments = useApp((s) => s.eraSegments);
  const monthToEra = useApp((s) => s.monthToEra);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  if (!open || !selectedEraMonth) return null;
  const idx = monthToEra.get(selectedEraMonth);
  if (idx === undefined) return null;
  const seg = eraSegments[idx];
  if (!seg) return null;

  const color = seg.phase !== "미정" ? PHASE_COLORS[seg.phase as Phase] : "#6b7280";
  const sortedReturns = Object.entries(seg.returns).sort((a, b) => b[1] - a[1]);
  const sections = seg.researchOrder ?? (seg.research ? Object.keys(seg.research) : []);

  return (
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          maxWidth: 1100, width: "100%",
          maxHeight: "90vh", overflow: "auto",
          padding: 24,
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
          position: "relative",
        }}
      >
        <button
          onClick={close}
          aria-label="닫기"
          style={{
            position: "absolute", top: 12, right: 12,
            padding: "4px 10px", fontSize: 13,
          }}
        >✕</button>

        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>OECD CLI 구간 정성 리서치</h2>
          <div style={{ marginTop: 8 }}>
            <span style={{
              display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 12,
              background: color + "33", color, border: `1px solid ${color}66`, marginRight: 8,
            }}>{seg.phase === "미정" ? "국면 미정" : seg.phase}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{seg.rawLabel}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)", gap: 20 }}>
          {/* Returns table */}
          <div>
            <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>구간 자산 수익률</h3>
            <table>
              <thead><tr><th>자산</th><th style={{ textAlign: "right" }}>수익률</th><th></th></tr></thead>
              <tbody>
                {sortedReturns.map(([asset, ret]) => (
                  <tr key={asset}>
                    <td style={{ fontWeight: 600 }}>{asset}</td>
                    <td style={{
                      textAlign: "right",
                      color: ret >= 0 ? "var(--success)" : "var(--danger)",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
                    </td>
                    <td style={{ width: "55%" }}>
                      <ReturnBar ret={ret} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Research sections */}
          <div>
            <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>정성 리서치 (6관점)</h3>
            {sections.length === 0 ? (
              <div style={{
                padding: 16, color: "var(--text-muted)", fontSize: 13,
                background: "var(--bg-elev)", borderRadius: 6, border: "1px dashed var(--border)",
              }}>
                이 구간에는 리서치가 작성되어 있지 않습니다.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sections.map((label) => {
                  const body = seg.research?.[label] ?? "";
                  return (
                    <div key={label} style={{
                      background: "var(--bg-elev)",
                      border: "1px solid var(--border-subtle)",
                      borderLeft: `3px solid ${color}`,
                      borderRadius: 6,
                      padding: "10px 12px",
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: "var(--text)",
                        marginBottom: 4, letterSpacing: 0.2,
                      }}>{label}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}>
                        {body}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReturnBar({ ret }: { ret: number }) {
  const absMax = 50;
  const clamped = Math.max(-absMax, Math.min(absMax, ret));
  const pct = (Math.abs(clamped) / absMax) * 50;
  return (
    <div style={{ position: "relative", height: 8, background: "var(--bg-subtle)", borderRadius: 2 }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "var(--border)" }} />
      <div style={{
        position: "absolute", top: 0, bottom: 0,
        background: ret >= 0 ? "var(--success)" : "var(--danger)",
        left: ret >= 0 ? "50%" : `${50 - pct}%`,
        width: `${pct}%`, borderRadius: 2,
      }} />
    </div>
  );
}
