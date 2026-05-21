# V16 Security Model (Scaffold)

## Access Tiers
- Build-mode browser users: open access while `AUTH_DISABLED_FOR_BUILD` is true in `lib/auth-mode.ts`.
- Final production browser users: authenticated session/JWT with RLS-constrained reads.
- System jobs: service role for controlled writes.

## Route Boundaries
- No Vercel cron/API cron route class exists in V16; ingestion runs through Supabase pg_cron by default and the ZL chart exception runs through local DuckDB plus Python promotion.
- During the build phase, `middleware.ts`, `(protected)/layout.tsx`, and `requireAuthenticatedApiRequest()` must allow requests without Supabase claims.
- `/api/auth/check` returns `authDisabledForBuild: true` while the build-mode auth switch is active.
- Server API data reads use `lib/server/server-data-client.ts`, which selects the server-only service-role client while build-mode auth is disabled and returns to the request-bound Supabase client when auth is re-enabled.
- Re-enabling final production auth requires flipping `AUTH_DISABLED_FOR_BUILD` to false, then verifying protected page redirects, protected API `401` behavior, and RLS-backed reads in the same gate.
- Vegas Glide operational tables (`vegas.export_list`, `vegas.scheduled_reports`, `vegas.shifts`, `vegas.shift_casinos`, `vegas.shift_restaurants`) must grant `SELECT` to `service_role` so server-only build-mode reads can expose real coverage counts while browser tokens remain unable to access Glide secrets.

## Secret Handling
- `NEXT_PUBLIC_*`: URL + publishable key only.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only usage (`lib/server/supabase-admin.ts`).
- ProFarmer credentials stay off Vercel.

## Required Controls
- RLS enabled for all created tables.
- Ingestion runs logged to `ops.ingest_run`.
- Build/typecheck gates required before merge.
