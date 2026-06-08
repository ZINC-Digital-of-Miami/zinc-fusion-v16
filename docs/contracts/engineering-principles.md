# V16 Engineering Principles (Executable)

## Fail-Closed Core
- If safety or data integrity is unclear, stop and mark the item blocked.
- Never assume schema compatibility: verify with migration SQL and table introspection.
- Never claim behavior without command output or file evidence.

## Data Contract-First
- API contracts are derived from schema contracts.
- Every table must have a writer and a reader.
- Every external feed write must include `ingested_at` and source traceability.

## Quant Safety
- No future leakage into features.
- Target labels remain explicit and versioned (`target_price_{h}d`).
- Forecast writes must include model version and feature snapshot metadata.

## Security Baselines
- `SUPABASE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only.
- No Vercel cron/API cron route class is part of V16.
- RLS is mandatory for all schemas from initial migration.
