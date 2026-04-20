import { useEffect } from "react";
import { useApp } from "./store";
import { CycleChart } from "./components/CycleChart";
import { MonthDetailPanel } from "./components/MonthDetailPanel";
import { EraPanel } from "./components/EraPanel";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { IndicatorHeatmap } from "./components/IndicatorHeatmap";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  const loading = useApp((s) => s.loading);
  const error = useApp((s) => s.error);
  const init = useApp((s) => s.init);

  useEffect(() => { init(); }, [init]);

  if (loading) return <div style={{ padding: 40 }}>데이터 로딩 중...</div>;
  if (error) return <div style={{ padding: 40, color: "var(--danger)" }}>데이터 로드 실패: {error}</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1600, margin: "0 auto" }}>
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>경기순환 국면 스코어링</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          17개 지표 × 4국면 체크리스트 기반 월별 점수 + OECD CLI 공식 국면 비교
        </p>
      </header>

      <ErrorBoundary label="차트"><CycleChart /></ErrorBoundary>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", gap: 12, marginTop: 12, alignItems: "start" }}>
        <ErrorBoundary label="월 상세"><MonthDetailPanel /></ErrorBoundary>
        <div style={{ position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <ErrorBoundary label="히트맵"><IndicatorHeatmap /></ErrorBoundary>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, marginTop: 12 }}>
        <ErrorBoundary label="CLI 구간"><EraPanel /></ErrorBoundary>
        <ErrorBoundary label="포트폴리오"><PortfolioPanel /></ErrorBoundary>
      </div>
    </div>
  );
}
