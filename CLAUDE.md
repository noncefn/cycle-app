# 경기순환 스코어링 앱

## 무엇인가
17지표 × 4국면 체크리스트 기반 월별 스코어링 + OECD CLI 공식 국면 비교 + 국면별 과거 자산군 수익률 기반 포트폴리오 제안. 순수 프론트엔드 (Vite + React + TS + zustand), 백엔드 없음.

## 개발
- 루트: `/Users/hans/Desktop/cycle-app`
- dev: `npm run dev` (port 5173) — `.claude/launch.json` 으로 Preview MCP 통합
- 타입 체크: `npx tsc --noEmit`
- 데이터 원본: `~/Desktop/국면데이터/`, 앱 사본: `public/data/` (양쪽 동기화 필요)

## 파일 맵
- `src/types.ts` — 도메인 타입 (Phase, IndicatorScore, EraSegment 등)
- `src/data/indicators.ts` — 17지표 메타 (키/라벨/카테고리/배점/데이터소스)
- `src/data/loadCsv.ts` — CSV 5개 파싱 + 월별 시계열 빌드
- `src/data/parseChecklist.ts`, `parseEra.ts` — D1/D2 텍스트 파서
- `src/data/manualScores.ts` — LLM/휴먼 정성 판정 오버라이드 ★ algo보다 우선
- `src/scoring/primitives.ts` — 계산 원시함수 (slope/percentile/recency 등)
- `src/scoring/rules.ts` — 17지표 × 4국면 알고리즘 룰
- `src/scoring/score.ts` — `scoreMonth`: rules → manualScores 덮어쓰기 → totals 재계산
- `src/scoring/heatmapColor.ts` — 히트맵 셀 색상 유틸
- `src/store.ts` — zustand 글로벌 상태
- `src/components/` — CycleChart / MonthDetailPanel / IndicatorHeatmap / EraPanel / PortfolioPanel / ErrorBoundary

## 도메인 규칙 (코드에서 안 보이는 것)
- 각 지표는 **주 국면 정확히 1개** (Full 점수) + **부 국면 0개 이상** (Half 점수)
- 배점: 1점짜리 11개 + 2점짜리 6개 = **국면당 만점 23점**
- 스코어링 표시 범위: **2008-11 ~ 2026-03** (OECD CLI 첫 구간 기준)
- 데이터 로드 범위: **2006-01~** (24M lookback 용, 채점엔 미노출)
- 점수 경로: **algo rules → manualScores 오버레이 → 사용자 수동 편집(edited)**
- Phase 컬러: 침체 red / 회복 blue / 확장 green / 둔화 amber
- 테마: **다크만** (CSS 변수는 `src/index.css` 에 정의)

## 데이터 소스 & 주의사항
- `valley_cycle_heatmap.csv`: 14지표, 월별, `"YYYY년 MM월"` 포맷. **ISM PMI 2006-01~2007-11은 수동 보충된 값**
- `M2REAL.csv`: 실질 M2 레벨 (YoY 계산 필요)
- `GlobalCommoditiesIndex.csv`: 월별 레벨
- `US_10Y_Treasury_Yield.csv`, `ICE_BofA_US_HighYield_OAS.csv`: 일별 → 월말 값 추출
- 실질 GDP: 분기 데이터, forward-fill (`maxMonthUnion` 까지)
- `era.txt`: OECD CLI 구간 + 9자산 수익률 (SPX/GOLD/COPPER/TLT/IEF/WTI/HYG/RTY/EEM)
- `checklist.txt`: D1 원문 68개 질문

## 워크플로우 규칙 (사용자 선호)
- 새 기능·변경 요청 → **계획 제시 → 컨펌 → 실행** (시킨 것만)
- 리팩터·부가기능 확장 금지
- 데이터 누락 시 추정·대체 없이 보고

## 알려진 한계
- algo rules 임계값은 휴리스틱 (백테스트 없음) — **manualScores로 덮는 흐름 권장**
- GDP forward-fill로 인해 최근 월들 지표가 동일 값 반복 → percentile/slope 왜곡 가능
- 포트폴리오: 단순 평균 수익률 기반, 변동성·상관 미반영
