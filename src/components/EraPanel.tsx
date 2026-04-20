import { useApp } from "../store";
import { PHASE_COLORS, type Phase } from "../types";

export function EraPanel() {
  const selectedEraMonth = useApp((s) => s.selectedEraMonth);
  const eraSegments = useApp((s) => s.eraSegments);
  const monthToEra = useApp((s) => s.monthToEra);

  if (!selectedEraMonth) return <div className="card">아래 CLI 바를 클릭하면 구간 수익률이 나옵니다.</div>;
  const idx = monthToEra.get(selectedEraMonth);
  if (idx === undefined) return <div className="card">{selectedEraMonth}: CLI 구간을 찾을 수 없습니다.</div>;
  const seg = eraSegments[idx];

  const sorted = Object.entries(seg.returns).sort((a, b) => b[1] - a[1]);
  const color = seg.phase !== "미정" ? PHASE_COLORS[seg.phase as Phase] : "#6b7280";

  return (
    <div className="card">
      <h2 style={{ margin: 0 }}>OECD CLI 구간</h2>
      <div style={{ marginTop: 6, marginBottom: 10 }}>
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 12,
          background: color + "33", color, border: `1px solid ${color}66`, marginRight: 8,
        }}>{seg.phase === "미정" ? "국면 미정" : seg.phase}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{seg.rawLabel}</span>
      </div>
      <table>
        <thead><tr><th>자산</th><th style={{ textAlign: "right" }}>수익률</th><th></th></tr></thead>
        <tbody>
          {sorted.map(([asset, ret]) => (
            <tr key={asset}>
              <td style={{ fontWeight: 600 }}>{asset}</td>
              <td style={{ textAlign: "right", color: ret >= 0 ? "var(--success)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
              </td>
              <td style={{ width: "50%" }}>
                <ReturnBar ret={ret} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReturnBar({ ret }: { ret: number }) {
  const absMax = 50;
  const clamped = Math.max(-absMax, Math.min(absMax, ret));
  const pct = (Math.abs(clamped) / absMax) * 50;
  return (
    <div style={{ position: "relative", height: 8, background: "var(--bg-elev)", borderRadius: 2 }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "var(--border)" }} />
      <div style={{
        position: "absolute", top: 0, bottom: 0, background: ret >= 0 ? "var(--success)" : "var(--danger)",
        left: ret >= 0 ? "50%" : `${50 - pct}%`, width: `${pct}%`, borderRadius: 2,
      }} />
    </div>
  );
}
