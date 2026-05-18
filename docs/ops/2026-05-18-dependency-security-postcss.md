# 2026-05-18 Dependency Security Note

## Scope

Dependabot alert 9 reported `postcss` vulnerable to GHSA-qx2v-qp2m-jg93
through `package-lock.json`. Dependabot alert 24 reported transitive `ws`
usage below the patched `8.20.1` release through `@supabase/realtime-js`.

## Decision

Keep `next` pinned to `16.2.6` and use npm overrides to force Next's
transitive `postcss` dependency to the root patched `postcss` release. Also
pin the vulnerable `brace-expansion` path used by `minimatch@10.2.4` to the
patched `5.0.6` release surfaced by `npm audit`. Add a direct npm override for
`ws@8.20.1` so Supabase realtime keeps its current package line while using the
patched WebSocket implementation.

## Verification

Required verification for this dependency change:

- `npm audit --json` must report zero vulnerabilities.
- `npm run guard:pre-commit` must pass before commit.
- `npm run guard:pre-push` must pass before pushing `main`.
