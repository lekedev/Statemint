# Statemint: Fix, Harden, and Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get Statemint's existing feature set (auth, statement upload/parse/categorize/embed pipeline, analytics, Q&A, tax calculator) to actually compile, run correctly, have targeted tests around its business-critical logic, and be deployed as a live demo (Vercel + Railway).

**Architecture:** No architectural changes. This is a bug-fix, test, and deploy pass over the existing Express/Prisma API (`apps/api`) and Next.js web app (`apps/web`) in the monorepo. Vitest tooling is set up first (Task 1) since several bug-fix tasks add regression tests as they go; then TypeScript compilation is fully unblocked (Tasks 2-8 — it currently isn't, see spec findings 1a-1h); then runtime hardening; then the remaining targeted tests; then Docker/deploy.

**Tech Stack:** Express 4 + Prisma 5 + Postgres/pgvector + Redis/Bull (api), Next.js 15 + React 19 (web), Vitest + supertest (new — tests), Docker + Railway (api/worker/db/redis) + Vercel (web).

**Spec:** `docs/superpowers/specs/2026-09-01-fix-harden-deploy-design.md`

## Global Constraints

- Node 20 (matches existing Dockerfiles' `node:20-alpine` base).
- Do not change the Express 4 / Prisma 5 major versions — only `bull` is being bumped (to 4.x, per spec finding 1c), and only because the currently-pinned `^1.1.3` has no type declarations and blocks compilation.
- Every task that touches `apps/api/src` must leave `npx tsc --noEmit` (run from `apps/api`) with no *new* errors — the running total of errors is tracked per-task below and must strictly decrease.
- Test runner is Vitest (per spec section 2) — do not introduce Jest.
- No production-grade rate limiting/monitoring/scaling work — this is a demo (per spec non-goals).
- Never commit secrets (`JWT_SECRET`, `HF_API_TOKEN`, `DATABASE_URL`, `REDIS_URL`) — these are set as Railway/Vercel environment variables only.

---

## Part A — Test tooling setup

### Task 1: Vitest setup

Set up first because Tasks 5 and 9 below add regression tests as part of their fixes, and need the test runner already in place.

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/test/setup.ts`

**Interfaces:**
- Produces: `npm test` (in `apps/api`) runs Vitest once; a shared setup file sets `JWT_SECRET`/`NODE_ENV` for every test file, needed once Task 11 makes `JWT_SECRET` required at startup.

- [ ] **Step 1: Install dependencies**

Run: `cd apps/api && npm install -D vitest supertest @types/supertest`

- [ ] **Step 2: Add the test script**

In `apps/api/package.json`, change:

```diff
   "scripts": {
     "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
     "dev:worker": "ts-node-dev --respawn --transpile-only src/worker.ts",
     "build": "tsc",
     "start": "node dist/index.js",
     "start:worker": "node dist/worker.js",
     "prisma:generate": "prisma generate",
     "prisma:migrate": "prisma migrate dev",
-    "prisma:studio": "prisma studio"
+    "prisma:studio": "prisma studio",
+    "test": "vitest run"
   },
```

- [ ] **Step 3: Create the Vitest config and test setup**

Create `apps/api/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

Create `apps/api/src/test/setup.ts`:

```typescript
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-vitest'
process.env.NODE_ENV = process.env.NODE_ENV || 'test'
```

- [ ] **Step 4: Verify the runner works**

Run: `cd apps/api && npm test`
Expected: Vitest runs and reports "no test files found" (no `*.test.ts` files exist yet — that's expected at this point in the plan) without erroring.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/vitest.config.ts apps/api/src/test/setup.ts
git commit -m "test(api): set up Vitest with shared test env setup"
```

---

## Part B — Unblock compilation

These seven tasks fix the errors found by running `npx tsc --noEmit` in `apps/api` (see spec findings 1a-1h) and `apps/web`. They're ordered so each one's fix is independently verifiable by watching the error list shrink, ending with a fully clean compile.

### Task 2: Fix the `bull` dependency (unblocks all further type-checking)

**Files:**
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: a working `bull@^4.16.5` install with its own bundled types, so `tsc` can resolve the `bull` module at all. Nothing downstream changes its public usage — `lib/queues.ts`'s `new Bull<T>(name, redisUrl, opts)`, `.process()`, and `.add()` calls are unchanged; bull v4 is API-compatible with this usage.

- [ ] **Step 1: Confirm the current failure**

Run: `cd apps/api && npx tsc --noEmit`
Expected: `error TS2688: Cannot find type definition file for 'bull'.` — this is the *only* error shown, because it's fatal enough to stop the compiler before it reaches other files.

- [ ] **Step 2: Bump `bull` and drop the stale type stub**

In `apps/api/package.json`, change the `bull` line in `dependencies` and remove `@types/bull` from `devDependencies`:

```diff
   "dependencies": {
     "@prisma/client": "5.14.0",
     "bcryptjs": "^2.4.3",
-    "bull": "^1.1.3",
+    "bull": "^4.16.5",
     "compression": "^1.7.4",
```

```diff
   "devDependencies": {
     "@types/bcryptjs": "^2.4.6",
-    "@types/bull": "^4.10.0",
     "@types/compression": "^1.7.5",
```

- [ ] **Step 3: Reinstall**

Run: `cd apps/api && npm install`
Expected: installs `bull@4.16.5` (or newer 4.x) and removes `@types/bull`; `package-lock.json` updates accordingly.

- [ ] **Step 4: Verify the fatal error is gone**

Run: `cd apps/api && npx tsc --noEmit --types node 2>&1 | grep -c "Cannot find type definition"`
Expected: `0`. Running plain `npx tsc --noEmit` (no `--types node` override) should now print the *full* list of remaining real errors from Tasks 3-7 below, instead of stopping at the bull error.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json
git commit -m "fix(api): bump bull to 4.x, drop stale @types/bull stub

The pinned bull@1.1.3 predates bundled TS types; @types/bull is a
deprecated stub that assumes bull ships its own types, so tsc could
not resolve any types for the module at all and aborted compilation
before checking any other file."
```

### Task 3: Fix the malformed `$queryRaw` generic call in `qa.service.ts`

**Files:**
- Modify: `apps/api/src/services/qa.service.ts:14-28`

**Interfaces:**
- Consumes: nothing new.
- Produces: `findSimilarChunks(documentId: string, embedding: number[]): Promise<string[]>` — signature unchanged, only the broken syntax inside is fixed.

- [ ] **Step 1: Confirm the current failure**

Run: `cd apps/api && npx tsc --noEmit`
Expected: multiple `qa.service.ts` errors including `TS2693: 'string' only refers to a type, but is being used as a value here` at line 17.

- [ ] **Step 2: Fix the generic call**

In `apps/api/src/services/qa.service.ts`, replace:

```typescript
async function findSimilarChunks(
  documentId: string,
  embedding: number[]
): Promise<string[]> {
  const vectorLiteral = `[${embedding.join(',')}]`

  const results = await prisma.$queryRaw
    { content: string; similarity: number }[]
  >`
    SELECT content, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM document_chunks
    WHERE document_id = ${documentId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${TOP_K_CHUNKS}
  `

  return results.map((r) => r.content)
}
```

with:

```typescript
async function findSimilarChunks(
  documentId: string,
  embedding: number[]
): Promise<string[]> {
  const vectorLiteral = `[${embedding.join(',')}]`

  const results = await prisma.$queryRaw<
    { content: string; similarity: number }[]
  >`
    SELECT content, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM document_chunks
    WHERE document_id = ${documentId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${TOP_K_CHUNKS}
  `

  return results.map((r) => r.content)
}
```

(The only change is adding the `<` before the result-type object on the `$queryRaw<...>` call.)

- [ ] **Step 3: Verify the fix**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep qa.service`
Expected: no output (no remaining errors in this file).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/qa.service.ts
git commit -m "fix(api): fix malformed \$queryRaw generic call in qa.service.ts"
```

### Task 4: Commit the `tax.service.ts` build fix, and fix its Prisma JSON casts

**Files:**
- Modify: `apps/api/src/services/tax.service.ts:19-22, 478-495, 533-546`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature changes — `TaxCalculationResult`, `calculateTax`, `getLatestTaxCalculation` keep their existing shapes.

- [ ] **Step 1: Confirm the current failures**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep tax.service`
Expected: errors at lines ~491-493 (`Type 'TaxBandBreakdown[]' is not assignable to type 'JsonNull | InputJsonValue'`, etc.) and ~543-545 (`Conversion of type '... JsonArray ...' to type 'TaxBandBreakdown[]' may be a mistake`). The `Record<` fix at the top of the file (lines 19-22) is already present in the working tree — this task also commits that pre-existing uncommitted change.

- [ ] **Step 2: Fix the write-side casts in `calculateTax`**

In `apps/api/src/services/tax.service.ts`, find the `prisma.taxCalculation.create` call and change:

```typescript
  await prisma.taxCalculation.create({
    data: {
      documentId,
      userId,
      taxProfileId: taxProfile.id,
      userType: profile.userType,
      taxYear: 2026,
      grossIncome,
      totalDeductions,
      chargeableIncome,
      totalTax,
      monthlyTax,
      effectiveRate,
      breakdown,
      deductions,
      checklist,
    },
  })
```

to:

```typescript
  await prisma.taxCalculation.create({
    data: {
      documentId,
      userId,
      taxProfileId: taxProfile.id,
      userType: profile.userType,
      taxYear: 2026,
      grossIncome,
      totalDeductions,
      chargeableIncome,
      totalTax,
      monthlyTax,
      effectiveRate,
      breakdown: breakdown as unknown as Prisma.InputJsonValue,
      deductions: deductions as unknown as Prisma.InputJsonValue,
      checklist: checklist as unknown as Prisma.InputJsonValue,
    },
  })
```

- [ ] **Step 3: Fix the read-side casts in `getLatestTaxCalculation`**

In the same file, change:

```typescript
    breakdown: calculation.breakdown as TaxBandBreakdown[],
    deductions: calculation.deductions as DeductionItem[],
    checklist: calculation.checklist as ChecklistItem[],
```

to:

```typescript
    breakdown: calculation.breakdown as unknown as TaxBandBreakdown[],
    deductions: calculation.deductions as unknown as DeductionItem[],
    checklist: calculation.checklist as unknown as ChecklistItem[],
```

- [ ] **Step 4: Import `Prisma` namespace**

At the top of the file, change:

```typescript
import { prisma } from '../lib/prisma'
import { TaxUserType } from '@prisma/client'
```

to:

```typescript
import { prisma } from '../lib/prisma'
import { Prisma, TaxUserType } from '@prisma/client'
```

- [ ] **Step 5: Verify and commit**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep tax.service`
Expected: no output.

```bash
git add apps/api/src/services/tax.service.ts
git commit -m "fix(api): fix tax.service.ts build error and Prisma Json casts

Commits the previously-uncommitted Record<> generic fix, and fixes
the breakdown/deductions/checklist Json column read/write casts to
go through unknown first, matching Prisma's InputJsonValue typing."
```

### Task 5: Fix the HuggingFace zero-shot response shape bug in `lib/hf.ts`

**Files:**
- Modify: `apps/api/src/lib/hf.ts:86-103`
- Test: `apps/api/src/lib/hf.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `categorizeTransaction(description: string): Promise<{ category: string; confidence: number } | null>` — same signature, now reads the response correctly.

**Context:** The HuggingFace zero-shot-classification endpoint returns a single object shaped `{ sequence, labels: string[], scores: number[] }`, sorted by descending score — not an array of per-label objects. The existing code requests `ZeroShotResult[]` and reads `result[0].label`/`result[0].score`, which don't exist on `ZeroShotResult` (only `labels`/`scores` do); this is both a type error and a real runtime bug.

- [ ] **Step 1: Write the failing test**

Since `hfFetch` calls the network, this test verifies the response-parsing behavior by mocking `global.fetch`. Create `apps/api/src/lib/hf.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('categorizeTransaction', () => {
  const originalFetch = global.fetch
  const originalToken = process.env.HF_API_TOKEN

  beforeEach(() => {
    process.env.HF_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.HF_API_TOKEN = originalToken
    vi.resetModules()
  })

  it('reads the top label and score from the real HF zero-shot response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sequence: 'POS Purchase SHOPRITE',
        labels: ['Shopping & Retail', 'Food & Dining', 'Other'],
        scores: [0.87, 0.09, 0.04],
      }),
    }) as unknown as typeof fetch

    const { categorizeTransaction } = await import('./hf')
    const result = await categorizeTransaction('POS Purchase SHOPRITE')

    expect(result).toEqual({ category: 'Shopping & Retail', confidence: 0.87 })
  })

  it('returns null when the HF response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    }) as unknown as typeof fetch

    const { categorizeTransaction } = await import('./hf')
    const result = await categorizeTransaction('anything')

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/hf.test.ts`
Expected: FAIL on the first test — `result` is `{ category: undefined, confidence: undefined }`, not the expected object (the current code reads `result[0].label`/`.score` off a single object, which is `undefined`).

- [ ] **Step 3: Fix the implementation**

In `apps/api/src/lib/hf.ts`, the `ZeroShotResult` interface is already correctly shaped — leave it as-is:

```typescript
interface ZeroShotResult {
  labels: string[]
  scores: number[]
}
```

Change:

```typescript
export async function categorizeTransaction(
  description: string
): Promise<{ category: string; confidence: number } | null> {
  const result = await hfFetch<ZeroShotResult[]>(CATEGORIZATION_MODEL, {
    inputs: description,
    parameters: {
      candidate_labels: TRANSACTION_CATEGORIES,
      multi_label: false,
    },
  })

  if (!result || !Array.isArray(result) || result.length === 0) return null

  return {
    category: result[0].label,
    confidence: result[0].score,
  }
}
```

to:

```typescript
export async function categorizeTransaction(
  description: string
): Promise<{ category: string; confidence: number } | null> {
  const result = await hfFetch<ZeroShotResult>(CATEGORIZATION_MODEL, {
    inputs: description,
    parameters: {
      candidate_labels: TRANSACTION_CATEGORIES,
      multi_label: false,
    },
  })

  if (!result || !result.labels?.length || !result.scores?.length) return null

  return {
    category: result.labels[0],
    confidence: result.scores[0],
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/lib/hf.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Verify tsc and commit**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep hf.ts`
Expected: no output.

```bash
git add apps/api/src/lib/hf.ts apps/api/src/lib/hf.test.ts
git commit -m "fix(api): read HF zero-shot response as single object, not array

categorizeTransaction was indexing result[0].label/.score on a
response the real HF API returns as a single {labels,scores} object,
silently producing undefined category/confidence at runtime."
```

### Task 6: Fix `jwt.sign` typing in `auth.routes.ts`

**Files:**
- Modify: `apps/api/src/routes/auth.routes.ts:21-27`

**Interfaces:**
- Consumes: nothing new.
- Produces: `signToken(userId: string, email: string): string` — unchanged signature.

- [ ] **Step 1: Confirm the current failure**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep auth.routes`
Expected: `TS2769: No overload matches this call` on the `jwt.sign` call, because `expiresIn` is typed `string` but current `@types/jsonwebtoken` expects `number | StringValue`.

- [ ] **Step 2: Fix the cast**

In `apps/api/src/routes/auth.routes.ts`, change:

```typescript
function signToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )
}
```

to:

```typescript
function signToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'fallback_secret',
    {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
    }
  )
}
```

(Note: the `'fallback_secret'` default is removed in Task 11, not here — this task only fixes the type error.)

- [ ] **Step 3: Verify and commit**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep auth.routes`
Expected: no output.

```bash
git add apps/api/src/routes/auth.routes.ts
git commit -m "fix(api): fix jwt.sign expiresIn type error in auth.routes.ts"
```

### Task 7: Fix `worker.ts` implicit-`any` params, delete dead `src/workers/worker.ts`, verify full API compile

**Files:**
- Modify: `apps/api/src/worker.ts` (add explicit types to job/array-callback params)
- Delete: `apps/api/src/workers/worker.ts` (dead duplicate — not referenced by any script or Dockerfile; has broken relative imports)

**Interfaces:**
- Consumes: `ParseJobData`, `CategorizeJobData`, `EmbedJobData` from `../types` (already imported).
- Produces: no behavior change — same three `.process()` handlers, just explicitly typed.

- [ ] **Step 1: Confirm the current failures**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep -E "worker\.ts|workers/worker"`
Expected: implicit-`any` errors (TS7006) in `src/worker.ts` for `job`/`t`/`i` params, plus module-not-found errors (TS2307) in `src/workers/worker.ts` for its broken `./lib/...` imports (should be `../lib/...`).

- [ ] **Step 2: Delete the dead duplicate**

Run: `git rm apps/api/src/workers/worker.ts`

Confirm nothing references it:
Run: `grep -rn "workers/worker" apps/api/package.json apps/api/Dockerfile.worker apps/api/src 2>/dev/null`
Expected: no output (only `src/worker.ts` is used, per the `dev:worker`/`start:worker` npm scripts).

- [ ] **Step 3: Type the job parameters in `src/worker.ts`**

At the top of `apps/api/src/worker.ts`, add a `Bull` import:

```typescript
import 'dotenv/config'
import Bull from 'bull'
import { prisma } from './lib/prisma'
```

Then change each `.process(async (job) => {` call to use a typed job parameter. There are three:

```diff
-parseQueue.process(async (job) => {
+parseQueue.process(async (job: Bull.Job<ParseJobData>) => {
   const { documentId, filePath } = job.data as ParseJobData
```

```diff
-categorizeQueue.process(async (job) => {
+categorizeQueue.process(async (job: Bull.Job<CategorizeJobData>) => {
   const { documentId, transactionIds } = job.data as CategorizeJobData
```

```diff
-embedQueue.process(async (job) => {
+embedQueue.process(async (job: Bull.Job<EmbedJobData>) => {
   const { documentId } = job.data as EmbedJobData
```

(The `job.data as ParseJobData` casts can now be removed since `job.data` is already typed, but leaving them is harmless — only fix the implicit-`any` on the parameter itself, since that's the actual compile error.)

- [ ] **Step 4: Type the remaining implicit-`any` callback params**

In the parse worker's transaction-creation block, change:

```diff
   const created = await prisma.$transaction(
-    transactions.map((t) =>
+    transactions.map((t: (typeof transactions)[number]) =>
       prisma.transaction.create({
```

In the categorize worker's update block, change:

```diff
     await prisma.$transaction(
-      transactions.map((t, i) => {
+      transactions.map((t: (typeof transactions)[number], i: number) => {
         const result = results[i]
```

In the embed worker's doc-text-building block, change:

```diff
       ...document.transactions.map(
-        (t) =>
+        (t: (typeof document.transactions)[number]) =>
           `${t.date.toISOString().slice(0, 10)} | ${t.type} | ₦${Number(
```

- [ ] **Step 5: Verify the full API compiles clean**

Run: `cd apps/api && npx tsc --noEmit`
Expected: **no output at all** — this is the gate confirming Tasks 2-7 together fully unblock compilation.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/worker.ts
git rm apps/api/src/workers/worker.ts
git commit -m "fix(api): type worker.ts job/callback params, delete dead duplicate worker

src/workers/worker.ts was an unused, broken-import duplicate of
src/worker.ts (the one actually run by dev:worker/start:worker).
Together with Tasks 2-6, npx tsc --noEmit is now fully clean."
```

### Task 8: Fix the missing `ChatMessage` export in `apps/web`

**Files:**
- Modify: `apps/web/types/index.ts`

**Interfaces:**
- Produces: `ChatMessage` interface, matching the API's shape in `apps/api/src/types/index.ts`.

- [ ] **Step 1: Confirm the current failure**

Run: `cd apps/web && npx tsc --noEmit`
Expected: `app/analytics/[id]/page.tsx(13,21): error TS2305: Module '"@/types"' has no exported member 'ChatMessage'.`

- [ ] **Step 2: Add the missing export**

At the end of `apps/web/types/index.ts`, add:

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/types/index.ts
git commit -m "fix(web): add missing ChatMessage type export"
```

---

## Part C — Runtime hardening

### Task 9: Add async-error-handling so route errors return a clean 500

**Files:**
- Modify: `apps/api/package.json` (add `express-async-errors` dependency)
- Modify: `apps/api/src/index.ts:1-14`
- Test: `apps/api/src/index.test.ts` (new)

**Interfaces:**
- Consumes: the existing global error middleware in `src/index.ts` (unchanged).
- Produces: any thrown/rejected error inside any route handler now reaches that middleware and returns `{ success: false, error: 'Internal server error' }` with status 500, instead of hanging.

- [ ] **Step 1: Install the dependency**

Run: `cd apps/api && npm install express-async-errors`

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/index.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'

vi.mock('./lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockRejectedValue(new Error('boom')),
    },
    $disconnect: vi.fn(),
  },
}))

vi.mock('./lib/queues', () => ({
  parseQueue: { add: vi.fn() },
  categorizeQueue: { add: vi.fn() },
  embedQueue: { add: vi.fn() },
  closeQueues: vi.fn(),
}))

describe('async error handling', () => {
  it('returns a clean 500 instead of hanging when a route handler rejects', async () => {
    const { default: app } = await import('./index')

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ success: false, error: 'Internal server error' })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && npx vitest run src/index.test.ts`
Expected: FAIL — the request times out (Vitest's default test timeout, 5s) because the rejected promise inside the login route never reaches the error middleware.

- [ ] **Step 4: Add the fix**

In `apps/api/src/index.ts`, change:

```typescript
import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
```

to:

```typescript
import 'dotenv/config'
import express from 'express'
import 'express-async-errors'
import helmet from 'helmet'
```

(`express-async-errors` must be imported after `express` but before any router is required, since it patches Express's `Router` prototype — it's imported here, before the `./routes/*` imports a few lines down, so the patch is active before any router is created.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/index.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify tsc and commit**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/index.ts apps/api/src/index.test.ts
git commit -m "fix(api): add express-async-errors so rejected route handlers return 500

Express 4 does not forward rejected promises from async route
handlers to error middleware on its own. Every route in this app is
async, so any thrown error was hanging the request instead of
returning a clean error response."
```

### Task 10: Replace the `TaxProfile` synthetic-id hack with a real unique constraint

**Files:**
- Modify: `apps/api/prisma/schema.prisma:109-125`
- Create: `apps/api/prisma/migrations/<timestamp>_add_tax_profile_user_unique/migration.sql` (generated by Prisma)
- Modify: `apps/api/src/services/tax.service.ts:454-476`

**Interfaces:**
- Produces: `TaxProfile.userId` is now `@unique`; `calculateTax`'s upsert is keyed on `{ userId }` instead of a synthetic `id`.

**Context:** requires a running dev database — start it first with `docker compose up -d postgres` from the repo root (`statemint/`), with a `.env` in `apps/api` pointing `DATABASE_URL` at it (copy `.env.example` at the repo root if no `apps/api/.env` exists yet, or reuse the existing one).

- [ ] **Step 1: Add the unique constraint to the schema**

In `apps/api/prisma/schema.prisma`, change:

```prisma
model TaxProfile {
  id                 String      @id @default(uuid())
  userId             String      @map("user_id")
  user               User        @relation(fields: [userId], references: [id], onDelete: Cascade)
```

to:

```prisma
model TaxProfile {
  id                 String      @id @default(uuid())
  userId             String      @unique @map("user_id")
  user               User        @relation(fields: [userId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd apps/api && npx prisma migrate dev --name add_tax_profile_user_unique`
Expected: Prisma creates a new folder under `prisma/migrations/` with a `migration.sql` containing `CREATE UNIQUE INDEX ... ON "tax_profiles"("user_id")`, applies it to the dev database, and regenerates the Prisma client. If any existing `TaxProfile` rows in the dev DB already violate uniqueness (shouldn't happen given the synthetic-id scheme already enforced one-per-user), Prisma will report it — resolve by deleting duplicate test rows, since this is a demo DB with no real user data to preserve.

- [ ] **Step 3: Update the upsert call**

In `apps/api/src/services/tax.service.ts`, inside `calculateTax`, change:

```typescript
  const taxProfile = await prisma.taxProfile.upsert({
    where: { id: `${userId}-profile` },
    update: {
      userType: profile.userType,
      stateOfResidence: profile.stateOfResidence,
      monthlyRent: profile.monthlyRent,
      pensionRate: profile.pensionRate ?? 0.08,
      nhfRate: profile.nhfRate ?? 0.025,
      nhisRate: profile.nhisRate ?? 0.05,
      lifeInsurance: profile.lifeInsurance,
    },
    create: {
      id: `${userId}-profile`,
      userId,
      userType: profile.userType,
      stateOfResidence: profile.stateOfResidence,
      monthlyRent: profile.monthlyRent,
      pensionRate: profile.pensionRate ?? 0.08,
      nhfRate: profile.nhfRate ?? 0.025,
      nhisRate: profile.nhisRate ?? 0.05,
      lifeInsurance: profile.lifeInsurance,
    },
  })
```

to:

```typescript
  const taxProfile = await prisma.taxProfile.upsert({
    where: { userId },
    update: {
      userType: profile.userType,
      stateOfResidence: profile.stateOfResidence,
      monthlyRent: profile.monthlyRent,
      pensionRate: profile.pensionRate ?? 0.08,
      nhfRate: profile.nhfRate ?? 0.025,
      nhisRate: profile.nhisRate ?? 0.05,
      lifeInsurance: profile.lifeInsurance,
    },
    create: {
      userId,
      userType: profile.userType,
      stateOfResidence: profile.stateOfResidence,
      monthlyRent: profile.monthlyRent,
      pensionRate: profile.pensionRate ?? 0.08,
      nhfRate: profile.nhfRate ?? 0.025,
      nhisRate: profile.nhisRate ?? 0.05,
      lifeInsurance: profile.lifeInsurance,
    },
  })
```

- [ ] **Step 4: Verify tsc and commit**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/services/tax.service.ts
git commit -m "fix(api): replace TaxProfile synthetic-id hack with a real unique constraint

TaxProfile.userId is now @unique, and the upsert in calculateTax is
keyed on {userId} instead of the previous \`\${userId}-profile\`
string-id workaround."
```

### Task 11: Require `JWT_SECRET` at startup; require `FRONTEND_URL` in production

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/middleware/auth.ts:26-30`
- Modify: `apps/api/src/routes/auth.routes.ts:21-27`
- Test: `apps/api/src/lib/env.test.ts` (new)
- Create: `apps/api/src/lib/env.ts` (new — small shared helper)

**Interfaces:**
- Produces: `requireEnv(name: string): string` in `apps/api/src/lib/env.ts` — throws if the named env var is unset/empty, otherwise returns it. Used by `index.ts` (startup), `middleware/auth.ts`, and `auth.routes.ts` for `JWT_SECRET`.

- [ ] **Step 1: Write the failing test for the helper**

Create `apps/api/src/lib/env.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { requireEnv } from './env'

describe('requireEnv', () => {
  it('returns the value when the env var is set', () => {
    process.env.TEST_VAR = 'hello'
    expect(requireEnv('TEST_VAR')).toBe('hello')
    delete process.env.TEST_VAR
  })

  it('throws when the env var is unset', () => {
    delete process.env.MISSING_VAR
    expect(() => requireEnv('MISSING_VAR')).toThrow(
      'Missing required environment variable: MISSING_VAR'
    )
  })

  it('throws when the env var is an empty string', () => {
    process.env.EMPTY_VAR = ''
    expect(() => requireEnv('EMPTY_VAR')).toThrow(
      'Missing required environment variable: EMPTY_VAR'
    )
    delete process.env.EMPTY_VAR
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/env.test.ts`
Expected: FAIL — `Cannot find module './env'` (file doesn't exist yet).

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/lib/env.ts`:

```typescript
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/lib/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it for `JWT_SECRET` in `middleware/auth.ts`**

In `apps/api/src/middleware/auth.ts`, change:

```typescript
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JwtPayload, ApiResponse } from '../types'
```

to:

```typescript
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JwtPayload, ApiResponse } from '../types'
import { requireEnv } from '../lib/env'
```

and change:

```typescript
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback_secret'
    ) as JwtPayload
```

to:

```typescript
    const payload = jwt.verify(token, requireEnv('JWT_SECRET')) as JwtPayload
```

- [ ] **Step 6: Use it for `JWT_SECRET` in `auth.routes.ts`**

In `apps/api/src/routes/auth.routes.ts`, add the import:

```typescript
import { prisma } from '../lib/prisma'
import { ApiResponse, AuthTokens } from '../types'
import { requireEnv } from '../lib/env'
```

and change:

```typescript
function signToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'fallback_secret',
    {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
    }
  )
}
```

to:

```typescript
function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, requireEnv('JWT_SECRET'), {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
  })
}
```

- [ ] **Step 7: Fail fast at startup, and lock down CORS in production**

In `apps/api/src/index.ts`, change:

```typescript
import authRoutes from './routes/auth.routes'
import documentRoutes from './routes/document.routes'
import analyticsRoutes from './routes/analytics.routes'
import taxRoutes from './routes/tax.routes'
import { prisma } from './lib/prisma'
import { closeQueues } from './lib/queues'

const app = express()
const PORT = process.env.PORT || 4000

// ─── Security & middleware ────────────────────────────────────────────────────

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
```

to:

```typescript
import authRoutes from './routes/auth.routes'
import documentRoutes from './routes/document.routes'
import analyticsRoutes from './routes/analytics.routes'
import taxRoutes from './routes/tax.routes'
import { prisma } from './lib/prisma'
import { closeQueues } from './lib/queues'
import { requireEnv } from './lib/env'

requireEnv('JWT_SECRET')

const app = express()
const PORT = process.env.PORT || 4000

// ─── Security & middleware ────────────────────────────────────────────────────

const corsOrigin =
  process.env.NODE_ENV === 'production' ? requireEnv('FRONTEND_URL') : '*'

app.use(helmet())
app.use(cors({ origin: corsOrigin }))
```

- [ ] **Step 8: Verify tsc, run the full test suite, and commit**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no output.

Run: `cd apps/api && npm test`
Expected: all tests PASS (`hf.test.ts`, `index.test.ts`, `env.test.ts` — `JWT_SECRET` is already set by Task 1's `src/test/setup.ts`, so `requireEnv('JWT_SECRET')` doesn't break any test).

```bash
git add apps/api/src/lib/env.ts apps/api/src/lib/env.test.ts apps/api/src/middleware/auth.ts apps/api/src/routes/auth.routes.ts apps/api/src/index.ts
git commit -m "fix(api): require JWT_SECRET at startup, require FRONTEND_URL in production

Removes the 'fallback_secret' and CORS '*' defaults that were only
safe for local dev. In production the server now refuses to start
without a real JWT_SECRET, and CORS only allows the configured
FRONTEND_URL instead of falling back to *."
```

---

## Part D — Targeted tests

### Task 12: Tax engine tests

**Files:**
- Modify: `apps/api/src/services/tax.service.ts` (export two previously-private functions)
- Test: `apps/api/src/services/tax.service.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `calculatePAYETax` and `calculateDeductions` become exported (were private) so they can be tested directly as pure functions, without mocking Prisma.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/tax.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculatePAYETax, calculateDeductions } from './tax.service'

describe('calculatePAYETax', () => {
  it('returns zero tax for income below the ₦800,000 threshold', () => {
    const result = calculatePAYETax(500_000)
    expect(result.totalTax).toBe(0)
    expect(result.breakdown).toEqual([])
  })

  it('returns zero tax for income exactly at the threshold', () => {
    const result = calculatePAYETax(800_000)
    expect(result.totalTax).toBe(0)
    expect(result.breakdown).toEqual([])
  })

  it('taxes only the first band for income within it', () => {
    const result = calculatePAYETax(1_000_000)
    expect(result.totalTax).toBe(30_000) // (1,000,000 - 800,000) * 0.15
    expect(result.breakdown).toHaveLength(1)
  })

  it('taxes across all four bands for high income', () => {
    const result = calculatePAYETax(5_000_000)
    // band1: (1,600,000-800,000)*0.15 = 120,000
    // band2: (3,200,000-1,600,000)*0.19 = 304,000
    // band3: (4,800,000-3,200,000)*0.21 = 336,000
    // band4: (5,000,000-4,800,000)*0.24 = 48,000
    expect(result.totalTax).toBe(808_000)
    expect(result.breakdown).toHaveLength(4)
  })
})

describe('calculateDeductions', () => {
  it('applies default pension/NHF/NHIS rates when the profile omits them', () => {
    const deductions = calculateDeductions(1_200_000, {
      userType: 'PAYE',
      stateOfResidence: 'lagos',
    })

    const pension = deductions.find((d) => d.name === 'Pension Contribution (PFA)')
    const nhf = deductions.find((d) => d.name === 'National Housing Fund (NHF)')
    const nhis = deductions.find((d) => d.name === 'National Health Insurance (NHIS)')

    expect(pension?.amount).toBe(1_200_000 * 0.08)
    expect(nhf?.amount).toBe(1_200_000 * 0.025)
    expect(nhis?.amount).toBe(1_200_000 * 0.05)
  })

  it('marks rent relief and life insurance as not applicable when omitted', () => {
    const deductions = calculateDeductions(1_200_000, {
      userType: 'PAYE',
      stateOfResidence: 'lagos',
    })

    const rent = deductions.find((d) => d.name === 'Rent Relief')
    const life = deductions.find((d) => d.name === 'Life Insurance Premium')

    expect(rent?.applicable).toBe(false)
    expect(rent?.amount).toBe(0)
    expect(life?.applicable).toBe(false)
    expect(life?.amount).toBe(0)
  })

  it('caps rent relief at ₦500,000', () => {
    const deductions = calculateDeductions(10_000_000, {
      userType: 'PAYE',
      stateOfResidence: 'lagos',
      monthlyRent: 1_000_000, // 12,000,000/yr * 20% = 2,400,000, capped to 500,000
    })

    const rent = deductions.find((d) => d.name === 'Rent Relief')
    expect(rent?.applicable).toBe(true)
    expect(rent?.amount).toBe(500_000)
  })

  it('caps life insurance deduction at ₦100,000', () => {
    const deductions = calculateDeductions(1_200_000, {
      userType: 'PAYE',
      stateOfResidence: 'lagos',
      lifeInsurance: 250_000,
    })

    const life = deductions.find((d) => d.name === 'Life Insurance Premium')
    expect(life?.applicable).toBe(true)
    expect(life?.amount).toBe(100_000)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx vitest run src/services/tax.service.test.ts`
Expected: FAIL — `calculatePAYETax` and `calculateDeductions` are not exported from `./tax.service`.

- [ ] **Step 3: Export the functions**

In `apps/api/src/services/tax.service.ts`, change:

```typescript
function calculatePAYETax(chargeableIncome: number): {
```

to:

```typescript
export function calculatePAYETax(chargeableIncome: number): {
```

and change:

```typescript
function calculateDeductions(
```

to:

```typescript
export function calculateDeductions(
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/services/tax.service.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Verify tsc and commit**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/api/src/services/tax.service.ts apps/api/src/services/tax.service.test.ts
git commit -m "test(api): add tax engine unit tests, export pure calculation functions"
```

### Task 13: PDF parser tests

**Files:**
- Test: `apps/api/src/services/parser.service.test.ts` (new)

**Interfaces:**
- Consumes: `parsePdf(filePath: string): Promise<{ bankName: string; transactions: ParsedTransaction[]; rawText: string }>` and `chunkText(text: string, chunkSize?: number, overlap?: number): string[]`, both already exported from `parser.service.ts` — no implementation changes needed, this task is test-only.

- [ ] **Step 1: Write the tests**

Create `apps/api/src/services/parser.service.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn(() => Buffer.from('fake-pdf-bytes')) },
  readFileSync: vi.fn(() => Buffer.from('fake-pdf-bytes')),
}))

describe('parsePdf', () => {
  it('detects GTBank and extracts single-line transactions', async () => {
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: [
          'GTBank e-Statement',
          'Account Number: 0123456789',
          '',
          '01/03/2026 POS Purchase SHOPRITE 15,000.00 DR',
          '05/03/2026 SALARY PAYMENT XYZ LTD 250,000.00 CR',
        ].join('\n'),
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('GTBank')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]).toMatchObject({
      description: 'POS Purchase SHOPRITE',
      amount: 15_000,
      type: 'DEBIT',
    })
    expect(result.transactions[1]).toMatchObject({
      description: 'SALARY PAYMENT XYZ LTD',
      amount: 250_000,
      type: 'CREDIT',
    })

    vi.doUnmock('pdf-parse')
  })

  it('detects Kuda Bank and extracts multi-line transactions', async () => {
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: [
          'Kuda Bank Statement',
          '',
          '05/03/26',
          '09:15:00',
          '₦50,000.00',
          'inward transfer',
          'JOHN DOE SALARY',
          'Salary',
          '₦120,000.00',
        ].join('\n'),
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('Kuda Bank')
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]).toMatchObject({
      amount: 50_000,
      type: 'CREDIT',
    })
    expect(result.transactions[0].description).toContain('JOHN DOE SALARY')

    vi.doUnmock('pdf-parse')
  })

  it('falls back to Unknown Bank and the generic parser for unrecognized headers', async () => {
    vi.doMock('pdf-parse', () => ({
      default: vi.fn().mockResolvedValue({
        text: 'Some Random Bank\n\n01/03/2026 ATM Withdrawal 5,000.00 DR',
      }),
    }))

    const { parsePdf } = await import('./parser.service')
    const result = await parsePdf('/fake/path.pdf')

    expect(result.bankName).toBe('Unknown Bank')
    expect(result.transactions).toHaveLength(1)

    vi.doUnmock('pdf-parse')
  })
})

describe('chunkText', () => {
  it('splits text into overlapping word chunks', async () => {
    const { chunkText } = await import('./parser.service')
    const words = Array.from({ length: 12 }, (_, i) => `word${i}`).join(' ')

    const chunks = chunkText(words, 5, 1)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].split(' ')).toHaveLength(5)
  })

  it('returns a single chunk for text shorter than chunkSize', async () => {
    const { chunkText } = await import('./parser.service')
    const chunks = chunkText('one two three', 500, 50)

    expect(chunks).toEqual(['one two three'])
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/services/parser.service.test.ts`
Expected: all tests PASS. (If the GTBank/Kuda regex matching doesn't line up exactly with the fixture text, adjust the fixture strings — not the parser regexes — to match real-world statement formatting, since the parser logic itself is out of scope for this task.)

- [ ] **Step 3: Verify tsc and commit**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/api/src/services/parser.service.test.ts
git commit -m "test(api): add PDF parser tests for GTBank, Kuda, and unknown-bank formats"
```

### Task 14: Auth tests (middleware unit test + register/login route tests)

**Files:**
- Test: `apps/api/src/middleware/auth.test.ts` (new)
- Test: `apps/api/src/routes/auth.routes.test.ts` (new)

**Interfaces:**
- Consumes: `authenticate` from `../middleware/auth` (exported), the Express app default export from `../index`.

- [ ] **Step 1: Write the middleware unit test**

Create `apps/api/src/middleware/auth.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { Response } from 'express'
import { authenticate, AuthRequest } from './auth'

function mockRes(): Response {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('authenticate middleware', () => {
  it('rejects a missing authorization header', () => {
    const req = { headers: {} } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a malformed authorization header', () => {
    const req = { headers: { authorization: 'NotBearer xyz' } } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects an invalid token', () => {
    const req = {
      headers: { authorization: 'Bearer not-a-real-token' },
    } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('accepts a valid token and attaches the payload to req.user', () => {
    const token = jwt.sign(
      { userId: 'user-1', email: 'a@b.com' },
      process.env.JWT_SECRET!
    )
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    authenticate(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toMatchObject({ userId: 'user-1', email: 'a@b.com' })
  })
})
```

- [ ] **Step 2: Run it to verify it passes**

Run: `cd apps/api && npx vitest run src/middleware/auth.test.ts`
Expected: all 4 tests PASS immediately (`JWT_SECRET` is set by Task 1's `src/test/setup.ts`; this task tests existing, already-correct behavior — no implementation change needed, only new coverage).

- [ ] **Step 3: Write the register/login route tests**

Create `apps/api/src/routes/auth.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'

const mockUser = {
  findUnique: vi.fn(),
  create: vi.fn(),
}

vi.mock('../lib/prisma', () => ({
  prisma: { user: mockUser },
}))

vi.mock('../lib/queues', () => ({
  parseQueue: { add: vi.fn() },
  categorizeQueue: { add: vi.fn() },
  embedQueue: { add: vi.fn() },
  closeQueues: vi.fn(),
}))

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a user and returns a token', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    mockUser.create.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      passwordHash: 'hashed',
      name: null,
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.accessToken).toEqual(expect.any(String))
  })

  it('rejects a duplicate email with 409', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 'existing-user' })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'existing@example.com', password: 'password123' })

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
  })

  it('rejects an invalid payload with 400', async () => {
    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs in with correct credentials', async () => {
    const passwordHash = await bcrypt.hash('password123', 12)
    mockUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash,
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toEqual(expect.any(String))
  })

  it('rejects a wrong password with 401', async () => {
    const passwordHash = await bcrypt.hash('password123', 12)
    mockUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash,
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrong-password' })

    expect(res.status).toBe(401)
  })

  it('rejects an unknown email with 401', async () => {
    mockUser.findUnique.mockResolvedValue(null)

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' })

    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/routes/auth.routes.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Verify tsc and commit**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/api/src/middleware/auth.test.ts apps/api/src/routes/auth.routes.test.ts
git commit -m "test(api): add auth middleware unit tests and register/login route tests"
```

### Task 15: Route smoke tests for documents, analytics, and tax routes

**Files:**
- Test: `apps/api/src/routes/document.routes.test.ts` (new)
- Test: `apps/api/src/routes/analytics.routes.test.ts` (new)
- Test: `apps/api/src/routes/tax.routes.test.ts` (new)

**Interfaces:**
- Consumes: the Express app from `../index`; mocks `../lib/prisma`, `../lib/queues`, `../services/analytics.service`, `../services/qa.service`, `../services/tax.service` as needed per file.

- [ ] **Step 1: Write document route tests**

Create `apps/api/src/routes/document.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockDocument = {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}
const mockJobLog = { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) }
const mockParseQueueAdd = vi.fn()

vi.mock('../lib/prisma', () => ({
  prisma: { document: mockDocument, jobLog: mockJobLog },
}))

vi.mock('../lib/queues', () => ({
  parseQueue: { add: mockParseQueueAdd },
  categorizeQueue: { add: vi.fn() },
  embedQueue: { add: vi.fn() },
  closeQueues: vi.fn(),
}))

function authHeader(): string {
  const token = jwt.sign(
    { userId: 'user-1', email: 'a@b.com' },
    process.env.JWT_SECRET!
  )
  return `Bearer ${token}`
}

describe('GET /api/documents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects requests with no auth token', async () => {
    const { default: app } = await import('../index')
    const res = await request(app).get('/api/documents')
    expect(res.status).toBe(401)
  })

  it('returns the current user\'s documents', async () => {
    mockDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        fileName: 'statement.pdf',
        bankName: 'GTBank',
        status: 'COMPLETED',
        createdAt: new Date(),
        parsedAt: new Date(),
        _count: { transactions: 10 },
      },
    ])

    const { default: app } = await import('../index')
    const res = await request(app).get('/api/documents').set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].transactionCount).toBe(10)
  })
})

describe('GET /api/documents/:id/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 for a document the user does not own', async () => {
    mockDocument.findFirst.mockResolvedValue(null)

    const { default: app } = await import('../index')
    const res = await request(app)
      .get('/api/documents/doc-999/status')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Write analytics route tests**

Create `apps/api/src/routes/analytics.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockGetAnalytics = vi.fn()
const mockAnswerQuestion = vi.fn()

vi.mock('../services/analytics.service', () => ({
  getAnalytics: mockGetAnalytics,
}))

vi.mock('../services/qa.service', () => ({
  answerQuestion: mockAnswerQuestion,
}))

vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../lib/queues', () => ({
  parseQueue: { add: vi.fn() },
  categorizeQueue: { add: vi.fn() },
  embedQueue: { add: vi.fn() },
  closeQueues: vi.fn(),
}))

function authHeader(): string {
  const token = jwt.sign(
    { userId: 'user-1', email: 'a@b.com' },
    process.env.JWT_SECRET!
  )
  return `Bearer ${token}`
}

describe('GET /api/analytics/:documentId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when the document is not found or not owned', async () => {
    mockGetAnalytics.mockResolvedValue(null)

    const { default: app } = await import('../index')
    const res = await request(app)
      .get('/api/analytics/doc-1')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })

  it('returns analytics for an owned document', async () => {
    mockGetAnalytics.mockResolvedValue({
      documentId: 'doc-1',
      totalCredits: 100_000,
      totalDebits: 40_000,
      netFlow: 60_000,
      transactionCount: 5,
      spendingByCategory: [],
      monthlyFlow: [],
      topMerchants: [],
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .get('/api/analytics/doc-1')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.data.netFlow).toBe(60_000)
  })
})

describe('POST /api/analytics/:documentId/chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a too-short question with 400', async () => {
    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/analytics/doc-1/chat')
      .set('Authorization', authHeader())
      .send({ question: 'hi' })

    expect(res.status).toBe(400)
  })

  it('returns the answer for a valid question', async () => {
    mockAnswerQuestion.mockResolvedValue({ answer: 'You spent ₦40,000.' })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/analytics/doc-1/chat')
      .set('Authorization', authHeader())
      .send({ question: 'How much did I spend?' })

    expect(res.status).toBe(200)
    expect(res.body.data.answer).toContain('40,000')
  })
})
```

- [ ] **Step 3: Write tax route tests**

Create `apps/api/src/routes/tax.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockDetectIncomeProfile = vi.fn()
const mockCalculateTax = vi.fn()
const mockGetLatestTaxCalculation = vi.fn()

vi.mock('../services/tax.service', async () => {
  const actual = await vi.importActual<typeof import('../services/tax.service')>(
    '../services/tax.service'
  )
  return {
    ...actual,
    detectIncomeProfile: mockDetectIncomeProfile,
    calculateTax: mockCalculateTax,
    getLatestTaxCalculation: mockGetLatestTaxCalculation,
  }
})

vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../lib/queues', () => ({
  parseQueue: { add: vi.fn() },
  categorizeQueue: { add: vi.fn() },
  embedQueue: { add: vi.fn() },
  closeQueues: vi.fn(),
}))

function authHeader(): string {
  const token = jwt.sign(
    { userId: 'user-1', email: 'a@b.com' },
    process.env.JWT_SECRET!
  )
  return `Bearer ${token}`
}

describe('GET /api/tax/states', () => {
  it('returns the Nigerian states directory without auth', async () => {
    const { default: app } = await import('../index')
    const res = await request(app).get('/api/tax/states')

    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(30)
    expect(res.body.data.find((s: { key: string }) => s.key === 'lagos')).toBeDefined()
  })
})

describe('POST /api/tax/:documentId/calculate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an invalid userType with 400', async () => {
    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/tax/doc-1/calculate')
      .set('Authorization', authHeader())
      .send({ userType: 'NOT_A_TYPE', stateOfResidence: 'lagos' })

    expect(res.status).toBe(400)
  })

  it('returns a calculation for a valid payload', async () => {
    mockCalculateTax.mockResolvedValue({
      userType: 'PAYE',
      taxYear: 2026,
      grossIncome: 2_000_000,
      totalDeductions: 300_000,
      chargeableIncome: 1_700_000,
      totalTax: 165_000,
      monthlyTax: 13_750,
      effectiveRate: 8.25,
      isTaxFree: false,
      breakdown: [],
      deductions: [],
      checklist: [],
      paymentGuide: {
        stateName: 'Lagos State',
        irsName: 'Lagos IRS (LIRS)',
        portal: 'https://etax.lirs.net',
        deadline: 'March 31, 2027 (for 2026 income)',
        steps: [],
      },
    })

    const { default: app } = await import('../index')
    const res = await request(app)
      .post('/api/tax/doc-1/calculate')
      .set('Authorization', authHeader())
      .send({ userType: 'PAYE', stateOfResidence: 'lagos' })

    expect(res.status).toBe(200)
    expect(res.body.data.totalTax).toBe(165_000)
  })
})

describe('GET /api/tax/:documentId/summary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when no calculation exists yet', async () => {
    mockGetLatestTaxCalculation.mockResolvedValue(null)

    const { default: app } = await import('../index')
    const res = await request(app)
      .get('/api/tax/doc-1/summary')
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })
})

describe('GET /api/tax/guide/:stateKey', () => {
  it('returns 404 for an unknown state key', async () => {
    const { default: app } = await import('../index')
    const res = await request(app).get('/api/tax/guide/not-a-real-state')

    expect(res.status).toBe(404)
  })

  it('returns the payment guide for a known state', async () => {
    const { default: app } = await import('../index')
    const res = await request(app).get('/api/tax/guide/lagos')

    expect(res.status).toBe(200)
    expect(res.body.data.irsName).toBe('Lagos IRS (LIRS)')
  })
})
```

- [ ] **Step 4: Run all three files to verify they pass**

Run: `cd apps/api && npx vitest run src/routes/document.routes.test.ts src/routes/analytics.routes.test.ts src/routes/tax.routes.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite and verify tsc**

Run: `cd apps/api && npm test && npx tsc --noEmit`
Expected: all tests across every file PASS; no tsc output.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/document.routes.test.ts apps/api/src/routes/analytics.routes.test.ts apps/api/src/routes/tax.routes.test.ts
git commit -m "test(api): add route smoke tests for documents, analytics, and tax endpoints"
```

---

## Part E — Cleanup

### Task 16: Web boilerplate cleanup

**Files:**
- Modify: `apps/web/README.md`
- Delete: `apps/web/public/file.svg`, `apps/web/public/globe.svg`, `apps/web/public/next.svg`, `apps/web/public/vercel.svg`, `apps/web/public/window.svg` (if confirmed unreferenced)

- [ ] **Step 1: Confirm the SVGs are unused**

Run: `cd apps/web && grep -rn "file.svg\|globe.svg\|next.svg\|vercel.svg\|window.svg" app components 2>/dev/null`
Expected: no output (already confirmed unreferenced during the audit for this plan — re-verify since new pages may have been added since).

- [ ] **Step 2: Delete the unused SVGs (only if Step 1 confirmed no references)**

Run: `git rm apps/web/public/file.svg apps/web/public/globe.svg apps/web/public/next.svg apps/web/public/vercel.svg apps/web/public/window.svg`

- [ ] **Step 3: Replace the README**

Replace the full contents of `apps/web/README.md` with:

```markdown
# Statemint — Web

The Next.js dashboard for Statemint: upload a Nigerian bank statement PDF,
get auto-categorized transactions and spending analytics, ask questions
about your statement, and estimate your Nigerian personal income tax.

## Running locally

This app talks to the Statemint API (`../api`). Start the full stack from
the repo root first:

\`\`\`bash
docker compose up -d
\`\`\`

Then, from this directory:

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000).

Set `NEXT_PUBLIC_API_URL` (see `.env.example` at the repo root) if the API
isn't running at the default `http://localhost:4000/api`.
```

- [ ] **Step 4: Verify the build still works and commit**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output.

```bash
git add apps/web/README.md
git rm apps/web/public/file.svg apps/web/public/globe.svg apps/web/public/next.svg apps/web/public/vercel.svg apps/web/public/window.svg
git commit -m "chore(web): replace create-next-app boilerplate with a real README, remove unused default assets"
```

---

## Part F — Docker & deployment

### Task 17: Fix Docker images to build and run compiled JS; add the missing API Dockerfile

**Files:**
- Create: `apps/api/Dockerfile`
- Modify: `apps/api/Dockerfile.worker`
- Modify: `statemint/docker-compose.yml` (repo-root-relative: `docker-compose.yml`)

**Context:** `docker-compose.yml`'s `api` service currently references `dockerfile: Dockerfile` under `apps/api`, but that file doesn't exist — only `Dockerfile.worker` does (spec finding 7). Both Dockerfiles should build with `tsc` and run the compiled output, both because that's the right pattern for a deployed container (not live-reloading `ts-node-dev`), and because it means a broken build now fails the Docker build step instead of silently shipping.

- [ ] **Step 1: Create `apps/api/Dockerfile`**

Create `apps/api/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Update `apps/api/Dockerfile.worker`**

Replace the full contents of `apps/api/Dockerfile.worker` with:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma/
RUN npx prisma generate

COPY src ./src
RUN npm run build

CMD ["node", "dist/worker.js"]
```

- [ ] **Step 3: Drop the now-pointless dev-mode volume mounts in `docker-compose.yml`**

In `docker-compose.yml` (repo root), remove the `./apps/api/src:/app/src` bind mounts for both the `api` and `worker` services — they were for `ts-node-dev` live-reload, which no longer runs in these containers:

```diff
     volumes:
-      - ./apps/api/src:/app/src
       - uploads_data:/app/uploads
     depends_on:
       postgres:
         condition: service_healthy
       redis:
         condition: service_healthy

   worker:
     build:
       context: ./apps/api
       dockerfile: Dockerfile.worker
     container_name: statemint_worker
     restart: unless-stopped
     environment:
       NODE_ENV: development
       DATABASE_URL: postgresql://${POSTGRES_USER:-statemint}:${POSTGRES_PASSWORD:-statemint_secret}@postgres:5432/${POSTGRES_DB:-statemint_db}
       REDIS_URL: redis://redis:6379
       HF_API_TOKEN: ${HF_API_TOKEN}
       HF_CATEGORIZATION_MODEL: facebook/bart-large-mnli
       HF_EMBEDDING_MODEL: sentence-transformers/all-MiniLM-L6-v2
       UPLOAD_DIR: /app/uploads
     volumes:
-      - ./apps/api/src:/app/src
       - uploads_data:/app/uploads
```

- [ ] **Step 4: Verify the full stack builds and runs**

Run (from the repo root, `statemint/`): `docker compose up -d --build`
Expected: all four services (`postgres`, `redis`, `api`, `worker`) build successfully and reach a running/healthy state.

Run: `curl -s http://localhost:4000/health`
Expected: `{"status":"ok","service":"statemint-api",...}`.

Run: `docker compose down`

- [ ] **Step 5: Commit**

```bash
git add apps/api/Dockerfile apps/api/Dockerfile.worker docker-compose.yml
git commit -m "fix(api): add missing api Dockerfile, build+run compiled JS instead of ts-node-dev

docker-compose.yml's api service referenced a Dockerfile that didn't
exist. Both Dockerfiles now run npm run build and start the compiled
output, which is the right pattern for containers that aren't doing
live-reload dev, and ensures a broken tsc build fails the image build
instead of shipping silently."
```

### Task 18: Deploy the API stack to Railway

**Files:**
- No repo files strictly required; this task is Railway configuration/environment setup. If Railway needs a `railway.json` or `railway.toml` to pin build behavior, create it at `apps/api/railway.json` per Step 2 below.

- [ ] **Step 1: Create the Railway project and services**

In the Railway dashboard, create a new project with four services: a managed Postgres database (with the `pgvector` extension — Railway's Postgres template supports adding extensions via `CREATE EXTENSION vector;` after provisioning, or use a Railway template that includes pgvector), a managed Redis instance, an `api` service, and a `worker` service.

- [ ] **Step 2: Point the `api` and `worker` services at their Dockerfiles**

For the `api` service, set its build source to the repo with root directory `apps/api` and Dockerfile path `Dockerfile` (from Task 17). For the `worker` service, same root directory but Dockerfile path `Dockerfile.worker`.

If Railway's auto-detection doesn't pick the right Dockerfile per service, create `apps/api/railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  }
}
```

(and a separate `apps/api/railway.worker.json` with `"dockerfilePath": "Dockerfile.worker"` referenced from the worker service's settings, if Railway requires distinct config files per service pointing at the same directory).

- [ ] **Step 3: Set environment variables on both `api` and `worker` services**

Using Railway's reference-variable syntax to link to the Postgres/Redis services it provisioned:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=<a long random string — generate with `openssl rand -base64 48`>
JWT_EXPIRES_IN=7d
HF_API_TOKEN=<the user's existing HuggingFace token>
HF_CATEGORIZATION_MODEL=facebook/bart-large-mnli
HF_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
UPLOAD_DIR=/app/uploads
NODE_ENV=production
PORT=4000
```

`FRONTEND_URL` is set after Task 19 deploys the web app and its URL is known — leave it unset for now (the api service will fail to start without it per Task 11's `requireEnv`, so **do not start the api service until this is set** — set a placeholder like `https://placeholder.example.com` now and update it in Task 19's Step 4).

- [ ] **Step 4: Run the Prisma migration against the Railway database**

From `apps/api` locally, with `DATABASE_URL` temporarily pointed at the Railway Postgres connection string (copy it from the Railway dashboard):

Run: `cd apps/api && DATABASE_URL="<railway-postgres-url>" npx prisma migrate deploy`
Expected: all migrations in `prisma/migrations/` (including Task 10's new one) apply cleanly.

Also enable the `vector` extension if the Postgres instance doesn't already have it:

Run: `psql "<railway-postgres-url>" -c "CREATE EXTENSION IF NOT EXISTS vector;"`

- [ ] **Step 5: Verify the deployed API**

Run: `curl -s https://<railway-api-domain>/health`
Expected: `{"status":"ok","service":"statemint-api",...}`.

This task has no automated test — it's infrastructure setup, verified manually as above.

### Task 19: Deploy the web app to Vercel

**Files:**
- No repo files required beyond what already exists (`apps/web/lib/api.ts` already reads `NEXT_PUBLIC_API_URL` — no code change needed).

- [ ] **Step 1: Create the Vercel project**

In the Vercel dashboard, import the repo, set the project root directory to `apps/web`, and let Vercel auto-detect the Next.js framework preset.

- [ ] **Step 2: Set the environment variable**

Add to the Vercel project's environment variables (Production):

```
NEXT_PUBLIC_API_URL=https://<railway-api-domain>/api
```

- [ ] **Step 3: Deploy**

Trigger a deploy from the Vercel dashboard (or push to the connected branch). Confirm the build succeeds and note the resulting Vercel domain, e.g. `https://statemint.vercel.app`.

- [ ] **Step 4: Update `FRONTEND_URL` on Railway and redeploy the API**

Back in Railway, set the `api` service's `FRONTEND_URL` environment variable to the real Vercel domain from Step 3, then redeploy the `api` service so `requireEnv('FRONTEND_URL')` and the CORS `origin` pick up the real value.

- [ ] **Step 5: Verify CORS end-to-end**

Open the deployed Vercel URL in a browser, open the browser's network tab, and confirm a request from the web app to the Railway API (e.g. `GET /api/tax/states`, which needs no auth) succeeds with no CORS error.

This task has no automated test — it's infrastructure setup, verified manually as above.

### Task 20: End-to-end manual verification on the live demo

**Files:** none — this is a manual verification pass, not a code change.

- [ ] **Step 1: Full walkthrough**

On the deployed Vercel URL:

1. Register a new account.
2. Log in.
3. Upload a real Nigerian bank statement PDF.
4. Wait for the status to progress through `PENDING → PARSING → CATEGORIZING → EMBEDDING → COMPLETED` (poll `GET /api/documents/:id/status` or refresh the dashboard).
5. View the analytics page for the uploaded document — confirm spending-by-category, monthly flow, and top merchants render.
6. Ask a question on the Q&A/chat feature — confirm an answer comes back (not the "trouble processing" fallback, assuming the HF token has quota).
7. Go to the tax section, run a tax calculation for the document, and confirm the breakdown, deductions, and payment guide render correctly.
8. Confirm the state payment guide page (`/api/tax/guide/:stateKey`) shows the correct portal URL for the selected state.

- [ ] **Step 2: Confirm the async-error-handling fix works in production**

Attempt an action expected to produce a clean error rather than a hang — e.g., request `GET /api/tax/some-nonexistent-document-id/summary` while authenticated, and confirm it returns 404 promptly (not a timeout), and try an obviously-malformed request to a POST endpoint to confirm a 400 rather than a hang.

- [ ] **Step 3: Report results**

Note any issues found during this walkthrough. If something fails, it should be triaged as a new, separately-scoped bug fix — not silently patched without updating this plan/spec, since that would leave the written record inconsistent with what was actually shipped.

---

## Self-Review Notes

- **Spec coverage:** Findings 1a-1h → Tasks 2-7. Finding 2 (async errors) → Task 9. Finding 3 (insecure defaults) → Task 11. Finding 4 (no tests) → Tasks 1, 12-15. Finding 5 (TaxProfile hack) → Task 10. Finding 6 (boilerplate) → Task 16. Finding 7 (Dockerfile) → Task 17. Finding 8 (web ChatMessage) → Task 8. Deployment goals → Tasks 18-19. Testing/verification plan → Task 20.
- **Task ordering fixed during self-review:** Vitest/supertest setup was originally drafted as a later "Part C" task, but Tasks 5 and 9 add regression tests as part of their fixes and need the runner already installed — moved to Task 1 so every later task that writes a `*.test.ts` file has `vitest`/`supertest` available. This is why Tasks 2-11 are one number higher than they were in the first draft.
- **Type consistency:** `requireEnv` (Task 11) is used identically in `index.ts`, `middleware/auth.ts`, and `auth.routes.ts`. `calculatePAYETax`/`calculateDeductions` (Task 12) match the signatures already defined in `tax.service.ts`. Mocked module shapes in test tasks (`prisma`, `queues`, `analytics.service`, `qa.service`, `tax.service`) match the real modules' actual exports as read during the audit.
- **No placeholders:** every step above includes literal, complete code — no "add appropriate tests" or "similar to Task N" placeholders.
