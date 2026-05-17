---
name: mock-scan
description: "Scan the ZINC Fusion V16 codebase for Hard Rule #11 violations: ZERO mock data. Searches app/, components/, lib/, and python/ for hardcoded data arrays, mock DataFrames, and explicit fake-data markers. Outputs PASS or FAIL with file:line evidence."
model: deepseek/deepseek-v4-pro
agent: plan
argument-hint: 'Allowed scope: full-scan | app | components | lib | python | api-routes'
---

# Mock Scan

Scan the ZINC Fusion V16 codebase for mock data violations. Hard Rule #11 states:
"ZERO mock data. No placeholders, no temps, no demo/synthetic/random data anywhere, ever."

## What to Scan

Search these directories: `app/`, `components/`, `lib/`, `python/`

## Patterns to Flag

1. **Hardcoded data arrays** in API route handlers (e.g., `return NextResponse.json([{ price: 100 }])`)
2. **Python mock DataFrames** (e.g., `pd.DataFrame({'close': [100, 101]})`)
3. **String markers**: `MOCK`, `mock`, `placeholder`, `TODO: replace`, `sample`, `demo`, `synthetic`, `fake`, `dummy`, `hardcoded`
4. **AI snapshot API routes requiring real data provenance:**
   - `app/api/dashboard/risk-factors/route.ts`
   - `app/api/strategy/posture/route.ts`
   - `app/api/sentiment/overview/route.ts`
   - `app/api/legislation/feed/route.ts`
   - `app/api/vegas/intel/route.ts`

## Output Format

```
MOCK DATA SCAN — ZINC Fusion V16
Date: [today]

VIOLATIONS FOUND: [N]
  1. [file:line] — [pattern matched] — [snippet]
  2. ...

AI SNAPSHOT ROUTES:
  - app/api/dashboard/risk-factors/route.ts: [REAL DATA / VIOLATION / NOT PRESENT]
  - app/api/strategy/posture/route.ts: [REAL DATA / VIOLATION / NOT PRESENT]
  - app/api/sentiment/overview/route.ts: [REAL DATA / VIOLATION / NOT PRESENT]
  - app/api/legislation/feed/route.ts: [REAL DATA / VIOLATION / NOT PRESENT]
  - app/api/vegas/intel/route.ts: [REAL DATA / VIOLATION / NOT PRESENT]

VERDICT: PASS (zero violations) / FAIL ([N] violations)
```

$ARGUMENTS
