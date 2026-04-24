# scripts/ — data refresh

## fetch_indicators.py

FRED API + Yahoo Finance에서 14개 경제지표 + S&P 500을 가져와 `public/data/` 5개 CSV를 갱신한다. ISM PMI는 수동 관리 영역이라 건드리지 않는다.

### 로컬 실행

```bash
# 1. 가상환경 + 의존성 (최초 1회)
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install -r scripts/requirements.txt

# 2. .env 생성 (`.env.example` 복사 후 키 입력)
#    FRED API 키: https://fred.stlouisfed.org/docs/api/api_key.html

# 3. 실행
scripts/.venv/bin/python scripts/fetch_indicators.py --dry-run   # 미리보기
scripts/.venv/bin/python scripts/fetch_indicators.py             # 실제 갱신
```

### 자동 실행 (GitHub Actions)

`.github/workflows/refresh-data.yml` — 매월 1일 03:00 UTC에 자동 실행, 변경이 있으면 auto-commit + push → Vercel 자동 재배포.

수동 트리거: GitHub → Actions → "Refresh economic data" → Run workflow.

필요한 Secret: `FRED_API_KEY`
