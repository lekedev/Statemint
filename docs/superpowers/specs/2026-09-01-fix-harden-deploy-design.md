# Statemint: Fix, Harden, and Deploy

**Status:** Approved
**Date:** 2026-09-01
**Sub-project:** 1 of 2 (the second, "make it unique," is a separate future design cycle)

## Context

Statemint is a monorepo (`statemint/apps/api` + `statemint/apps/web`) that lets
users upload Nigerian bank statement PDFs, auto-categorizes transactions via a
HuggingFace zero-shot model, supports Q&A over a statement via embeddings +
vector similarity search (pgvector), and computes Nigerian personal income tax
(PAYE / self-employed / business) with a deduction and payment-guide engine.

The request driving this spec was "fix this project up and make it ready, and
also make it unique." Those are two different projects with different goals
(trust/correctness vs. product differentiation), so they were split into two
sub-projects. This spec covers only the first: getting the existing feature
set correct, tested, and deployed as a live demo. "Make it unique" is
explicitly deferred until this ships, so new features aren't built on code
that isn't yet trusted.

**Audience for this pass:** a portfolio/demo piece — optimized for reliability
and a clean codebase a reviewer might read, not production-grade
security/scale/compliance for real end users.

## Findings that motivate this spec

Discovered during the codebase audit (2026-09-01). Initial findings (1-6)
came from reading the code; a follow-up `tsc --noEmit` pass on both apps
(done while writing the implementation plan) surfaced that the API
currently **does not compile at all**, which expanded finding 1
considerably (see 1a-1h below) and added finding 7.

1. **Broken build — confirmed via `tsc --noEmit`.** The API does not
   compile. Contributing errors, all confirmed by running the compiler:
   - **(1a)** `tax.service.ts` — the `NIGERIAN_STATES` type annotation is
     missing its opening `Record<` angle bracket in the committed version
     (already fixed in the uncommitted working tree).
   - **(1b)** `qa.service.ts` — `prisma.$queryRaw` generic call is malformed
     (missing `<` before the result type), which cascades into several
     further type errors in the same function.
   - **(1c)** `bull` is pinned to `^1.1.3` in `package.json`, an ancient
     pre-TypeScript release with no bundled type declarations, while
     `@types/bull` is installed as a deprecated stub that assumes bull
     ships its own types. Together these make `tsc` unable to resolve any
     types for the `bull` module and abort compilation entirely — this is
     what was hiding the rest of the errors below. Needs bumping `bull` to
     a current 4.x release (API-compatible with the existing `.process()`
     / `.add()` usage) and dropping the `@types/bull` stub.
   - **(1d)** `lib/hf.ts` — `categorizeTransaction` treats the HuggingFace
     zero-shot response as `ZeroShotResult[]` and reads `result[0].label` /
     `.score`, but the real response (and the declared `ZeroShotResult`
     interface) is a single object with parallel `labels`/`scores` arrays.
     This is a real correctness bug, not just a type error — categorization
     likely silently returns `undefined` at runtime.
   - **(1e)** `auth.routes.ts` — `jwt.sign(..., { expiresIn: ... })` no
     longer type-checks against current `@types/jsonwebtoken`, which
     expects `number | StringValue` rather than a bare `string`.
   - **(1f)** `tax.service.ts` — the `breakdown`/`deductions`/`checklist`
     Prisma `Json` columns are written with plain typed arrays (not
     assignable to `InputJsonValue`) and read back with unsafe direct
     casts instead of going through `unknown` first.
   - **(1g)** `worker.ts` has several implicit-`any` parameters (`job`,
     `t`, `i`) under `strict`/`noImplicitAny`, currently masked by (1c).
   - **(1h)** `src/workers/worker.ts` is a duplicate, dead copy of
     `src/worker.ts` with broken relative imports (missing `../`). It is
     not referenced by any npm script or Dockerfile — appears to be a
     stray leftover file.

   None of this was caught by local `npm run dev` because both
   `dev`/`dev:worker` scripts run via `ts-node-dev --transpile-only`,
   which strips types without checking them. It only surfaces on
   `npm run build` (`tsc`) or the equivalent Docker build step — which
   matters directly for this spec's deploy goal.

2. **Unhandled async errors.** The API runs Express 4.19, which does not
   forward rejected promises from async route handlers to error-handling
   middleware. None of `auth.routes.ts`, `document.routes.ts`,
   `analytics.routes.ts`, or `tax.routes.ts` wrap handlers in try/catch or use
   `express-async-errors`. Any thrown/rejected error inside a service call
   (e.g. `calculateTax`) currently hangs the request or crashes silently
   instead of returning a clean 500.
3. **Insecure fallback defaults.** `middleware/auth.ts` falls back to the
   literal string `'fallback_secret'` if `JWT_SECRET` is unset;
   `src/index.ts` falls back to `origin: '*'` for CORS if `FRONTEND_URL` is
   unset. Both are fine for local dev but dangerous defaults to carry into a
   hosted deployment.
4. **No tests anywhere**, no CI, in either `apps/api` or `apps/web`.
5. **Synthetic-id hack.** `TaxProfile` upsert in `tax.service.ts` uses
   `id: \`${userId}-profile\`` to fake a one-profile-per-user constraint,
   instead of a real `@unique` constraint on `userId`.
6. **Unfinished boilerplate.** `apps/web` still has the stock
   `create-next-app` `README.md` and unused default SVGs in `public/`.
7. **Missing API Dockerfile.** `docker-compose.yml`'s `api` service
   references `dockerfile: Dockerfile` under `apps/api`, but only
   `Dockerfile.worker` exists — `docker-compose up` cannot currently build
   the api service at all. Additionally, `Dockerfile.worker` runs
   `ts-node-dev` (dev mode) as its container command rather than building
   and running compiled JS; both Dockerfiles should build with `tsc` and
   run `node dist/...`, which also ensures the compile errors above
   actually get caught before a deploy rather than silently ignored.
8. **Web build error.** `apps/web/app/analytics/[id]/page.tsx` imports
   `ChatMessage` from `@/types`, but `apps/web/types/index.ts` has no such
   export — confirmed via `tsc --noEmit` on the web app.

## Goals

- Fix the confirmed bugs above.
- Add targeted automated tests around business-critical logic (not full
  coverage).
- Clean up leftover scaffolding/boilerplate.
- Deploy a working live demo: web on Vercel, api+worker+Postgres(pgvector)+
  Redis on Railway.

## Non-goals

- Full test coverage of every route/service.
- Production-grade rate limiting, monitoring/alerting, or horizontal scaling.
- The "make it unique" feature work (separate future spec).
- Legal/compliance handling of financial data (not needed for a demo).

## Design

### 1. Bug fixes

- Commit the `Record<...>` generic fix in `tax.service.ts` (finding 1a).
- Fix the malformed `prisma.$queryRaw` generic call in `qa.service.ts`
  (finding 1b).
- Bump `bull` from `^1.1.3` to a current 4.x release and remove the
  `@types/bull` stub dependency (finding 1c) — this is what's currently
  blocking `tsc` from reporting anything past itself.
- Fix `categorizeTransaction` in `lib/hf.ts` to read the HuggingFace
  zero-shot response as the single-object `{ labels, scores }` shape it
  actually is, instead of indexing into it as an array of per-label
  results (finding 1d).
- Fix the `jwt.sign` call in `auth.routes.ts` to satisfy current
  `@types/jsonwebtoken` typing (finding 1e).
- Fix the `breakdown`/`deductions`/`checklist` Prisma `Json` read/write
  casts in `tax.service.ts` (finding 1f).
- Add explicit types to the previously-masked implicit-`any` parameters in
  `worker.ts` (finding 1g).
- Delete the dead, broken-import duplicate `src/workers/worker.ts`
  (finding 1h).
- Add the missing `apps/api/Dockerfile`, and change both it and
  `Dockerfile.worker` to build with `tsc` and run the compiled output
  (`node dist/...`) rather than `ts-node-dev` (finding 7).
- Add the missing `ChatMessage` export to `apps/web/types/index.ts`
  (finding 8).
- Add an async-error-handling layer so a thrown/rejected error in any route
  reaches the existing global error middleware in `src/index.ts` and returns
  a clean JSON 500, instead of hanging the request. Prefer
  `express-async-errors` (single import, no per-route boilerplate) unless it
  conflicts with the existing route typing patterns, in which case fall back
  to a small `asyncHandler(fn)` wrapper applied to every route handler.
- Replace the `${userId}-profile` synthetic id in `TaxProfile` with a real
  `@unique` constraint on `userId` in `schema.prisma`, a Prisma migration, and
  an updated `upsert` call keyed on `{ userId }`.
- At API startup, fail fast (throw before `app.listen`) if `JWT_SECRET` is
  unset — remove the `'fallback_secret'` fallback. In production
  (`NODE_ENV === 'production'`), require `FRONTEND_URL` to be set and stop
  falling back to `'*'` for CORS; keep `'*'` as the *development-only*
  default.

### 2. Targeted tests

Test runner: **Vitest** (fast, works cleanly with the existing TS/ts-node-dev
setup, no extra Babel config needed).

Coverage, business-critical logic only:

- **Tax engine** (`tax.service.ts`): band calculation across all brackets,
  deductions (pension/NHF/NHIS/rent relief/life insurance, including the
  "not applicable" branches), edge cases (zero income, income exactly at the
  ₦800,000 threshold, all optional profile fields omitted).
- **PDF parser** (`parser.service.ts`): transaction extraction against
  fixture PDF(s) — the existing file in `apps/api/uploads/` can seed the
  first fixture; add at least one more representative sample if easily
  available.
- **Auth** (`middleware/auth.ts` + auth route logic): token issuance and
  verification, rejection of missing/malformed/expired tokens.
- **Route smoke tests** (supertest against the Express app): one happy-path
  test per route file, plus the 401/400/404 branches, to catch the
  async-error-handling regression class described above.

### 3. Cleanup

- Replace `apps/web/README.md` boilerplate with a real description of
  Statemint (what it does, how to run it locally).
- Remove unused default Next.js SVGs from `apps/web/public/` (`file.svg`,
  `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) unless still referenced
  somewhere — verify with a grep before deleting.
- Quick pass over `apps/web/app/{dashboard,tax,analytics}` for anything
  visibly unfinished (placeholder text, dead links) — fix what's found;
  no redesign.

### 4. Deployment

- **Web** → Vercel project pointed at `apps/web`, with an env var for the
  API base URL pointing at the Railway-hosted API.
- **API + worker + Postgres(pgvector) + Redis** → Railway, reusing the
  existing `Dockerfile` / `Dockerfile.worker` and `docker-compose.yml` as the
  reference for required services and env vars (`DATABASE_URL`, `REDIS_URL`,
  `JWT_SECRET`, `HF_API_TOKEN`, `HF_CATEGORIZATION_MODEL`,
  `HF_EMBEDDING_MODEL`, `PORT`). Secrets are set directly in Railway's
  environment config, never committed.
- After both are live, update the API's `FRONTEND_URL` to the real Vercel
  domain and confirm CORS works end-to-end.
- User already has a working HuggingFace API token with sufficient free-tier
  quota for demo use; it only needs to be set as a Railway secret.

## Testing / verification plan

- `npm test` (Vitest) green in `apps/api` for the targeted suites above.
- Manual end-to-end walkthrough on the deployed demo: register → login →
  upload a real statement PDF → wait for parse/categorize/embed pipeline →
  view analytics → ask a Q&A question → run a tax calculation → view the
  payment guide.
- Confirm the API returns clean JSON 500s (not hangs) when a route's
  underlying service throws, verifying the async-error-handling fix.

## Open questions / risks

- Free-tier HuggingFace inference latency/availability under a live demo is
  outside our control; the existing "graceful degradation: returns null on
  failure" behavior in `lib/hf.ts` is accepted as-is for this pass.
- Railway/Vercel free-tier limits (sleep, cold starts) are acceptable for a
  demo; not addressed further here.
