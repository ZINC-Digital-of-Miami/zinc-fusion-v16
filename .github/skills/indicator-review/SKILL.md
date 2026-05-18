---
name: indicator-review
description: "Math, logic, and signal-value audit for ZINC Fusion V16 indicators. Use when: verifying indicator math is correct, checking whether an indicator actually adds signal for ZL soybean oil forecasting, identifying overtooled or redundant features, auditing chart-side calculations, reviewing specialist feature logic, or assessing GARCH/Monte Carlo parameter choices. Runs pre-flight, per-layer math loop, usefulness/overtooling loop, and commit gate. Never trains models or modifies production data."
argument-hint: 'Focus area, e.g. "chart indicators" or "specialist features" or "garch spec" or "overtooling audit"'
---

# Indicator Review

## What This Skill Does

Systematically audits every indicator in ZINC Fusion V16 across three dimensions:

1. **Math correctness** — Is the formula right? Are edge cases handled?
2. **Signal value** — Does this indicator actually add information for ZL soybean oil price forecasting?
3. **Overtooling** — Is this indicator complexity justified, or is it noise masquerading as signal?

Runs in loops: pre-flight → Layer 1 (chart-side math) → Layer 2 (backend specialist math) → Layer 3 (GARCH/MC spec) → Layer 4 (usefulness vs overtooling) → commit gate → final re-audit.

---

## The Forecasting Problem (Ground Truth — Never Deviate)

**Target:** Future ZL (soybean oil futures) PRICE LEVEL at 30d, 90d, 180d horizons.
**Target column:** `target_price_{h}d` = `close.shift(-horizon)` — a LEVEL, not a return.
**User:** Chris (buyer). ZL UP = bad. Strategy = ACCUMULATE vs WAIT.
**Useful signal:** Anything that reliably shifts the conditional distribution of ZL prices 1–6 months forward.
**Useless signal:** Anything that adds noise, is redundant, is computationally expensive without lifting accuracy, or is cosmetically sophisticated but uncorrelated with ZL fundamentals.

---

## Loop 0 — Pre-Flight

STOP if any item fails. Do not begin auditing.

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────
[ ] Read python/fusion/config.py — confirm SPECIALISTS (11) and HORIZONS [30,90,180]
[ ] Read lib/chart/autofib.ts — chart-side fib logic
[ ] Read components/chart/ZlCandlestickChart.tsx — chart-side volatility logic
[ ] Read components/dashboard/ProbabilitySurface.tsx — target zone rendering spec
[ ] Read app/api/dashboard/risk-factors/route.ts — driver scoring logic
[ ] Read run_garch.py and run_monte_carlo.py — specs (even if scaffold)
[ ] git status — read-only session confirmed (no uncommitted edits expected from this skill)
─────────────────────────────────────────────────────────────
Do not modify any file during Loops 1-4. All edits go through Loop 5 (commit gate).
```

---

## Loop 1 — Chart-Side Math Audit (Sequential, All Sections)

Read the relevant chart source first, then verify each formula.

### Section 1A — Realized Volatility (20-Bar Log Returns)

**Claimed formula:** Rolling 20-bar log returns, annualized: `sqrt(variance) × sqrt(252) × 100`

**Correct formula (verified):**
$$\sigma_{ann} = \sqrt{\frac{1}{N-1}\sum_{i=1}^{N}(r_i - \bar{r})^2} \times \sqrt{252} \times 100$$

where $r_i = \ln(C_i / C_{i-1})$, N = 20 bars.

**Audit checks:**

- [ ] Returns computed as **log returns** (`Math.log(close_i / close_{i-1})`), not arithmetic (`(c-p)/p`)
- [ ] Denominator is `N-1` (sample variance, not population `N`)
- [ ] Annualization uses `sqrt(252)` for daily bars — correct for futures
- [ ] Edge case: fewer than 20 bars → must return `null` or `undefined`, not zero
- [ ] Edge case: zero close price → division guard required
- [ ] Result scaled by 100 → expressed as percentage — correct for display

**Signal value for ZL forecasting:**

- Realized vol is a backward-looking indicator — it tells you what volatility was, not what it will be
- For chart display only: JUSTIFIED
- As a model feature: JUSTIFIED only if lagged (e.g., `vol_20d_lag1`) — use-it-as-input, not as-a-target

**Verdict template:**

```
PASS / FAIL [specific line] — [reason]
```

---

### Section 1B — Fibonacci Levels (10-Level Autofib)

**Claimed algorithm:** 5 lookback periods (8, 13, 21, 34, 55 bars) — multi-period confluence anchor. 10 levels: 0, 0.236, 0.382, 0.5 (Pivot), 0.618, 0.786, 1.0, 1.236 (T1), 1.618 (T2), 2.0 (T3). Bullish/bearish by comparing close to midpoint.

**Correct Fibonacci retracement formula:**
$$F_{level} = H - (H - L) \times ratio$$

where $H$ = anchor high, $L$ = anchor low, $ratio \in \{0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0\}$

**Correct Fibonacci extension formula (T1, T2, T3):**
$$F_{ext} = H + (H - L) \times (ratio - 1.0)$$

where $ratio \in \{1.236, 1.618, 2.0\}$

**Audit checks for `lib/chart/autofib.ts`:**

- [ ] For each lookback period, `high` = max of period, `low` = min — **not** close
- [ ] Confluence scoring: each lookback votes for one anchor set; anchor with most votes at widest range wins
- [ ] Direction: if `close > midpoint(H, L)` → bullish (levels below current price are retracements). If bearish → levels above are resistance extensions
- [ ] Extensions T1/T2/T3: formula uses `H + (H - L) × (ratio - 1.0)` for bullish, equivalent for bearish
- [ ] Level labels displayed correctly: 0.5 = "Pivot", 0.236/0.764/etc. as retracements
- [ ] The lookback periods 8, 13, 21, 34, 55 are Fibonacci numbers — consistent and intentional
- [ ] No off-by-one error in the period lookback (period of 8 means bars[0..7], not bars[1..8])

**Signal value for ZL forecasting:**

- Fibonacci is a **technical, price-pattern indicator** — contested signal theoretically
- For ZL (a commodity future with fundamental price drivers): Fibonacci adds visual context for traders but low fundamental predictive power
- As a chart-display tool for Chris/Kevin: JUSTIFIED — helps visual decision-making
- As an AutoGluon feature: **OVERTOOLED** — do not feed raw fib levels into ML training. The ML model has specialist fundamentals for price-level prediction.
- **Verdict: CHART-DISPLAY ONLY. Correct to exclude from training features.**

---

### Section 1C — Target Zone Rendering (P30/P50/P70)

**Claimed spec:** Horizontal lines at quantile levels from `forecasts.target_zones`. P30=red-dashed, P50=orange-solid, P70=white-solid. Band opacity: 0.12 start, -0.03 per horizon.

**Audit checks for `components/dashboard/ProbabilitySurface.tsx`:**

- [ ] Lines are drawn at exact price levels from the database column (no client-side adjustment)
- [ ] P30 label and P70 label are not swapped (common inversion bug: lower quantile = lower price level for an uptrend, but NOT always — verify it's raw quantile from MC output, not inverted)
- [ ] P50 is the median, not the mean — for skewed distributions these differ; confirm it's `quantile(0.5)`, not `mean()`
- [ ] Per-horizon ordering: 30d, 90d, 180d columns render in ascending horizon order
- [ ] Cell intensity is highest near P50 and bounded inside P30/P70
- [ ] Alpha calculation falls gracefully when data is missing
- [ ] No hardcoded price levels — all from DB

**Math note — quantile interpretation:**

- P30 means 30% of MC simulations land BELOW this level → relatively bearish bound
- P70 means 70% of MC simulations land BELOW this level → 30% above this level
- **Correct interpretation for Chris:** "ZL has a 70% chance of being below [P70 price] in [N] days"
- This is NOT a 70% confidence interval — it's a one-sided CDF percentile

---

### Section 1D — Risk-Factor Driver Scoring

**Location:** `app/api/dashboard/risk-factors/route.ts`
**5 driver categories:** vix_stress, crush_pressure, china_tension, tariff_threat, energy_stress

**Audit checks:**

- [ ] `coerceScore(val)` — clamps to [0, 100], handling null → 0 default acceptable? Or should null → explicit "no data" state?
- [ ] `levelFor(key, score)` — each key has distinct thresholds. Audit crush thresholds specifically: "Plant Idling" at 85+, "Margin Squeeze" at 65+ — are these thresholds grounded in domain knowledge or arbitrary?
- [ ] `regimeFor(level)` — maps to PRESSURE/WATCH/CALM. Verify: "Plant Idling" → PRESSURE, "Stable" → CALM — correct mapping?
- [ ] `outlookFromScore(score)` — BULLISH/NEUTRAL/CAUTIOUS/BEARISH. Direction: for Chris (buyer), BEARISH = ZL going down = GOOD. Is the label direction from the buyer's perspective or price movement perspective? **Flag if ambiguous.**
- [ ] Are all 5 driver scores reading from real `analytics.dashboard_metrics` data, or falling back to default values? Fallback to 0 is silent failure — must be visible in UI as "No data"

**Signal value:**

- These 5 categories map (loosely) to crush, volatility, china, tariff, energy specialists
- As pre-scoring logic for dashboard display: JUSTIFIED
- **Overtooling risk:** If the thresholds (85, 65, etc.) are not calibrated against actual ZL price outcomes, they are decorative, not informative. Flag as NEEDS CALIBRATION.

---

## Loop 2 — Specialist Feature Math Audit

Work through each specialist. For each: determine expected indicators → check if implementation matches → assess signal value.

**IMPORTANT:** As of current codebase state, all specialist Python code is scaffold. This loop audits:

1. What indicators SHOULD each specialist compute (grounded in ZL fundamentals)
2. Whether any stub/comment/design doc specifies indicators that are mathematically wrong
3. Whether the indicator set is appropriate or overtooled for that specialist's domain

Run each section sequentially. Flag issues per the severity scale at the end.

---

### Section 2A — Crush Specialist

**Fundamental driver:** Board crush spread = `ZS_price - ZL_price - ZM_price` (in correct weight-adjusted units)

**Correct crush margin formula (weight-adjusted):**
$$\text{Crush} = (ZL_{price} \times 11 \times 0.025) + (ZM_{price} \times 0.004) - ZS_{price}$$

where 1 bushel of soybeans yields ~11 lbs oil and 44 lbs meal (approximate).

**Expected indicators:**

- Board crush spread (raw $)
- Board crush z-score (rolling 252-day normalization)
- Crush momentum (N-day slope of crush spread)
- Oil share ratio: `ZL_revenue / (ZL_revenue + ZM_revenue)`
- Crush margin percentile vs 3-year history

**Overtooling risk:** Adding 20+ rolling windows of crush spread (5d, 10d, 20d, 60d, 120d, 252d) creates multicollinearity — AutoGluon's LightGBM handles some of this, but excess windows inflate the feature matrix without proportional signal gain. **Recommend:** Maximum 3 rolling windows per raw indicator (short/medium/long lookbacks only).

**Audit checks:**

- [ ] Weight adjustment: 11 lbs oil and 44 lbs meal per bushel — **exact conversion factors must match those used for actual trading**
- [ ] ZL unit: cents/lb × 60,000 lbs/contract → dollar margin
- [ ] Crush z-score uses rolling 252-day mean/std, handles < 252 rows at start of series
- [ ] Oil share ratio bounded [0,1] — if ZM price spikes, ratio can exceed 1 temporarily; add clip guard

---

### Section 2B — China Specialist

**Fundamental driver:** Chinese soybean oil import demand and domestic crush capacity utilization.

**Expected indicators:**

- China import volume YoY change (%)
- Import volume vs 3-year average (z-score or ratio)
- Brazil crop status proxy (inverse correlation — Brazil cheap = China buys Brazil, not US)
- CNY/USD rate influence on effective ZL cost to Chinese buyers
- Seasonal adjustment: China stockpiling pre-CNY vs post-CNY drawdown

**Overtooling risk:**

- Adding micro-sentiment about China tariffs here AND in the tariff specialist is duplication — China-specific tariff risk belongs in `tariff`, not in `china`
- Do not use raw WTI crude as a China feature — that belongs in `energy`

**Audit checks:**

- [ ] Import volume is monthly data — must be forward-filled to daily alignment before joining feature matrix
- [ ] YoY change computed as `(current_month - same_month_prior_year) / same_month_prior_year` — not rolling 12-month change (which lags the seasonal signal)
- [ ] CNY/USD should be lagged by at least 1 day to avoid lookahead bias

---

### Section 2C — FX Specialist

**Fundamental driver:** USD strength vs. key commodity currencies.

**Expected indicators:**

- DXY level and momentum (USD index — inverse to ZL generally)
- BRL/USD rate (Brazilian real — weaker BRL = Brazilian soybeans cheaper in USD = ZL competition)
- CNY/USD rate (covers China purchase power)
- Rate-of-change for each FX pair (5d, 20d slopes)

**Math checks:**

- [ ] FX conventions: quote with USD in denominator (USD/BRL) or numerator (BRL/USD)? **Must be consistent.** ZL is negatively correlated with USD strength → rising DXY = bearish ZL signal. If the sign is inverted, the feature vector is backwards.
- [ ] FX z-scores: use rolling window, not fixed historical — FX regimes shift
- [ ] Do not use EUR/USD here — not materially relevant to ZL

**Overtooling risk:** Including every G10 FX cross is overtooled for a soybean oil model. **Only CNY/USD, BRL/USD, and DXY are fundamentally linked.** Adding AUD, JPY, or MXN introduces noise.

---

### Section 2D — FED Specialist

**Fundamental driver:** Federal Reserve policy effects on commodity financial flows and USD.

**Expected indicators:**

- Effective Fed Funds Rate (level)
- 10Y-2Y yield curve spread (inversion signal)
- Real rate = nominal 10Y - breakeven inflation
- M2 growth rate (monetary expansion → commodity reflation)
- Fed policy surprise index (if available from FRED)

**Math checks:**

- [ ] Real rate = `DGS10 - T10YIEM` (FRED series) — both in percent, sign matters: positive real rate = restrictive
- [ ] Yield curve: `DGS10 - DGS2` — when negative (inverted) = historical recession signal, typically bearish commodities
- [ ] M2 growth rate: YoY `(M2_current - M2_prior_year) / M2_prior_year × 100`

**Overtooling risk:** Including SOFR, QT balance sheet changes, and term premium decomposition is academic-level complexity that likely adds minimal marginal signal at 30–180 day ZL horizons. Stick to the 4 indicators above.

---

### Section 2E — Tariff Specialist

**Fundamental driver:** US-China trade policy shocks affecting ZL and soybean import tariffs.

**Expected indicators:**

- Active tariff rate on ZL/ZS imports (discrete — from legislative data)
- Economic Policy Uncertainty (EPU) index
- Trade tension event binary (1 = tariff action, 0 = none) — rolling event decay
- Tariff change momentum (slope over 30 days)

**Math checks:**

- [ ] Tariff rates are categorical changes (discrete jumps), not continuous — rolling mean of a step function is misleading; use last-known-value forward fill
- [ ] EPU index is available from FRED (`USEPUINDXD`) — confirm series code matches
- [ ] Event binary: event detected at date T → decay exponentially over N days. Formula: `signal_t = event_t + λ × signal_{t-1}` where `λ = 0.9` — verify λ is documented, not arbitrary

**Overtooling risk:** Parsing full legislative text (NLP on Federal Register) is valid for `biofuel` (where mandate text drives demand). For tariffs, the signal is captured by EPU and discrete rate changes — full NLP is overtooled unless backed by ablation study.

---

### Section 2F — Energy Specialist

**Fundamental driver:** ZL and crude oil co-movement (biofuel feedstock linkage).

**Expected indicators:**

- WTI crude price level and 20d momentum
- Natural gas price (Henry Hub) — heating oil competition signal
- Energy sector ETF beta to ZL (rolling 60d correlation)
- Crack spread proxy (refinery margin)

**Math checks:**

- [ ] Correlation: rolling 60d Pearson between ZL log returns and WTI log returns. Both must be log returns, same frequency, same calendar alignment
- [ ] Momentum: `(WTI_today - WTI_Nd_ago) / WTI_Nd_ago` — arithmetic return for intuitive interpretation at dashboard level, log return for ML features
- [ ] If using ETF betas: beta = `cov(ZL, ETF) / var(ETF)` — not correlation. These are different.

**Overtooling risk:** Adding electricity prices, carbon credits, coal prices, and natural gas basis differentials — individually marginal, collectively noisy for ZL. Keep to WTI, HH natgas, and one energy sector index.

---

### Section 2G — Biofuel Specialist

**Fundamental driver:** Biodiesel policy and RIN credit economics directly drive ZL demand. This is one of the strongest non-crude signals in ZL.

**Expected indicators:**

- RIN D4 credit price (biodiesel RINs, from EPA)
- EPA biodiesel mandate volume (annual RVO level, converted to daily implied demand)
- ZL-to-FAME spread (ZL cost per gallon of biodiesel vs FAME spot price)
- Policy intensity index (EMA of legislative activity score)

**Math checks:**

- [ ] RIN price to ZL demand elasticity: this is a nonlinear relationship — do not model as linear. Use log(RIN_price) as feature, not raw level
- [ ] EPA mandate volume: annual gallons → daily implied production. Formula: `daily_implied = annual_RVO / 365` — but must account for blend season variation (higher demand in summer)
- [ ] ZL-to-FAME spread: ensure same unit basis ($/gallon ZL converted from cents/lb: `ZL_cents_per_lb × 0.075 = $/gallon`)

**Overtooling risk:**

- NLP on EPA rulemaking documents is justified here (policy text directly sets mandate levels)
- EWM (exponential weighted mean) of policy score: JUSTIFIED for biofuel (regime persistence)
- **Watch:** Do not add corn ethanol pricing here — corn ethanol is a different mandate (D6 RINs), not directly related to ZL. Belongs in `substitutes` at most.

---

### Section 2H — Palm Specialist

**Fundamental driver:** Palm oil (CPO) is ZL's most direct price substitute. CPO/ZL spread drives substitution.

**Expected indicators:**

- CPO price level (MYR/metric ton, converted to USD/lb basis)
- CPO/ZL spread (direct substitution signal)
- MPOB production YoY change (supply shock indicator)
- Palm-ZL cointegration residual (mean-reversion signal)

**Math checks:**

- [ ] CPO price conversion: MYR/MT → USD/lb = `CPO_MYR / (MYRUSD_rate × 2204.62)` — confirm rate and divisor
- [ ] Cointegration residual: Engle-Granger two-step. Step 1: OLS of `log(ZL) ~ log(CPO)`. Step 2: ADF test on residuals. Residual = `log(ZL) - α - β×log(CPO)`. **Must use log prices, not levels, for cointegration.**
- [ ] Mean reversion speed (θ) should be estimated from OLS, not assumed: `Δresidual = θ × residual_{t-1} + ε`

**Overtooling risk:** Adding Malaysian ringgit/USD separately (it's already embedded in the price conversion), and adding separate India palm import data — marginal signal vs added complexity. Keep to CPO price, spread, MPOB supply signal.

---

### Section 2I — Volatility Specialist

**Fundamental driver:** Volatility regime indicates risk-on/off environment and affects ZL price variance.

**Expected indicators:**

- GJR-GARCH(1,1,1) conditional sigma (from `run_garch.py`)
- VIX level and 20d momentum
- ZL historical vol (20d realized — from chart module, reusable)
- Vol of vol (rolling std of VIX over 20 bars)
- GARCH volatility regime: HIGH/NORMAL/LOW (percentile classification)

**GJR-GARCH math (CRITICAL — must be correct):**

$$\sigma_t^2 = \omega + \alpha \epsilon_{t-1}^2 + \gamma \epsilon_{t-1}^2 \mathbb{1}(\epsilon_{t-1} < 0) + \beta \sigma_{t-1}^2$$

where:

- $\omega > 0$ (intercept)
- $\alpha \geq 0$ (ARCH effect)
- $\gamma \geq 0$ (asymmetry — leverage effect: negative shocks amplify vol more)
- $\beta \geq 0$ (GARCH persistence)
- Stationarity condition: $\alpha + \frac{\gamma}{2} + \beta < 1$

**Audit checks for `run_garch.py`:**

- [ ] Model order is GJR-GARCH(1,1,1) — p=1, q=1, o=1. If the arch library is used: `arch_model(returns, vol='GARCH', p=1, o=1, q=1)`
- [ ] Returns input must be **multiplied by 100** before fitting (arch library requires mean-zero, percent-scale returns)
- [ ] Distribution: Student-t recommended for commodity futures (fat tails). `dist='t'` — not normal
- [ ] Stationarity check: `α + γ/2 + β < 1` — raise error if violated
- [ ] Seed: `arch_model(...).fit(options={'seed': 42})` — required for reproducibility

**Overtooling risk:**

- EGARCH vs GJR-GARCH: GJR-GARCH is established for commodity futures. EGARCH adds complexity without clear benefit for ZL. **Stick with GJR-GARCH.**
- Do not add a separate GARCH model per specialist — one GARCH model for the volatility specialist is correct.

---

### Section 2J — Substitutes Specialist

**Fundamental driver:** Competitive price pressure from canola, sunflower, and other edible oils.

**Expected indicators:**

- Canola/ZL price ratio (rolling 20d mean of ratio)
- Sunflower oil spread vs ZL
- Combined substitution pressure index (z-score of weighted multi-commodity spread)
- Richness ratio: `ZL_price / blended_substitute_price`

**Math checks:**

- [ ] Price ratio vs. price spread: **ratio is preferred** for commodities traded in different unit bases (ZL is cents/lb, canola in CAD/MT). Convert to same basis first, then compute spread OR normalize both to index = 100 at base date and take ratio.
- [ ] Canola: ICE-listed (RS futures). If using ETF proxy — state clearly and understand basis risk
- [ ] Sunflower: no direct liquid futures for most sources. ProFarmer or USDA report data; handle monthly frequency by forward-filling to daily

**Overtooling risk:** Adding tallow, lard, and domestic FAME prices individually — marginal incremental signal. Tallow/UCO PPI proxies (`WPU06410132`, `PCU3116133116132`) are FRED-available MONTHLY series — include them but note frequency.

---

### Section 2K — Trump Effect Specialist

**Fundamental driver:** Idiosyncratic political/policy shocks that affect agricultural trade policy and ZL-linked commodities.

**Expected indicators:**

- Policy action event binary (1 = trade/agricultural/energy executive action, 0 = none)
- Exponential decay of recent event intensity
- Uncertainty index change (EPU spike at event dates)
- Sector-specific impact score (agricultural action vs. general economic action)

**Math checks:**

- [ ] Event scoring: if using NLP on news, the sentiment score must be **domain-restricted** (agricultural/trade keywords), not general sentiment — general news sentiment adds noise
- [ ] Decay formula: `impact_t = base_score × λ^{days_since_event}`. Recommended λ=0.85 (half-life ≈5 days). **λ must be documented, not hardcoded as magic number**
- [ ] Do not overlap with tariff specialist: trump_effect is for broader political-shock events; tariff-specific rates belong in tariff specialist

**Overtooling risk:** This specialist is highest-risk for overtooling. It is:

- Difficult to validate out-of-sample (events are rare)
- Potentially spurious (ML may overfit to historical events that won't recur)
- **Recommendation:** Keep feature set MINIMAL (decay function + EPU spike only). Flag during Phase 5 if OOF error is not better with this specialist included vs. excluded.

---

## Loop 3 — GARCH and Monte Carlo Specification Audit

### Section 3A — GARCH Specification

**Required spec (from migration plan + checkpoint 7):**

| Parameter          | Required Value                    | Rationale                                                                             |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------- |
| Model type         | GJR-GARCH                         | Handles leverage effect (negative return → higher vol) — well-established for futures |
| Order (p,o,q)      | (1,1,1)                           | Standard; higher orders rarely improve forecast at 30–180d horizons                   |
| Distribution       | Student-t, df estimated           | Fat-tailed returns in futures markets; Gaussian understates tail risk                 |
| Input series       | Daily log returns × 100           | arch library convention                                                               |
| Seed               | 42 (fixed)                        | Reproducibility                                                                       |
| Stationarity check | α + γ/2 + β < 1 before proceeding | Validates GARCH convergence                                                           |

**Audit checks:**

- [ ] All 6 parameters above are defined in `run_garch.py` (even if stub with raise NotImplementedError)
- [ ] GARCH output per trading day: `sigma_t` (conditional daily vol) → annualized for MC: `sigma_ann = sigma_t × sqrt(252)`
- [ ] GARCH forecasts are for the APPROPRIATE HORIZON — not just one-step-ahead. For 30d/90d/180d, use rolling GARCH simulation, not static one-step

### Section 3B — Monte Carlo Specification

**Required spec:**

| Parameter        | Required Value                                  | Rationale                                                            |
| ---------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Simulations      | 10,000                                          | Law of large numbers — P30/P50/P70 stable at 10k                     |
| Drift            | Historical mean daily log return (rolling 252d) | Non-zero drift for trending commodity                                |
| Volatility input | GARCH conditional sigma for each horizon        | Time-varying vol                                                     |
| Distribution     | Normal (drift + sigma from GARCH) or Student-t  | GARCH already handles fat tails; Gaussian MC after GARCH is standard |
| Seed             | 42 (fixed)                                      | Reproducibility                                                      |
| Horizons         | 30, 90, 180 trading days                        | Matches HORIZONS in config                                           |

**GBM path formula per simulation step:**
$$S_{t+1} = S_t \times \exp\left(\left(\mu - \frac{\sigma_t^2}{2}\right) \Delta t + \sigma_t \sqrt{\Delta t} \cdot Z\right)$$

where $Z \sim \mathcal{N}(0,1)$, $\Delta t = 1/252$.

**Audit checks:**

- [ ] The Itô correction term `- σ²/2 × Δt` is present — omitting it introduces upward bias in expected price
- [ ] `sigma` input to each simulation step uses GARCH conditional forecast (time-varying), not a fixed historical vol
- [ ] Seed is set BEFORE the simulation loop, not inside it
- [ ] Output: 10,000 final prices per horizon → extract P30, P50, P70 using `np.percentile(paths, [30, 50, 70])`
- [ ] No path clipping at zero (ZL prices can theoretically go very low — let paths go naturally, just clip at 0 as a safety guard)
- [ ] `np.random.seed(42)` or `rng = np.random.default_rng(42)` — use the newer API

---

## Loop 4 — Overtooling Assessment

Work through this checklist after Loops 1–3. Classify each indicator as ESSENTIAL, JUSTIFIED, MARGINAL, or OVERTOOLED.

**Classification criteria:**

- **ESSENTIAL:** Directly reflects a fundamental ZL price driver; well-documented signal; cannot be removed without degrading accuracy
- **JUSTIFIED:** Adds incremental signal; cost (compute, complexity) is proportional to benefit; supported by domain logic
- **MARGINAL:** Weak theory link; duplicated signal (covered by another feature); should be cut if OOF error doesn't improve with it
- **OVERTOOLED:** No clear theoretical link to ZL fundamentals; pure technical noise; adds multicollinearity; cosmetically sophisticated

| Indicator                                 | Layer        | Classification | Reason                                                                |
| ----------------------------------------- | ------------ | -------------- | --------------------------------------------------------------------- |
| Board crush spread (z-score)              | crush        | ESSENTIAL      | Direct ZL fundamental                                                 |
| CPO/ZL spread                             | palm         | ESSENTIAL      | Most direct substitute price signal                                   |
| GARCH conditional sigma                   | volatility   | ESSENTIAL      | Required for MC; captures asymmetric vol                              |
| CNY/USD, BRL/USD                          | fx           | ESSENTIAL      | Direct trade-flow cost drivers                                        |
| RIN D4 credit price                       | biofuel      | ESSENTIAL      | Direct ZL biodiesel demand driver                                     |
| China import YoY %                        | china        | ESSENTIAL      | Volume demand signal                                                  |
| WTI crude momentum                        | energy       | JUSTIFIED      | Biofuel link; energy complex co-movement                              |
| Tariff rate (discrete)                    | tariff       | JUSTIFIED      | Step-function input; real economic cost                               |
| EPU index                                 | tariff       | JUSTIFIED      | Uncertainty proxied from reputable source                             |
| Fed funds rate level                      | fed          | JUSTIFIED      | Financial flows to commodities                                        |
| 10Y-2Y yield curve                        | fed          | JUSTIFIED      | Macro regime signal                                                   |
| VIX level                                 | volatility   | JUSTIFIED      | Risk environment signal                                               |
| Realized 20d vol (chart)                  | chart        | JUSTIFIED      | Display only — not ML feature                                         |
| MPOB production YoY                       | palm         | JUSTIFIED      | Supply shock                                                          |
| Fibonacci levels                          | chart        | JUSTIFIED      | Display/navigation only — not ML feature                              |
| Pivot zone fill                           | chart        | JUSTIFIED      | Display only                                                          |
| Substitution pressure index               | substitutes  | JUSTIFIED      | Composite of canola/sunflower                                         |
| Trump effect decay score                  | trump_effect | MARGINAL       | Validate with/without ablation before keeping                         |
| Corn ethanol price                        | biofuel      | MARGINAL       | D6 RINs, not D4 — weak ZL link                                        |
| >3 rolling windows per indicator          | any          | OVERTOOLED     | Multicollinearity; AutoGluon's LightGBM handles 2-3 lookbacks, not 6+ |
| EUR/USD, JPY/USD, AUD/USD                 | fx           | OVERTOOLED     | Not systematically linked to ZL trade flows                           |
| Full legislative NLP on tariffs           | tariff       | OVERTOOLED     | EPU index already captures this signal                                |
| Coal prices, electricity prices           | energy       | OVERTOOLED     | No direct ZL mechanism                                                |
| India palm import data                    | palm         | OVERTOOLED     | CPO/MPOB already captures palm supply adequately                      |
| Raw Fibonacci price levels as ML features | chart        | OVERTOOLED     | Technical indicator in a fundamentally-driven model                   |
| 20+ FX crosses                            | fx           | OVERTOOLED     | Signal dilution                                                       |

---

## Loop 4.5 — Change Plan + Approval Gate (MANDATORY Before Any Edit)

After the overtooling assessment (Loop 4), **STOP. Do not touch any file yet.**

Compile all issues found across Loops 1–4, produce a written change plan, and present it to the user for explicit approval.

```
CHANGE PLAN FORMAT
─────────────────────────────────────────────────────────────
## Proposed Indicator Fixes — [YYYY-MM-DD]

### Math Errors to fix ([N] total):
1. [file:line] — [incorrect formula] — [correct formula]
2. ...

### Spec Gaps to document ([N] total):
1. [file] — [missing parameter] — [value to add]
2. ...

### Overtooled indicators to remove or flag ([N] total):
1. [indicator name] — [specialist/layer] — [action: remove / flag for ablation]
2. ...

### Files that will be modified:
- [filename] — [what changes, exact lines if known]

### Files that will NOT be touched:
- [filename] — [why out of scope]

### What will NOT be done in this session:
- [items deferred for separate approval]

### Estimated risk:
- [LOW / MEDIUM / HIGH] — [reason]
  - Math formula fixes: HIGH (change model output)
  - Removing overtooled features: MEDIUM (may affect training)
  - Adding spec comments: LOW

─────────────────────────────────────────────────────────────
STOP HERE. Present this plan to the user.
Do NOT edit any file until the user explicitly says:
  - "yes, proceed"
  - "proceed with math fixes only"
  - specific approval of the listed changes

Silence is NOT approval. Uncertainty is NOT approval.
A vague "ok" is NOT approval — confirm the exact scope.
─────────────────────────────────────────────────────────────
```

**If approved in full:** proceed to Loop 5 with all listed changes.
**If approved in part:** proceed only with approved items. Log deferred items in final report.
**If declined:** emit the review report with findings only. No files modified.

---

## Loop 5 — Commit Gate (After Each Approved Fix)

Only run for changes explicitly approved in Loop 4.5. One logical fix = one commit.

```
COMMIT GATE (per fix)
─────────────────────────────────────────────────────────────
0. STATE INTENT: "About to commit: fix(indicators): [description]. Proceed?"
   STOP until user confirms.
1. git diff --stat              (confirm scope — only expected indicator files changed)
   STOP if unexpected files appear — report to user, do not commit.
2. git diff                     (review every changed line — no surprises)
3. git add -p                   (stage selectively — never git add .)
4. git commit -m "fix(indicators): [specific fix — e.g., Itô correction in MC, GARCH Student-t dist]"
5. git push origin [branch]
6. Confirm push succeeded
─────────────────────────────────────────────────────────────
NEVER: git add .
NEVER: git push --force
NEVER: batch multiple unrelated indicator fixes in one commit
NEVER: commit without stating intent and receiving explicit confirmation
One logical fix = one commit
```

---

## Loop 6 — Final Re-Audit (After Commit)

After each commit:

1. Re-read the specific file that was changed
2. Re-run only the section that contained the issue
3. If clean → mark issue resolved
4. If new issue appears → return to Loop 1 for that section
5. After all sections clean → emit final report

---

## Issue Severity Reference

| Severity        | Definition                                                                    | Example                                                                                 |
| --------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **MATH ERROR**  | Formula is provably incorrect — will produce wrong outputs                    | Missing Itô correction in MC; population variance instead of sample; wrong FX direction |
| **SPEC GAP**    | Parameter is unspecified — will produce non-reproducible or undefined outputs | GARCH distribution not set; MC seed missing; GARCH order unknown                        |
| **SIGNAL RISK** | Indicator is theoretically valid but misused for this problem                 | Fibonacci levels fed as ML features; lagging indicator used as leading                  |
| **OVERTOOLED**  | Indicator adds complexity without proportional signal value                   | 20+ FX crosses; duplicate rolling windows; academic-level decompositions unvalidated    |
| **NOTE**        | Minor style issue or documentation gap — does not affect output               | Missing unit comment; lambda value undocumented                                         |

---

## Final Report Format

```
## Indicator Review — [YYYY-MM-DD]
## Layers reviewed: [1=chart, 2=specialists, 3=GARCH/MC, 4=overtooling]

### Math Errors (fix immediately)
- [file:line — formula — what's wrong — correct formula]

### Spec Gaps (fix before Phase 5 training)
- [file — parameter — what value is needed]

### Overtooled Indicators (cut or defer to ablation study)
- [indicator — specialist — reason — recommendation]

### Signal Risk Flags
- [indicator — issue — recommended use]

### Confirmed Correct
- [indicator — brief confirmation]

### Phase 5 Math Readiness
- GARCH spec complete: [yes/no — missing: list]
- MC spec complete: [yes/no — missing: list]
- Itô correction verified: [yes/no]
- All overtooled indicators catalogued: [yes/no]
- Recommendation: [READY FOR IMPLEMENTATION / SPEC WORK NEEDED FIRST]
```

---

## Hard Rules

- Never feed chart-display indicators (Fibonacci, pivot fill, realized vol display) into AutoGluon as training features
- Never let GARCH run after Monte Carlo — that is a data corruption bug
- Never omit the Itô correction in GBM paths — it introduces upward bias
- The Itô term is `- (σ²/2) × Δt` — this is NOT optional
- GARCH distribution must be Student-t for commodity futures — Gaussian underestimates tail risk
- All random processes must use a fixed seed — unreproducible outputs are not valid evidence
- Overtooled = cut, not refine — don't add calibration complexity to signals that shouldn't exist
- **Never edit any file without a written change plan explicitly approved by the user first**
- **Never fix more than what was approved — no scope creep**
- **Never commit without stating intent and receiving explicit user confirmation**
- **Silence is not approval. Proceed only on explicit "yes, proceed" or equivalent**
