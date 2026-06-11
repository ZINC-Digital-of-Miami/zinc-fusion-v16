# Data-Source Pivot & Stabilization Plan — 2026-06-11

**Status:** DRAFT — pending checkpoint decisions (CP-1 … CP-6 below)
**Authority:** subordinate to `AGENTS.md` and `docs/plans/2026-03-17-v16-migration-plan.md`; supersedes the data-source assumptions in the 2026-05-17 dashboard plan where they conflict. Fold into the canonical plan at Phase 6.
**Prepared from:** 2026-06-11 incident verification, 70-finding architecture audit (28-agent, adversarially verified), and live source research (financialdata.net docs, FRED API, Yahoo v8, CFTC Socrata — all verified 2026-06-11).

## Locked Decisions (Kirk, 2026-06-11)

| # | Decision |
|---|----------|
| L1 | **financialdata.net** is the FinancialData API in use (not financialdatasets.ai). Primary paid source for daily EOD futures/commodity prices. |
| L2 | **Databento: frozen as a sunk asset.** Existing DuckDB 1h ZL history (through 2026-05-18) is kept for training/backfill. NO new Databento pulls. |
| L3 | **Cards become data-driven with honest provenance. No LLM in the card path.** The fake `model: gpt-5.5-heavy` stamps are removed; deterministic server-computed bodies become the documented design. |
| L4 | **All credentials move into V16** (`.env.local` + Supabase Vault). The V15 sibling-repo fallback is deleted. Glide pulls run from this repo only. |

## Verified Source Capability Map (2026-06-11)

| Need | Primary | Fallback | Notes |
|------|---------|----------|-------|
| ZL daily deep history (backfill) | Yahoo v8 one-shot (`period1/period2`, 26y/6,673 bars, 1 request) cross-checked vs financialdata.net (10y daily) | — | `range=max` silently downsamples to monthly — never use it; explicit epochs only. ZL=F is front-month: roll jumps — do not compute returns across rolls blindly (affects crush + forecast bands). |
| ZL/ZS/ZM/CL daily go-forward | financialdata.net — **VERIFIED 2026-06-11 with key**: ZL/ZS/ZM/HO/ZC/ZW/KE all in commodity catalog; ZL same-day EOD bar present (2026-06-11); history to 2015-09-01 (~2,709 rows, 300/req offset pagination) | Yahoo v8 small-range pulls | EOD only. Account = **Premium, expires 2026-06-30** — renewal must stay current (heartbeat must alert on 401s); their terms put commercial/internal-business use at Professional tier — Kirk to confirm/upgrade (CP-2b). |
| ZL hourly freshness | Yahoo v8 1h (rolling 730-day cap) **or** drop to EOD cadence | — | Decision CP-3. financialdata.net has NO intraday futures. |
| VIX / OVX | financialdata.net `^VIX`/`^OVX` — **VERIFIED**, same-day close, plus term structure (^VIX1D/3M/6M, ^VVIX) | FRED `VIXCLS`/`OVXCLS` (next-morning, full history 1 request) | Same-day beats FRED's next-morning lag; FRED stays the deep-history backfill. |
| USD/CNY | financialdata.net `USDCNH` (offshore yuan — **VERIFIED** in forex catalog) or Yahoo `CNY=X` | FRED `DEXCHUS` (weekly-lagged — history only) | CNH≈CNY for the china card; pick one and label it honestly (CP-5). |
| Policy uncertainty (EPU) | FRED `USEPUINDXD` | — | Already the source; moves from manual Python to pg_cron. |
| CFTC COT soybean oil | CFTC Socrata `publicreporting.cftc.gov` (code `007601`, legacy `6dca-aqww` since 1986, disaggregated `72hh-3qpy` since 2006; weekly Fri 3:30pm ET; no key) | — | Makes `mkt.cftc_1w` self-refreshing — kills the stale managed-money card. |
| Tallow/rendering proxies | FRED `WPU06410132`, `PCU3116133116132` (monthly) | — | Future UCO card. |
| Soybean-oil price context | FRED monthly PPI (`PCU3112243112243`, `WPU064101312`) + IMF `PSOILUSDM` | — | No daily soy-oil series exists on FRED. |
| News/legislation feeds | unchanged: EIA RSS, Fed press, Federal Register, congress.gov, whitehouse.gov (Python weekly lane) | — | Narrative-only; not worth pg_cron port now. |
| Glide CRM (Vegas) | Glide API, token in V16 Vault/env (L4) | — | Schedule decision CP-4. |

## Phases

### Phase 0 — Close the June incident *(in flight)*
1. Stage 4 pending files + corrected `docs/ops/2026-06-11-fable-turnover.md` + this plan; `npm run guard:pre-commit` must PASS (contract-sync satisfied by the docs files); commit; push.
2. Reconnect GitHub→Vercel integration (dashboard) **or** `vercel deploy --prod`; verify deployed SHA == HEAD.
3. One manual refresh round: Glide sync, `fill_site_with_trusted_data.py`, `SELECT ops.ingest_trusted_site_fill()`, DuckDB promote (last Databento-sourced promote — archive run).
4. **CP-1:** Supabase plan decision (free tier re-pauses after ~7 idle days).
**Gate:** prod serves fresh data; deployed commit current; guard PASS.

### Phase 1 — Detection (CI + heartbeat)
1. `.github/workflows/ci.yml`: lint + build + `scripts/guards/operator-precheck.sh` on push/PR (CI is not scheduling; AGENTS rule 5 untouched).
2. `.github/workflows/heartbeat.yml` (scheduled): curl prod health route; freshness probes (max `mkt.price_1d.bucket_ts`, max vegas `synced_at`, deployed SHA vs origin/main HEAD); fail loudly (GitHub email).
**Gate:** a deliberately broken check produces an alert.

### Phase 2 — V16 owns its credentials; Glide on this repo (L4)
1. Add to V16 `.env.local` + Supabase Vault: `GLIDE_BEARER_TOKEN`, `FRED_API_KEY`, `FINANCIALDATA_API_KEY` (+ document every key in `.env.example`).
2. Delete `V15_TOKEN_FALLBACK` from `scripts/sync_vegas_glide_to_supabase.py`.
3. Track `hooks/` (pre-commit → fusion_guard) + `git config core.hooksPath hooks`; write `docs/runbooks/recovery.md` and `docs/runbooks/new-machine-bootstrap.md`; add missing Python deps to pyproject.
4. **CP-4:** Glide sync scheduler — (a) pg_cron + http plpgsql port with Vault token (matches AGENTS rule 5 default), or (b) launchd daily on the Mac (requires amending D4 + rule 5 exception list).
**Gate:** Glide sync runs end-to-end with the V15 volume path absent.

### Phase 3 — Data backbone: backfill + automated ingestion
1. **CP-2 spike (30 min):** with the financialdata.net key, confirm ZL/ZS/ZM/HO in `commodity-symbols`/`futures-symbols`, USD/CNY in forex pairs, and the account tier vs commercial-use licensing. If ZL absent → Yahoo becomes price primary; financialdata.net stays for the rest.
2. Backfill (idempotent Python, one-time): ZL daily 26y → `mkt.price_1d` (+ archived in DuckDB); FRED VIXCLS/OVXCLS/USEPUINDXD/DGS10 full history; CFTC COT full soybean-oil history → `mkt.cftc_1w`.
3. Rewrite `ops.ingest_trusted_site_fill()` (migration, approval-gated): pg_cron + http pulls from financialdata.net (ZL/ZS/ZM/CL closes → crush computed fresh, latest price), FRED (VIX/OVX/EPU), CFTC (COT weekly), Yahoo CNY=X — keys via Vault. **Eliminates every carried-forward metric**; news counts remain the Python lane's job, honestly labeled with their own as-of date.
4. **CP-3:** chart freshness — (a) EOD-only via pg_cron (no workstation in serving path; amend AGENTS rule 19), or (b) + Yahoo 1h top-ups into `mkt.price_1h` via pg_cron for intraday candles. Either way **the chart no longer depends on the Mac**; DuckDB becomes training/archive-only (rephrase rule 13/25 accordingly).
5. Decommission Databento references from live paths (keep `zl_duckdb_pipeline` for training reads; remove its promote from the freshness story).
**Gate:** fresh-run `dashboard_metrics` has zero carried-forward values; chart current without any local script.

### Phase 4 — Card rework: data-driven, honest provenance (L3)
1. Delete `fetchTrustedMarketSnapshot()` request-time pulls from strategy/sentiment/legislation routes — read DB metrics only (restores lock #21).
2. Replace the AI-snapshot provenance theater: provenance = real source + series + as-of date (`trusted-live-pull` style); remove fake model stamps; voiced deterministic bodies documented as THE design; `refreshScheduleEt` labels match real cadence.
3. Repair the small verified bugs while in there: `/api/dashboard/metrics` limit-20 truncation, `ops.ingest_run` job-name collision (one-line WHERE fix), dead `trade_policy_index` key, `vegas.venues` dead query, orphan routes/components removal, dedupe the cuisine-affinity copy in the draft route.
4. Commit the shared cadence-parity test vectors (Python unittest + `node --test`), wire the Python one into fusion_guard.
**Gate:** lint/build/tests PASS; pages render same layout with real numbers and honest labels; zero external HTTP in request paths.

### Phase 5 — Automation completion
1. Apply CP-3/CP-4 schedules; schedule `ops.mark_stale_ingest_runs` daily.
2. Freshness surfaced in each page footer (as-of dates already in payloads).
**Gate:** 7 untouched days → every surface fresh per its documented cadence.

### Phase 6 — Docs consolidation (single change)
1. Canonical migration plan: vegas = 12 tables, weekly cadence column, new source map; fold in the 05-07 addendum.
2. Amend AGENTS.md: rule 13/19/25 rephrase (DuckDB = training/archive; chart cadence per CP-3), D2/D4 outcomes, source registry.
3. Delete `docs/ops/risk-matrix.md`, `docs/plans/v16-execution-runbook.md`, `docs/plans/dependency-remediation.md`; banner superseded plans; align INDEX.md reading order; milestone status column.
**Gate:** one source of truth per topic; guard contract-sync passes naturally.

## Open Checkpoints

- **CP-1** Supabase plan (re-pause prevention) — Kirk
- **CP-2** ~~financialdata.net symbol/tier verification~~ **RESOLVED 2026-06-11**: ZL/ZS/ZM/HO/ZC/ZW verified; ZL same-day EOD, history to 2015-09-01; ^VIX/^OVX verified same-day; USDCNH verified; auth is `?key=` query param. Account: Premium, expires 2026-06-30. Residual: **CP-2b** — confirm commercial-use licensing on Premium vs Professional tier; keep renewal current; rotate the key once stored in Vault (it transited chat).
- **CP-3** ~~Chart freshness~~ **RESOLVED 2026-06-11 (executed):** hourly EOD via `market_eod_fill` pg_cron — financialdata.net's current-day bar updates intraday, so the live candle stays fresh with zero Yahoo in the serving path and zero workstation dependency. AGENTS rules 5/19 amended in the same change. Yahoo 1h intraday bars remain available later if true intraday candles are ever wanted (mkt.price_1h is now a frozen Databento archive).
- **CP-4** Glide sync scheduler: pg_cron+http port vs launchd lane — still open
- **CP-5** ~~SQL-cron source swap~~ **RESOLVED 2026-06-11 (executed):** `ops.ingest_market_eod()` pulls financialdata.net commodity-prices ZL/ZS/ZM/CL + index-prices ^VIX/^OVX + forex-prices USDCNH, FRED USEPUINDXD (api.stlouisfed.org, Vault key), computes board crush fresh; `ops.ingest_cftc_cot()` pulls CFTC Socrata weekly. Backfill executed: mkt.price_1d = 6,646 ZL bars 2000-03→today (Yahoo deep + financialdata.net primary, 2,709-day overlap cross-validated at zero close difference); mkt.cftc_1w = 1,920 weekly reports 1986→today. Old `trusted_site_fill` unscheduled, kept as recovery writer. Migration `202606110001`.
- **CP-6** Confirm news/RSS stays in the weekly Python lane (narrative-only) for now
- **CP-7** Premium catalog extensions (probed live 2026-06-11, all working with the key): `insider-transactions`, `short-interest` (biweekly settlements + days-to-cover), `senate-trading`/`house-trading` (per-ticker congressional trades), `latest-news` (date-keyed, full article text, ticker-tagged), `economic-calendar` (global macro events, actual vs previous), `fed-press-releases`/`sec-press-releases` (date-keyed). Proposed use — **training-lane neural features, NOT cards**: weekly pulls on a soy-complex equity basket (ADM, BG, DAR, INGR, TSN…) feeding specialists — crush (ADM/BG insider + shorts), substitutes/UCO (DAR), tariff + trump_effect (congressional ag-ticker trading), fed (fed-press-releases). Gates: AGENTS source-reduction lock #23 (expanding the source registry needs an explicit lock), training gate (no training without approval), persist raw pulls so live-feed logic never becomes unreproducible training truth. Decision deferred to the AG training phase; nothing in Phases 0–6 depends on it. Note: `latest-news` is equity-ticker news — it supplements but does not replace the policy/energy feeds behind the soy/china/tariff news counts.
