# V16 Security Model (Scaffold)

## Access Tiers
- Browser users: authenticated session/JWT with RLS-constrained reads.
- System jobs: service role for controlled writes.

## Route Boundaries
- No Vercel cron/API cron route class exists in V16; ingestion runs through Supabase pg_cron by default and the ZL chart exception runs through local DuckDB plus Python promotion.
- `/api/auth/check` validates active claims.
- Protected page and API routes require Supabase Auth claims.

## Secret Handling
- `NEXT_PUBLIC_*`: URL + publishable key only.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only usage (`lib/server/supabase-admin.ts`).
- ProFarmer credentials stay off Vercel.

## Required Controls
- RLS enabled for all created tables.
- Ingestion runs logged to `ops.ingest_run`.
- Build/typecheck gates required before merge.
