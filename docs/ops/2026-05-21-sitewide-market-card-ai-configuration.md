# Zinc Fusion V16 — Full Market-Data Card AI Configuration

Date: 2026-05-21
Owner: Senior AI Systems Architect
Status: LOCKED DRAFT (architecture/config complete; implementation changes not applied in this pass)

## Inputs audited (repo truth)
- Pages: `app/page.tsx`, `app/(protected)/dashboard/page.tsx`, `app/(protected)/strategy/page.tsx`, `app/(protected)/legislation/page.tsx`, `app/(protected)/sentiment/page.tsx`, `app/(protected)/vegas-intel/page.tsx`
- Card components: `components/dashboard/*.tsx`, `components/chart/ZlCandlestickChart.tsx`
- API routes: `app/api/dashboard/*`, `app/api/strategy/posture/route.ts`, `app/api/legislation/feed/route.ts`, `app/api/sentiment/overview/route.ts`, `app/api/vegas/intel/route.ts`, `app/api/vegas/intel/draft/route.ts`, `app/api/zl/*`
- AI snapshot/config contracts: `app/config/*-ai.json`, `lib/server/ai-snapshot.ts`, `lib/server/openrouter.ts`
- Authority docs: `docs/INDEX.md`, `docs/MASTER_PLAN.md`, `docs/agent-safety-gates.md`, `docs/plans/2026-03-17-v16-migration-plan.md`, `docs/plans/2026-05-17-dashboard-revised-work-plan.md`, `docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md`
- Live model-catalog verification: OpenRouter models API (timestamp below)

Model-catalog verification timestamp (UTC): 2026-05-21T12:04:55Z

---

## A. Full Site Card Inventory

### Page: `/` (Landing)
Card family `LND-INTEL-MODULE` (11 instances):
1. Crush Spread
2. China Demand
3. FX / USD
4. Fed Policy
5. Energy
6. Biofuel
7. Palm Oil
8. Volatility
9. Tariff
10. Substitutes
11. Trump Effect

### Page: `/dashboard`
1. `DSH-SYMBOL-PRESSURE` (lane grid + net pressure tile)
2. `DSH-CHART-ZL-1D`
3. `DSH-PROBABILITY-SURFACE`
4. `DSH-REGIME-ANALYSIS`
5. `DSH-AI-INTELLIGENCE`
6. `DSH-RISK-SUMMARY-METRIC` (3 instances: average/top concern/freshness)
7. `DSH-DRIVER-CARD` (5 instances: vix_stress, crush_pressure, china_tension, tariff_threat, energy_stress)

### Page: `/strategy`
1. `STR-MARKET-POSTURE`
2. `STR-CONTRACT-IMPACT`
3. `STR-FACTOR-WATERFALL`
4. `STR-RISK-METRICS`

### Page: `/legislation`
1. `LEG-METRIC-CARD` (5 instances: policy items, active sources, 24h activity, tagged signals, velocity)
2. `LEG-FEED-SUMMARY`
3. `LEG-SOURCE-PRESSURE`
4. `LEG-TAG-PRESSURE`

### Page: `/sentiment`
1. `SEN-FEAR-GREED-COMPOSITE`
2. `SEN-HERO-PRICE-STRIP`
3. `SEN-PROCUREMENT-IMPACT`
4. `SEN-SNAPSHOT-METRIC` (6 instances)
5. `SEN-CROSS-MARKET-NARRATIVE`
6. `SEN-VOLATILITY-TRIO` (3 instances)
7. `SEN-PARTICIPANT-CARD` (3 instances)
8. `SEN-FUND-PERCENTILE`
9. `SEN-NEWS-LANE` (4 instances: headlineFlow + 3 narratives)
10. `SEN-POSITIONING-DETAIL`
11. `SEN-HEADLINE-FLOW-DETAIL`

### Page: `/vegas-intel`
1. `VEG-HERO-METRIC` (3 instances)
2. `VEG-GLIDE-COVERAGE-METRIC` (8 instances)
3. `VEG-SEGMENT-FILTER-CARD` (4 instances)
4. `VEG-SHIFT-SUMMARY`
5. `VEG-SHIFT-ACCOUNT-CARD`
6. `VEG-LEAD-VIEW`
7. `VEG-EVENT-PRESSURE-PANEL`
8. `VEG-SERVICE-GAPS-PANEL`
9. `VEG-AI-BRIEF` (4 instances)
10. `VEG-EVENT-WINDOW-CARD`
11. `VEG-SIDE-METRIC` (3 instances)
12. `VEG-OPPORTUNITY-CARD`
13. `VEG-DRAFT-INTEL-REPORT`
14. `VEG-SERVICE-GAP-ISSUE-CARD`
15. `VEG-COVERAGE-NOTES`

---

## B. Card Dependency Map

### Primary data flow
1. Ingestion/promote layers write Supabase serving tables (`mkt.*`, `analytics.*`, `alt.*`, `vegas.*`, `forecasts.*`).
2. Page APIs pull serving rows and compute deterministic transforms.
3. AI snapshot overlays (`app/config/*-ai.json`) replace or augment specific card text under freshness/precedence rules.
4. UI card families render API payloads and computed display metrics.
5. Vegas request-time draft (`/api/vegas/intel/draft`) calls OpenRouter with structured evidence.

### Key upstream dependencies
- ZL price chain: `mkt.price_1h`, `mkt.price_1d`, `mkt.latest_price`
- Forecast zones: `forecasts.target_zones`
- Dashboard drivers/metrics/posture: `analytics.dashboard_metrics`, `analytics.driver_attribution_1d`, `analytics.market_posture`
- Sentiment: `alt.news_events`, `mkt.cftc_1w`, trusted-market pull (Yahoo/FRED)
- Legislation: `alt.legislation_1d`, `alt.executive_actions`, `alt.congress_bills`, trusted-market pull
- Vegas: `vegas.events`, `vegas.venues`, `vegas.restaurants`, `vegas.casinos`, `vegas.fryers`, `vegas.customer_scores`, `vegas.event_impact`, plus shift/export/report tables in `vegas`/`ops`

### Cross-card handoffs
- `DSH-DRIVER-CARD` -> `DSH-AI-INTELLIGENCE` (driver scores and regimes)
- `DSH-AI-INTELLIGENCE` -> `STR-*` narrative risk context
- `SEN-*` cards use `SENTIMENT_INSTRUCTIONS` cards as source narrative stack for multiple UI cards
- `VEG-*` cards all depend on shared `opportunities[]` and `events[]` materialization
- `VEG-DRAFT-INTEL-REPORT` depends on `VEG-OPPORTUNITY-CARD` selection plus verified row evidence

---

## C. Model Selection Framework

### Model catalog baseline (verified live)
Candidate set:
- `nvidia/nemotron-3-super-120b-a12b:free`
- `deepseek/deepseek-v4-flash:free`
- `qwen/qwen3-next-80b-a3b-instruct:free`
- `google/gemma-4-31b-it:free`
- `openai/gpt-oss-120b:free`
- `z-ai/glm-4.5-air:free`

### Selection rubric per card
Scored dimensions:
1. Determinism required (hard math/aggregation vs narrative)
2. Structured-output strictness (schema/provenance requirements)
3. Context length and completion headroom
4. Tool and response-format support
5. Latency sensitivity
6. Failure containment needs

### Routing decision classes
- Class D0 (deterministic): no LLM call; fail-closed compute only.
- Class D1 (structured narrative with provenance): `nvidia/nemotron-3-super-120b-a12b:free`.
- Class D2 (fast summary where strict schema is lighter): `qwen/qwen3-next-80b-a3b-instruct:free`.
- Class D3 (ultra-long unstructured context fallback): `deepseek/deepseek-v4-flash:free`.

### Why Nemotron is primary for most narrative cards
- Free tier and currently used in all five snapshot configs
- High context, high completion headroom
- Supports `response_format` and `structured_outputs` for schema-safe card payloads
- Already aligned with `strategicSpecialInstructions` + provenance packet pattern

---

## D. Per-Card Configuration

Note: repeated-instance families are parameterized. Each family has one operational instruction block plus instance overrides.

### 1) `LND-INTEL-MODULE` (11 instances)
Page: `/`
Card: `LND-INTEL-MODULE`
Primary function: Static specialist module signaling (no runtime data pull)
Data dependency contract: None at runtime
Symbols: N/A
Calculations: None
Refresh cadence: Release/deploy only
Dependencies: `app/page.tsx`
Recommended free model: `none (D0 deterministic)`
Why this model: Card is static contract copy, not inference
Alternative models considered: `qwen/qwen3-next-80b-a3b-instruct:free` for future dynamic copy
Risk/limitation: Staleness if copy is not updated with regime changes

Dedicated AI Instructions:
- Role: Content integrity checker, not generator.
- Objective: Ensure each module label matches the approved Big-11 specialist list and tone.
- Data handling: No external data calls.
- Reasoning: Validate terminology and specialist naming only.
- Output format: pass/fail with exact module labels.
- Failure condition: Missing/renamed specialist module.
- Escalation: Block publish and require manual content update.

Audit Gate:
- PASS if 11 modules exist and names align with Big-11.
- FAIL if count != 11 or banned terminology appears.

Handoff: Marketing shell only; no downstream computation.

---

### 2) `DSH-SYMBOL-PRESSURE`
Page: `/dashboard`
Card: `DSH-SYMBOL-PRESSURE`
Primary function: Intraday pressure lanes for CL, VIX, OVX, CNY, CRUSH and net direction
Data dependency contract: `/api/dashboard/risk-factors`
Symbols: `CL`, `VIX`, `OVX`, `CNY`, crush-derived metrics
Calculations:
- Lane impact = `50 - score`
- Up/down pressure ratios
- Dominance threshold = 55%
Refresh cadence: hourly
Dependencies: `analytics.dashboard_metrics`, `analytics.driver_attribution_1d`
Recommended free model: `none (D0 deterministic)`
Why this model: strict numeric transform only
Alternative models considered: `z-ai/glm-4.5-air:free` for anomaly commentary (deferred)
Risk/limitation: Score drift if metric key map changes

Dedicated AI Instructions:
- Role: Deterministic transform engine.
- Objective: Convert validated driver scores into lane pressure states.
- Required behavior: no interpolation, no inferred symbols, no narrative generation.
- Validation: non-numeric scores -> null lane with explicit missing marker.
- Failure handling: if fewer than 3 valid scores, set net direction `Balanced` and emit hard-stop warning.

Audit Gate:
- Correct symbol labels present.
- Score range in [0,100] after coercion.
- Dominance math reproducible from lane inputs.
- Freshness date present from payload.

Handoff: visual top strip; informs operator attention before chart review.

---

### 3) `DSH-CHART-ZL-1D`
Page: `/dashboard`
Card: `DSH-CHART-ZL-1D`
Primary function: canonical ZL daily chart with SMA-200 and pivot/fib primitives
Data dependency contract: `/api/zl/price-1d` (+ latest synthetic day from `mkt.price_1h`)
Symbols: `ZL`
Calculations: 20-return realized vol, SMA-200, latest-day roll from hourly, fib anchor lock
Refresh cadence: hourly
Dependencies: `mkt.price_1d`, `mkt.price_1h`
Recommended free model: `none (D0 deterministic)`
Why this model: chart integrity must be non-LLM
Alternative models considered: none
Risk/limitation: stale chart if promote path halts

Dedicated AI Instructions:
- Role: Chart data validator.
- Objective: verify row continuity and OHLC validity before rendering.
- Required behavior: reject any bar with non-finite OHLC; do not synthesize missing bars.
- Validation: ensure ascending time order and one bar per day in output.
- Failure handling: return empty chart with explicit hard-stop state.

Audit Gate:
- Symbol exactly `ZL`.
- OHLC numeric checks pass.
- Last bar source identified (`price_1d` or hourly roll).
- No retired `price_1m/price_15m` dependency.

Handoff: upstream for regime chart and sentiment contextual cards.

---

### 4) `DSH-PROBABILITY-SURFACE`
Page: `/dashboard`
Card: `DSH-PROBABILITY-SURFACE`
Primary function: target-zone density grid (1M/3M/6M)
Data dependency contract: `/api/zl/target-zones`
Symbols: `ZL`
Calculations: zone normalization (`p30/p50/p70`), density alpha by distance from p50
Refresh cadence: post-forecast run
Dependencies: `forecasts.target_zones`
Recommended free model: `none (D0 deterministic)`
Why this model: quantitative rendering; no narrative needed
Alternative models considered: `qwen/qwen3-next-80b-a3b-instruct:free` for secondary commentary (deferred)
Risk/limitation: horizon map drift if legacy rows reintroduced incorrectly

Dedicated AI Instructions:
- Role: Quant display integrity validator.
- Objective: render only approved horizons (30/90/180).
- Required behavior: never relabel as return distributions; output price-level zones only.
- Validation: `p30 <= p50 <= p70`, horizon uniqueness, latest forecast date only.
- Failure handling: show pending/missing cells; never fabricate zones.

Audit Gate:
- Horizon set exactly {30,90,180} after normalization.
- Zone ordering valid.
- As-of timestamp emitted.
- No unsupported confidence terminology.

Handoff: buyer probability context for strategy and execution planning.

---

### 5) `DSH-REGIME-ANALYSIS`
Page: `/dashboard`
Card: `DSH-REGIME-ANALYSIS`
Primary function: regime segmentation over selected lookback
Data dependency contract: `/api/zl/price-1d`
Symbols: `ZL`
Calculations: dynamic short/long SMA thresholds, regime zone transitions
Refresh cadence: on page load/range switch
Dependencies: `mkt.price_1d`
Recommended free model: `none (D0 deterministic)`
Why this model: algorithmic regime classifier
Alternative models considered: none
Risk/limitation: threshold sensitivity in short windows

Dedicated AI Instructions:
- Role: deterministic regime classifier.
- Objective: classify bars into BULLISH/BEARISH/NEUTRAL/SUPPLY_CRISIS/DEMAND_SHOCK.
- Required behavior: classify only where both SMA values exist.
- Validation: enforce contiguous zones with explicit starts/ends.
- Failure handling: no-data zone with neutral label.

Audit Gate:
- Date-filter and range selection applied correctly.
- Regime transitions are monotonic in time.
- Current regime label matches last bar zone.

Handoff: risk context used by operator and strategy cadence.

---

### 6) `DSH-AI-INTELLIGENCE`
Page: `/dashboard`
Card: `DSH-AI-INTELLIGENCE`
Primary function: cross-driver narrative synthesis
Data dependency contract: `/api/dashboard/risk-factors` intelligence payload
Symbols: `ZL`, `CL`, `VIX`, `OVX`, `CNY`, crush metrics
Calculations: synthesis of driver ranks and outlook tags
Refresh cadence: snapshot refresh + page load
Dependencies: `analytics.dashboard_metrics`, `analytics.driver_attribution_1d`, AI snapshot metadata
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free` (D1)
Why this model: strongest free structured narrative fit with provenance packet support
Alternative models considered:
- `qwen/qwen3-next-80b-a3b-instruct:free` (faster, less reasoning traces)
- `deepseek/deepseek-v4-flash:free` (large context, weaker schema controls)
Risk/limitation: narrative can drift if stale snapshot not invalidated

Dedicated AI Instructions:
- Role: cross-driver synthesis analyst.
- Objective: output one buyer-facing regime statement and execution implication.
- Required data handling: cite top driver, average pressure, and freshness window.
- Reasoning: preserve conflict states; do not flatten disagreements.
- Output format: `{headline, summary, drivers[], zlOutlook, zlColor, tradingImplication, provenance}`.
- Failure conditions: missing top-driver or freshness context.
- Escalation: emit hard-stop summary and set `ai.enabled=false` for this card refresh.

Audit Gate:
- Top driver aligns with raw driver scores.
- No unsupported conclusion beyond available metrics.
- Provenance includes source feeds and observed timestamps.

Handoff: consumed by dashboard narrative row; informs strategy interpretation.

---

### 7) `DSH-RISK-SUMMARY-METRIC` (3 instances)
Page: `/dashboard`
Card: `DSH-RISK-SUMMARY-METRIC`
Primary function: deterministic summary counters
Data dependency contract: `/api/dashboard/risk-factors.summary`
Symbols: derived
Calculations: average pressure, highest pressure, alert count, freshness label
Refresh cadence: page load
Dependencies: same as `DSH-AI-INTELLIGENCE`
Recommended free model: `none (D0 deterministic)`
Why this model: scalar aggregation only
Alternative models considered: none
Risk/limitation: stale if mixed-vintage not flagged

Dedicated AI Instructions:
- Role: metric summarizer (deterministic).
- Objective: expose summary values without reinterpretation.
- Validation: alert count = count(score >= 65).
- Failure handling: if missing values, show `--` and hard-stop label.

Audit Gate:
- Summary values match driver set.
- Freshness label reflects mixed-vintage when dates differ.

Handoff: context for operator before diving into driver cards.

---

### 8) `DSH-DRIVER-CARD` (5 instances)
Page: `/dashboard`
Card: `DSH-DRIVER-CARD`
Primary function: per-driver risk state, components, and buyer implication
Data dependency contract: `/api/dashboard/risk-factors.drivers`
Symbols by instance:
- `vix_stress`: VIX, OVX
- `crush_pressure`: board crush, oil share
- `china_tension`: CNY, China news counts
- `tariff_threat`: uncertainty/tariff/macro counts + CL 5D
- `energy_stress`: CL price, CL 5D, OVX
Calculations: score coercion, level mapping, regime mapping, what’s-happening synthesis
Refresh cadence: page load + daily snapshot refresh
Dependencies: analytics metrics/attribution + AI snapshot override
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free` (D1)
Why this model: best free fit for structured per-driver narrative + strict instruction packet
Alternative models considered: `google/gemma-4-31b-it:free`, `qwen/qwen3-next-80b-a3b-instruct:free`
Risk/limitation: component mapping brittleness if metric keys change

Dedicated AI Instructions:
- Role: specialist driver analyst.
- Objective: describe one driver’s procurement impact with explicit metrics.
- Data handling: never infer missing components; output hard-stop for absent critical fields.
- Reasoning: connect component state -> risk class -> buyer implication.
- Output format: `{score, level, regime, headline, components, whatsHappening, provenance}`.
- Failure: score null with no fallback components.
- Escalation: downgrade to deterministic headline and set `aiPowered=false`.

Audit Gate:
- Driver key valid and expected component keys present.
- Score in [0,100] after coercion.
- `whatsHappening` sections all populated or hard-stop explicit.

Handoff: feeds `DSH-AI-INTELLIGENCE` and operator risk review.

---

### 9) `STR-MARKET-POSTURE`
Page: `/strategy`
Card: `STR-MARKET-POSTURE`
Primary function: ACCUMULATE/WAIT/DEFER state for buyer
Data dependency contract: `/api/strategy/posture.data`
Symbols: indirect via underlying strategy engine
Calculations: none in page layer (reads computed posture)
Refresh cadence: daily/snapshot
Dependencies: `analytics.market_posture`
Recommended free model: `none (D0 deterministic render of stored posture)`
Why this model: posture is upstream computed fact
Alternative models considered: none
Risk/limitation: stale posture if table update lags

Dedicated AI Instructions:
- Role: posture integrity validator.
- Objective: render stored posture exactly; do not reinterpret class.
- Validation: posture must be one of ACCUMULATE/WAIT/DEFER.
- Failure handling: hard-stop message and null card state.

Audit Gate:
- Enum validity.
- `updatedAt` present.

Handoff: anchors the three strategy narrative cards.

---

### 10) `STR-CONTRACT-IMPACT`
Page: `/strategy`
Card: `STR-CONTRACT-IMPACT`
Primary function: staged-vs-single-window execution guidance
Data dependency contract: strategy API + trusted pull (`VIX`, `OVX`, `CL 5D`)
Symbols: `VIX`, `OVX`, `CL`
Calculations: contextual synthesis of volatility and crude change
Refresh cadence: daily snapshot + request
Dependencies: analytics posture/metrics + trusted-market snapshot
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free` (D1)
Why this model: structured strategic narrative with strict hard-stop behavior
Alternative models considered: `qwen/qwen3-next-80b-a3b-instruct:free`
Risk/limitation: if trusted pull fails, output must stay blocked

Dedicated AI Instructions:
- Role: buyer execution strategist.
- Objective: decide staging bias with explicit metric evidence.
- Reasoning: compare execution latency risk vs one-shot risk.
- Output: concise guidance + invalidation triggers.
- Failure: no trusted macro feed -> hard-stop body.

Audit Gate:
- VIX/OVX/CL5D evidence either numeric or explicit hard-stop.
- No directional trading language; buyer-cost language only.

Handoff: informs procurement cadence decisions.

---

### 11) `STR-FACTOR-WATERFALL`
Page: `/strategy`
Card: `STR-FACTOR-WATERFALL`
Primary function: ordered driver stack
Data dependency contract: `analytics.driver_attribution_1d`
Symbols: derived factor labels
Calculations: latest trade_date filter + rank ordering
Refresh cadence: daily
Dependencies: driver attribution table
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free` (D1)
Why this model: clear structured ranking narrative with interaction callouts
Alternative models considered: `deepseek/deepseek-v4-flash:free`
Risk/limitation: attribution sparsity

Dedicated AI Instructions:
- Role: factor-ranking analyst.
- Objective: rank top factors and explain ordering.
- Constraints: do not collapse rankings into generic summary.
- Failure: no rows -> hard-stop body.

Audit Gate:
- Rank list from latest date only.
- Contribution values shown with signs/precision.

Handoff: feeds strategic monitoring priorities.

---

### 12) `STR-RISK-METRICS`
Page: `/strategy`
Card: `STR-RISK-METRICS`
Primary function: buyer tail/latency risk framing
Data dependency contract: trusted volatility/energy + attribution context
Symbols: `VIX`, `OVX`, `CL`
Calculations: risk asymmetry narrative from metrics state
Refresh cadence: daily
Dependencies: strategy route upstream data
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: reliable free long-form reasoning in constrained structure
Alternative models considered: `openai/gpt-oss-120b:free`
Risk/limitation: may overstate certainty if freshness not enforced

Dedicated AI Instructions:
- Role: risk-math explainer for buyers.
- Objective: quantify latency risk vs over-coverage risk.
- Output: regime class + cadence recommendation.
- Failure: missing trusted fields -> hard-stop.

Audit Gate:
- Freshness date included.
- Asymmetry statement tied to real metrics.

Handoff: execution policy and procurement review loop.

---

### 13) `LEG-METRIC-CARD` (5 instances)
Page: `/legislation`
Card: `LEG-METRIC-CARD`
Primary function: deterministic legislation activity counters
Data dependency contract: merged legislation items
Symbols: N/A
Calculations: counts, source cardinality, tag cardinality, pulse ratio
Refresh cadence: request-time
Dependencies: filtered item set from legislation API
Recommended free model: `none (D0 deterministic)`
Why this model: pure aggregation
Alternative models considered: none
Risk/limitation: quality depends on relevance filter

Dedicated AI Instructions:
- Role: aggregation engine.
- Objective: compute and display activity metrics exactly.
- Failure: if no items, show hard-stop zero state.

Audit Gate:
- Each metric reproducible from item list.
- 24h and 7d windows use consistent timestamps.

Handoff: context for summary/source/tag cards.

---

### 14) `LEG-FEED-SUMMARY`
Page: `/legislation`
Card: `LEG-FEED-SUMMARY`
Primary function: top policy impact synthesis
Data dependency contract: filtered rows from `alt.legislation_1d`, `alt.executive_actions`, `alt.congress_bills`
Symbols: policy themes (tariff/biofuel/ag context)
Calculations: latest item + theme extraction
Refresh cadence: daily/request-time
Dependencies: relevance filter + source/tag counts + AI snapshot
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: strong structured policy narrative with provenance
Alternative models considered: `google/gemma-4-31b-it:free`
Risk/limitation: keyword filter false positives/negatives

Dedicated AI Instructions:
- Role: policy-procurement translator.
- Objective: convert policy feed into impact-horizon summary.
- Constraints: no urgency claims without implementation timing cues.
- Failure: no relevant rows -> hard-stop.

Audit Gate:
- Relevance screen applied.
- Top item and top themes match source rows.

Handoff: used by policy watch workflows and strategy context.

---

### 15) `LEG-SOURCE-PRESSURE`
Page: `/legislation`
Card: `LEG-SOURCE-PRESSURE`
Primary function: source concentration reliability analysis
Data dependency contract: legislation source counts
Symbols: N/A
Calculations: lead-source share and concentration class
Refresh cadence: daily/request-time
Dependencies: legislation filtered rows
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: consistent structured confidence framing
Alternative models considered: `qwen/qwen3-next-80b-a3b-instruct:free`
Risk/limitation: small sample windows can skew concentration

Dedicated AI Instructions:
- Role: source-quality analyst.
- Objective: rate confidence impact of concentration.
- Output: concentration class + buyer confidence implication.

Audit Gate:
- Lead-source share math validated.
- Confidence statement reflects sample size.

Handoff: informs decision confidence before acting on policy headlines.

---

### 16) `LEG-TAG-PRESSURE`
Page: `/legislation`
Card: `LEG-TAG-PRESSURE`
Primary function: tag-theme pressure ranking
Data dependency contract: tag frequency map
Symbols: policy theme tags
Calculations: top tags and ordering
Refresh cadence: daily/request-time
Dependencies: legislation item tags
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: stable structured theme narrative
Alternative models considered: `deepseek/deepseek-v4-flash:free`
Risk/limitation: tag quality in payload metadata

Dedicated AI Instructions:
- Role: theme-ranking analyst.
- Objective: order procurement-relevant policy themes.
- Constraints: do not equate frequency with impact without context.

Audit Gate:
- Top tag order matches counts.
- Horizon labels present for each top theme.

Handoff: policy watchlist ordering.

---

### 17) `SEN-FEAR-GREED-COMPOSITE`
Page: `/sentiment`
Card: `SEN-FEAR-GREED-COMPOSITE`
Primary function: composite sentiment gauge from sentiment score
Data dependency contract: `/api/sentiment/overview`
Symbols: implicit sentiment inputs (`VIX`, `OVX`, `CL`, CoT, headlines)
Calculations: score clamp, 0-100 transform, zone label, component bars
Refresh cadence: request-time
Dependencies: sentiment overview payload
Recommended free model: `none (D0 deterministic render)`
Why this model: score math deterministic in page
Alternative models considered: none
Risk/limitation: upstream score quality controls overall utility

Dedicated AI Instructions:
- Role: deterministic interpreter.
- Objective: map score to zone and interpretation text.
- Failure: missing score -> explicit hard-stop neutral state.

Audit Gate:
- Score clamp and gauge angle math valid.
- Zone mapping boundaries respected.

Handoff: drives multiple sentiment subcards.

---

### 18) `SEN-HERO-PRICE-STRIP`
Page: `/sentiment`
Card: `SEN-HERO-PRICE-STRIP`
Primary function: live ZL plus sentiment posture badge
Data dependency contract: `/api/zl/live`, `/api/sentiment/overview`
Symbols: `ZL`
Calculations: signed sentiment display + trend label class
Refresh cadence: request-time
Dependencies: live price + sentiment score
Recommended free model: `none (D0)`
Why this model: direct display
Alternative models considered: none
Risk/limitation: live feed lag

Dedicated AI Instructions:
- Role: data integrity renderer.
- Objective: present latest live price with timestamp and sentiment state.
- Failure: missing live feed -> fallback string; no invented price.

Audit Gate:
- Live symbol exactly ZL.
- Observed timestamp present or explicit waiting state.

Handoff: immediate visual context for downstream sentiment blocks.

---

### 19) `SEN-PROCUREMENT-IMPACT`
Page: `/sentiment`
Card: `SEN-PROCUREMENT-IMPACT`
Primary function: buyer-facing narrative impact on ZL futures contract price
Data dependency contract: sentiment narratives + live overview stats
Symbols: `ZL`, CoT context
Calculations: narrative selection and supporting snapshot values
Refresh cadence: daily snapshot + request
Dependencies: sentiment cards/narratives
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: policy+flow+buyer synthesis with strict guardrails
Alternative models considered: `qwen/qwen3-next-80b-a3b-instruct:free`
Risk/limitation: narrative drift if not freshness-gated

Dedicated AI Instructions:
- Role: procurement psychology analyst.
- Objective: convert sentiment complex into pacing guidance.
- Constraints: no unsupported confidence; include explicit triggers.
- Failure: missing CoT or trusted context -> hard-stop narrative.

Audit Gate:
- Narrative references existing fields only.
- Headline count and CoT bias present when non-blocked.

Handoff: buyer pacing recommendation lane.

---

### 20) `SEN-SNAPSHOT-METRIC` (6 instances)
Page: `/sentiment`
Card: `SEN-SNAPSHOT-METRIC`
Primary function: deterministic snapshot metrics
Data dependency contract: sentiment overview + live price
Symbols: `ZL`, CoT proxy
Calculations: field format only
Refresh cadence: request-time
Dependencies: overview/live payload
Recommended free model: `none (D0)`
Why this model: scalar display
Alternative models considered: none
Risk/limitation: duplication across sections can cause inconsistency if source fields diverge

Dedicated AI Instructions:
- Role: metric renderer.
- Objective: one value, one source field, explicit fallback.
- Failure: null -> `—` and hard-stop subtext.

Audit Gate:
- Metric-to-field mapping table maintained.
- Timestamp formatting consistent.

Handoff: context tiles.

---

### 21) `SEN-CROSS-MARKET-NARRATIVE`
Page: `/sentiment`
Card: `SEN-CROSS-MARKET-NARRATIVE`
Primary function: cross-market narrative when raw CL/VIX/OVX fields are not directly exposed in page payload
Data dependency contract: narrative card text from sentiment API
Symbols: `CL`, `VIX`, `OVX`, `ZL` (implicit via narrative)
Calculations: none in card; uses narrative text
Refresh cadence: daily snapshot
Dependencies: sentiment narrative generation
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: careful constrained narrative from partial context
Alternative models considered: `google/gemma-4-31b-it:free`
Risk/limitation: opaque if upstream narrative loses metric references

Dedicated AI Instructions:
- Role: cross-market translator.
- Objective: provide concise cross-market interpretation with no unsupported raw-field claims.
- Failure: missing narrative -> hard-stop message.

Audit Gate:
- Narrative includes confidence caveat if raw fields absent.

Handoff: supplemental context for sentiment dashboard users.

---

### 22) `SEN-VOLATILITY-TRIO` (3 instances)
Page: `/sentiment`
Card: `SEN-VOLATILITY-TRIO`
Primary function: volatility subindices from derived sentiment measures
Data dependency contract: sentiment score/headline pressure/CoT component
Symbols: derived
Calculations: absolute-distance and component transforms
Refresh cadence: request-time
Dependencies: overview card-level derived variables
Recommended free model: `none (D0)`
Why this model: deterministic
Alternative models considered: none
Risk/limitation: heuristic thresholds may need recalibration

Dedicated AI Instructions:
- Role: deterministic risk-class mapper.
- Objective: classify each metric as calm/moderate/elevated.
- Failure: missing input -> missing state, no inference.

Audit Gate:
- Thresholds and color states match spec.

Handoff: volatility posture context.

---

### 23) `SEN-PARTICIPANT-CARD` (3 instances)
Page: `/sentiment`
Card: `SEN-PARTICIPANT-CARD`
Primary function: participant-lane snapshots (managed money, headlines, buyer psychology)
Data dependency contract: positioningFlow/headlineFlow narratives + derived gauge values
Symbols: CoT + ZL sentiment context
Calculations: value bars and text states
Refresh cadence: request-time
Dependencies: sentiment API cards
Recommended free model: `none (D0 render) + D1 upstream narrative`
Why this model: display deterministic; narrative already generated upstream
Alternative models considered: none for UI layer
Risk/limitation: reused narrative can appear repetitive

Dedicated AI Instructions:
- Role: narrative-to-visual mapper.
- Objective: map card payload into participant lane without reinterpretation.
- Failure: missing card payload -> explicit hard-stop participant block.

Audit Gate:
- Subtitle and body map to correct source card.

Handoff: participant behavior context.

---

### 24) `SEN-FUND-PERCENTILE`
Page: `/sentiment`
Card: `SEN-FUND-PERCENTILE`
Primary function: simple percentile proxy bar
Data dependency contract: gauge score
Symbols: N/A
Calculations: bar width = gauge score
Refresh cadence: request-time
Dependencies: fear/greed composite output
Recommended free model: `none (D0)`
Why this model: deterministic.
Alternative models considered: none
Risk/limitation: proxy, not true fund percentile series

Dedicated AI Instructions:
- Role: proxy metric renderer.
- Objective: never claim this as a direct exchange percentile.

Audit Gate:
- Label includes “proxy”.

Handoff: contextual visual only.

---

### 25) `SEN-NEWS-LANE` (4 instances)
Page: `/sentiment`
Card: `SEN-NEWS-LANE`
Primary function: policy/headline lane narratives
Data dependency contract: cards.headlineFlow + cards.narratives[0..2]
Symbols: narrative-driven
Calculations: tag chips + lane grouping
Refresh cadence: daily snapshot
Dependencies: sentiment AI snapshot
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: structured narrative generation with hard-stop behavior
Alternative models considered: `qwen/qwen3-next-80b-a3b-instruct:free`
Risk/limitation: lane duplication with other narrative cards

Dedicated AI Instructions:
- Role: multi-lane narrative composer.
- Objective: produce four distinct lanes (flow, macro, flow-state, procurement).
- Constraints: avoid duplicate text and keep each lane scoped.
- Failure: no news rows -> hard-stop in flow lanes.

Audit Gate:
- Four lanes populated with distinct focus.
- Timestamp and lane type markers present.

Handoff: operator scan for narrative clustering.

---

### 26) `SEN-POSITIONING-DETAIL`
Page: `/sentiment`
Card: `SEN-POSITIONING-DETAIL`
Primary function: detailed managed-money note
Data dependency contract: cards.positioningFlow
Symbols: CoT ZL
Calculations: none in UI
Refresh cadence: weekly CoT + daily snapshot
Dependencies: sentiment API
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: concise risk framing with freshness caveat
Alternative models considered: `openai/gpt-oss-120b:free`
Risk/limitation: weekly lag vs intraday markets

Dedicated AI Instructions:
- Role: positioning interpreter.
- Objective: explain bias with freshness caveat.
- Failure: missing CoT row -> hard-stop text.

Audit Gate:
- Observation date referenced when available.

Handoff: trader/analyst positioning context.

---

### 27) `SEN-HEADLINE-FLOW-DETAIL`
Page: `/sentiment`
Card: `SEN-HEADLINE-FLOW-DETAIL`
Primary function: headline velocity detail
Data dependency contract: cards.headlineFlow
Symbols: N/A
Calculations: none in UI
Refresh cadence: daily
Dependencies: sentiment API
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: stable constrained text with explicit uncertainty
Alternative models considered: `deepseek/deepseek-v4-flash:free`
Risk/limitation: depends on tag quality in source data

Dedicated AI Instructions:
- Role: headline-velocity interpreter.
- Objective: classify signal-vs-noise and monitoring cadence.

Audit Gate:
- Includes row-count context or hard-stop state.

Handoff: newsroom monitoring cadence.

---

### 28) `VEG-HERO-METRIC` (3 instances)
Page: `/vegas-intel`
Card: `VEG-HERO-METRIC`
Primary function: top-of-page operational counts
Data dependency contract: `/api/vegas/intel` snapshot/stats
Symbols: event/account operational entities
Calculations: direct counts + detail text
Refresh cadence: request-time
Dependencies: vegas snapshot/stats
Recommended free model: `none (D0)`
Why this model: deterministic
Alternative models considered: none
Risk/limitation: reflects upstream data completeness

Dedicated AI Instructions:
- Role: counter renderer.
- Objective: present exact counts, no narrative extrapolation.

Audit Gate:
- Count-source mapping validated.

Handoff: quick operational status.

---

### 29) `VEG-GLIDE-COVERAGE-METRIC` (8 instances)
Page: `/vegas-intel`
Card: `VEG-GLIDE-COVERAGE-METRIC`
Primary function: table-level Glide ingestion visibility
Data dependency contract: `glideTables` payload
Symbols: N/A
Calculations: none
Refresh cadence: request-time
Dependencies: coverage-count queries over `vegas`/`ops`
Recommended free model: `none (D0)`
Why this model: strict counts
Alternative models considered: none
Risk/limitation: nulls for missing relations must remain explicit

Dedicated AI Instructions:
- Role: ingestion-surface monitor.
- Objective: expose null vs zero correctly.

Audit Gate:
- Missing table => null, not 0.

Handoff: ingestion diagnostics.

---

### 30) `VEG-SEGMENT-FILTER-CARD` (4 instances)
Page: `/vegas-intel`
Card: `VEG-SEGMENT-FILTER-CARD`
Primary function: segment-level view switching with stats
Data dependency contract: opportunities/events aggregates
Symbols: account/event entities
Calculations: segment counts and explanatory detail by segment
Refresh cadence: request-time
Dependencies: opportunities/events arrays
Recommended free model: `none (D0)`
Why this model: deterministic interaction card
Alternative models considered: none
Risk/limitation: definitions of customer/prospect tied to metadata conventions

Dedicated AI Instructions:
- Role: segmentation controller.
- Objective: switch view without altering underlying ranking logic.

Audit Gate:
- Segment counts tie to active filtered arrays.

Handoff: drives opportunity list scope.

---

### 31) `VEG-SHIFT-SUMMARY`
Page: `/vegas-intel`
Card: `VEG-SHIFT-SUMMARY`
Primary function: shift-service coverage narrative + stats
Data dependency contract: shift-related counts and linked rows
Symbols: N/A
Calculations: totals and fallback to glide counts
Refresh cadence: request-time
Dependencies: `shift*` fields in opportunities/stats
Recommended free model: `none (D0)`
Why this model: deterministic summary
Alternative models considered: none
Risk/limitation: can mask granularity if row-level shift data sparse

Dedicated AI Instructions:
- Role: service-coverage summarizer.
- Objective: show shift readiness and missing-link risk.

Audit Gate:
- Shift totals reconcile with visible shift-linked accounts.

Handoff: operations planning.

---

### 32) `VEG-SHIFT-ACCOUNT-CARD`
Page: `/vegas-intel`
Card: `VEG-SHIFT-ACCOUNT-CARD`
Primary function: per-account shift linkage detail
Data dependency contract: shift-linked opportunity rows
Symbols: account IDs
Calculations: display fields only
Refresh cadence: request-time
Dependencies: opportunities[]
Recommended free model: `none (D0)`
Why this model: render-only
Alternative models considered: none
Risk/limitation: missing service cadence fields

Dedicated AI Instructions:
- Role: row renderer.
- Objective: present shift and report linkage fields exactly.

Audit Gate:
- Row uses canonical account ID and shift count.

Handoff: field-service assignment.

---

### 33) `VEG-LEAD-VIEW`
Page: `/vegas-intel`
Card: `VEG-LEAD-VIEW`
Primary function: lead-state narrative and lead-quality stats
Data dependency contract: cards.aiSalesStrategy + lead aggregates
Symbols: account/event context
Calculations: average lead score, glide-customer/event-linked counts
Refresh cadence: daily snapshot + request-time metrics
Dependencies: `cards.aiSalesStrategy`, opportunities arrays
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: consistent buyer-sales narrative with threshold-aware language
Alternative models considered: `qwen/qwen3-next-80b-a3b-instruct:free`
Risk/limitation: narrative quality depends on correct threshold math

Dedicated AI Instructions:
- Role: sales sequencing analyst.
- Objective: translate lead-state math into execution order.
- Constraints: never imply hot list when qualified count is zero.

Audit Gate:
- Qualified threshold logic explicit.
- Narrative reflects current counts.

Handoff: Kevin outreach sequence.

---

### 34) `VEG-EVENT-PRESSURE-PANEL`
Page: `/vegas-intel`
Card: `VEG-EVENT-PRESSURE-PANEL`
Primary function: concise event-demand pressure statement
Data dependency contract: cards.upcomingEvents
Symbols: event categories and timing windows
Calculations: none in UI
Refresh cadence: daily snapshot
Dependencies: vegas card snapshot
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: robust structured event-language behavior
Alternative models considered: `deepseek/deepseek-v4-flash:free`
Risk/limitation: stale if event ingest lagged

Dedicated AI Instructions:
- Role: event-window risk summarizer.
- Objective: classify surge/cleanup/reload mode.

Audit Gate:
- Must name next anchor event or hard-stop.

Handoff: schedule planning.

---

### 35) `VEG-SERVICE-GAPS-PANEL`
Page: `/vegas-intel`
Card: `VEG-SERVICE-GAPS-PANEL`
Primary function: fryer/service gap summary
Data dependency contract: cards.fryerTracking
Symbols: account operations
Calculations: none in UI
Refresh cadence: daily snapshot
Dependencies: fryer rows + capacity telemetry counts
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: clear operational risk phrasing
Alternative models considered: `google/gemma-4-31b-it:free`
Risk/limitation: depends on telemetry completeness

Dedicated AI Instructions:
- Role: equipment-risk translator.
- Objective: separate coverage completeness from telemetry completeness.

Audit Gate:
- Coverage and telemetry values both explicit.

Handoff: service dispatch triage.

---

### 36) `VEG-AI-BRIEF` (4 instances)
Page: `/vegas-intel`
Card: `VEG-AI-BRIEF`
Primary function: compact summary cards for upcoming events, sales strategy, accounts, fryer tracking
Data dependency contract: vegas `cards` object
Symbols: card-dependent
Calculations: none in UI
Refresh cadence: daily snapshot
Dependencies: `app/config/vegas-intel-ai.json` via API merge
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free`
Why this model: schema-friendly short-form briefing
Alternative models considered: `qwen/qwen3-next-80b-a3b-instruct:free`
Risk/limitation: repeated content if upstream card bodies duplicate

Dedicated AI Instructions:
- Role: briefing condenser.
- Objective: ensure each brief is distinct and tied to one operational lane.

Audit Gate:
- Four briefs present and non-duplicative.

Handoff: quick-scan executive summaries.

---

### 37) `VEG-EVENT-WINDOW-CARD`
Page: `/vegas-intel`
Card: `VEG-EVENT-WINDOW-CARD`
Primary function: per-event detail card with urgency countdown
Data dependency contract: events[]
Symbols: event entities
Calculations: daysUntil, duration, attendance formatting, urgency color
Refresh cadence: request-time
Dependencies: `vegas.events` + mapped metadata
Recommended free model: `none (D0)`
Why this model: deterministic
Alternative models considered: none
Risk/limitation: event metadata quality

Dedicated AI Instructions:
- Role: event-card renderer.
- Objective: show verified event window facts only.

Audit Gate:
- daysUntil computed from date difference.
- Category color mapping valid.

Handoff: sales timing and capacity prep.

---

### 38) `VEG-SIDE-METRIC` (3 instances)
Page: `/vegas-intel`
Card: `VEG-SIDE-METRIC`
Primary function: contextual side notes (timing, lead truth, telemetry)
Data dependency contract: cards/upstream aggregates
Symbols: N/A
Calculations: none in UI
Refresh cadence: request-time
Dependencies: opportunities/events/stats + cards
Recommended free model: `none (D0 render) + D1 upstream text`
Why this model: render-only at UI layer
Alternative models considered: none
Risk/limitation: stale upstream narrative

Dedicated AI Instructions:
- Role: context panel renderer.
- Objective: display source-proven statements unchanged.

Audit Gate:
- Values in text reconcile with visible counts.

Handoff: operator context.

---

### 39) `VEG-OPPORTUNITY-CARD`
Page: `/vegas-intel`
Card: `VEG-OPPORTUNITY-CARD`
Primary function: per-account operational + scoring view and intel trigger
Data dependency contract: opportunities[]
Symbols: account/event IDs
Calculations: row priority ranking done upstream; display + missing-fields detection
Refresh cadence: request-time
Dependencies: `vegas.restaurants`, `vegas.customer_scores`, `vegas.event_impact`, `vegas.fryers`, linked tables
Recommended free model: `none (D0)`
Why this model: render layer only
Alternative models considered: none
Risk/limitation: ranking assumptions may need periodic calibration

Dedicated AI Instructions:
- Role: account-level evidence presenter.
- Objective: show complete operational profile and explicit missing fields.
- Constraint: never hide missing critical fields.

Audit Gate:
- `missingFields()` checks contact/oil/fryers/capacity/event-link.
- Source badge and customer/prospect status consistent.

Handoff: user-triggered draft intel generation.

---

### 40) `VEG-DRAFT-INTEL-REPORT`
Page: `/vegas-intel` (inside opportunity card)
Card: `VEG-DRAFT-INTEL-REPORT`
Primary function: account-specific sales draft from verified evidence
Data dependency contract: `/api/vegas/intel/draft` + validated account/event/fryer/score context
Symbols: event/account context + market backdrop via static pitch angle logic
Calculations:
- cuisine affinity lookup
- days-until event
- evidence bullet compilation
- missing-evidence flags
Refresh cadence: on user action (Intel button)
Dependencies: vegas route + `lib/server/openrouter.ts`
Recommended free model: `nvidia/nemotron-3-super-120b-a12b:free` primary, deterministic fallback
Why this model: currently integrated; supports constrained JSON-shaped outputs
Alternative models considered:
- `qwen/qwen3-next-80b-a3b-instruct:free` (faster but less reasoning trace)
- `openai/gpt-oss-120b:free` (strong reasoning, weaker schema controls)
Risk/limitation: direct provider failures; requires fallback path to prevent silent failure

Dedicated AI Instructions:
- Role: account sales collateral generator.
- Objective: output structured draft using only provided evidence payload.
- Required data handling: no invented contacts, events, prices, or capacities.
- Reasoning: prioritize event timing + service readiness + oil continuity logic.
- Output format strict keys: `executiveBrief,pitchAngle,salesScript,emailDraft,callPlan,objectionHandling,riskFlags,evidenceSummary,nextAction`.
- Failure condition: invalid JSON or timeout.
- Escalation: switch to `fallbackVegasIntelReport` and set `aiWarning`.

Audit Gate:
- Request must include valid `restaurantId` (and valid `eventId` when supplied).
- Restaurant must be verified Glide account.
- Evidence bullets reflect actual row values.
- Missing evidence list explicit.
- Output parseable and schema-complete.

Handoff: Kevin-facing outreach draft for manual review and send.

---

### 41) `VEG-SERVICE-GAP-ISSUE-CARD`
Page: `/vegas-intel`
Card: `VEG-SERVICE-GAP-ISSUE-CARD`
Primary function: list highest-gap accounts
Data dependency contract: computed `serviceGaps[]`
Symbols: account rows
Calculations: gap count sort descending
Refresh cadence: request-time
Dependencies: opportunities[] completeness fields
Recommended free model: `none (D0)`
Why this model: deterministic
Alternative models considered: none
Risk/limitation: does not auto-prioritize by revenue impact

Dedicated AI Instructions:
- Role: data-quality triage renderer.
- Objective: rank and show missing-field burden.

Audit Gate:
- Gaps list derived from canonical `missingFields()` logic.

Handoff: data remediation queue.

---

### 42) `VEG-COVERAGE-NOTES`
Page: `/vegas-intel`
Card: `VEG-COVERAGE-NOTES`
Primary function: static operational caveats for current dataset boundaries
Data dependency contract: none dynamic (textual guardrail)
Symbols: N/A
Calculations: none
Refresh cadence: release-time/manual updates
Dependencies: page contract and turnover rules
Recommended free model: `none (D0)`
Why this model: policy guardrail card
Alternative models considered: none
Risk/limitation: can go stale if ingestion scope changes

Dedicated AI Instructions:
- Role: boundary contract narrator.
- Objective: keep explicit separation between customer/prospect logic and geometry limitations.

Audit Gate:
- Notes reflect current API payload reality.

Handoff: operator expectation-setting.

---

## E. Full-Site Consistency Rules

1. Symbol and naming canonicality
- ZL price symbol must remain `ZL` across all price/forecast routes.
- Driver keys fixed: `vix_stress`, `crush_pressure`, `china_tension`, `tariff_threat`, `energy_stress`.
- Strategy posture enum fixed: `ACCUMULATE|WAIT|DEFER`.

2. Time and freshness standards
- All responses include `asOf`.
- Mixed-vintage payloads must expose `as_of_date_min/max` and `mixed_vintage=true`.
- Vegas event windows computed from normalized local-midnight day math.

3. Data-source boundary
- Chart serving reads only `mkt.price_1h`, `mkt.price_1d`, `mkt.latest_price`.
- No active dependency on `mkt.price_1m` or `mkt.price_15m`.
- Non-chart market context stays in analytics/alt/vegas serving tables.

4. AI snapshot contract
- Snapshot files must include: `generatedAt`, `model`, `reasoningEffort`, `source`, `refreshScheduleEt`.
- Trusted sources accepted by loader must remain in allowlist.
- Each narrative card keeps `strategicSpecialInstructions` and `provenance` blocks.

5. Hard-stop behavior
- Missing required evidence => explicit hard-stop message.
- No silent fallback to fabricated narrative.
- Request-time draft generation must return structured fallback on provider failure.

6. Build-mode auth lock alignment
- While `AUTH_DISABLED_FOR_BUILD=true`, no card route can enforce auth-only behavior.
- Phase 9 re-enable is explicit gate work, not implicit drift.

7. Vocabulary and policy compliance
- Target zones are price levels (P30/P50/P70); never probabilistic shape metaphors.
- Buyer-language framing must remain cost-control and timing oriented.

---

## F. Final Sitewide Audit

Checklist result:
- Every active market page reviewed: PASS (`/`, `/dashboard`, `/strategy`, `/legislation`, `/sentiment`, `/vegas-intel`).
- Every market card family configured individually: PASS (42 card families, repeated instances parameterized).
- Model choices justified per workload: PASS (D0/D1/D2/D3 routing + alternatives).
- Dedicated instructions present per card family: PASS.
- Market-data requirements captured (symbols, feeds, timeframes, fields): PASS.
- Calculations and transforms documented: PASS.
- Dependency map documented: PASS.
- Validation/audit gates defined for every family: PASS.

Residual risks to track:
1. Snapshot freshness drift if daily refresh misses.
2. Policy and sentiment relevance filtering quality.
3. Vegas telemetry completeness (`fryerCount`, `capacity`) limiting high-confidence service prioritization.
4. Ranking assumptions in opportunity priority stack may need periodic calibration.

Implementation status from this pass:
- Architecture/configuration specification complete.
- No runtime code or migration changes applied.
- No training or data promotion executed.
