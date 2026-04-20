# 커밋 히스토리

최신 커밋이 위쪽. 각 엔트리는 `short-hash — 제목 (날짜)` + 변경 요약 bullet.

## <next> — 월별 총정리 commentary 기능 추가 (2026-04-20)
- 신규: `src/data/manualCommentary.ts` — `MANUAL_COMMENTARY: Record<month, string>` 맵
- 수정: `MonthDetailPanel.tsx` 하단에 commentary 있으면 좌측 accent 바 + 박스로 렌더 (없으면 숨김)
- 재판정 시 월별 요약 텍스트 채우는 용도

## 7c6aacd — 수동 AI 판정 2008-11~2010-06 (20개월, OECD era 의식 가능) (2026-04-20)
- manualScores.ts: 20개월 × 17지표 × 4국면 정성 판정 + 근거 추가
- CLAUDE.md: `AI 수동 판정 워크플로우` 섹션 신설
- 주요 전환점: 2009-03 침체↔회복 동점, 2009-04 회복 우세 전환, 2010-05 유럽 위기로 실물↔시장 괴리
- 주의: 판정 중 OECD era 정보를 의식했을 가능성 — OECD-unaware 재판정 예정

## c79d5d3 — 히트맵 sticky 스크롤 적용 (2026-04-20)
- 체크리스트가 길어 스크롤해도 경제지표 히트맵이 뷰포트 상단(16px)에 고정되어 좌/우 비교가 쉬움
- `src/App.tsx` 히트맵 래퍼 div에 `position: sticky; top: 16; maxHeight: calc(100vh - 32px); overflow: hidden` 추가

## 840880e — Initial commit: 경기순환 스코어링 앱 (2026-04-20)
- 17지표 × 4국면 체크리스트 기반 월별 스코어링 (2008-11 ~ 2026-03, 총 209개월)
- OECD CLI 구간 비교 Bar + 구간별 9자산 수익률 팝업
- 국면별 과거 자산군 수익률 기반 포트폴리오 자동 제안
- 다크 테마, 경제지표 히트맵 (직전 24개월 × 60M percentile)
- `manualScores.ts`: 2008-11 ~ 2009-03 (5개월) 정성 판정(AI 판정) 반영, algo rules 위에 오버레이
- ISM PMI 2006-01 ~ 2007-11 수동 데이터 보충
