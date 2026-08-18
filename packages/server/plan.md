# Fix accent-insensitive / Unicode-normalized search in ValueSet/$expand

## Context

`ValueSet/$expand`'s `filter` parameter is matched against `Coding.display` using plain `ILIKE`, which is case-insensitive but **not accent-insensitive**, and no part of the pipeline normalizes Unicode text. This means a French-Canadian clinician typing "systeme" (no accent) gets zero results for "Système", and even a search with correct accents can fail to match stored text if the two strings use different Unicode normalization forms (precomposed NFC vs. decomposed NFD) — confirmed directly against the dev DB (`'Artère' ILIKE '%artere%'` → false; NFC `'é'` and NFD `'e'+combining acute` are literally different byte sequences in Postgres).

Two failing tests already exist in `src/fhir/operations/expand.test.ts` (describe block "Diacritic and Unicode normalization handling in filter", ~line 1150) that pin this behavior. This plan makes them pass and closes the same gap end-to-end: at write time (CodeSystem import), at query time (the DB-backed filter path), and in the JS in-memory fallback path used for pre-expanded/explicit-concept ValueSets.

Scope, per user decision: include a data backfill for pre-existing non-NFC rows, and include the JS in-memory fallback path fix for consistency.

## Design

**Core primitive — one SQL wrapper function, used everywhere:** Postgres's `unaccent()` is `STABLE` (depends on `search_path`/dictionary resolution), not `IMMUTABLE`, so it cannot be used directly in an index expression. Define a single `IMMUTABLE` SQL wrapper that both folds accents _and_ normalizes to NFC in one place, so the query predicate and the index expression can never drift out of sync (Postgres matches index expressions by parsed function OID, not text, but two independently-hand-written call sites is exactly how index usage silently rots):

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE OR REPLACE FUNCTION medplum_unaccent(text) RETURNS text AS $$
  SELECT unaccent('unaccent', normalize($1, 'NFC'))
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
```

`normalize()` (SQL-standard, PG13+, this repo runs PG16) is a pure algorithm — genuinely `IMMUTABLE` — so folding it into the wrapper means correctness no longer depends on the JS side having pre-normalized anything, or on the backfill having already run.

## Implementation steps

**1. `src/migrations/migrate.ts` — schema declaration**

- In `buildCodingTable()`, **replace** the existing `{ columns: ['system', { expression: 'display gin_trgm_ops', name: 'displayTrgm' }], indexType: 'gin' }` entry with:
  ```ts
  { columns: ['system', { expression: 'medplum_unaccent(display) gin_trgm_ops', name: 'displayUnaccentTrgm' }], indexType: 'gin' },
  ```
  Replace rather than add — `buildTextFilterPredicate` in `expand.ts` is the only caller of `display ILIKE`, and the new predicate is a strict superset match, so keeping both indexes would just double GIN write-amplification on every `Coding` insert (relevant at the 500k–1M row bulk-import scale, e.g. SNOMED CT).
- Add `CREATE EXTENSION IF NOT EXISTS unaccent;` to `writeSchema()` (~line 913) alongside the existing `pg_trgm`/`btree_gin` lines, for the from-scratch bootstrap `schema.sql`.
- Run `npm run migrate` locally (per established workflow) against a dev DB one version behind. Because `Coding` is an existing table, this index change will be auto-generated as a **postDeploy** `data/vNN.ts` (`CREATE INDEX CONCURRENTLY IF NOT EXISTS ...` + a drop of the old index), mirroring the existing `Coding_system_language_codeLowerPattern_idx` precedent in `src/migrations/data/v42.ts` — not a preDeploy schema file. Confirm this is what gets generated.

**2. Hand-edit the generated preDeploy `schema/vNN.ts`** (same `migrate` run should also produce/need one for the extension+function, since these must exist before the new server code path runs — the app code and the postDeploy index build are not guaranteed to land at the same instant). Prepend, following the exact precedent in `src/migrations/schema/v111.ts` (which hand-inserts `CREATE EXTENSION IF NOT EXISTS btree_gist` into an otherwise auto-generated file):

```ts
await fns.query(client, results, `CREATE EXTENSION IF NOT EXISTS unaccent`);
await fns.query(
  client,
  results,
  `
  CREATE OR REPLACE FUNCTION medplum_unaccent(text) RETURNS text AS $$
    SELECT unaccent('unaccent', normalize($1, 'NFC'))
  $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
`,
);
```

Before relying on the `IMMUTABLE` requirement, verify empirically: `SELECT provolatile FROM pg_proc WHERE proname = 'unaccent';` (expect `s` for stable, not `i`).

Accept the transient window (between this deploy and the postDeploy index finishing) where filtered `$expand` queries fall back to a sequential scan on large CodeSystems — this is the same trade-off already made for `codeLowerPattern`/`v42.ts`, so it's precedented; no two-release split needed unless the team wants extra caution here.

**3. `src/fhir/sql.ts` — new operator**, next to `LOWER_LIKE`/`ILIKE` (~line 73-84):

```ts
UNACCENT_ILIKE: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
  sql.append('medplum_unaccent(');
  sql.appendColumn(column);
  sql.append(') ILIKE medplum_unaccent(');
  sql.param(parameter as string);
  sql.append(')');
},
```

**4. `src/fhir/operations/expand.ts` — query path**

- `buildTextFilterPredicate` (~line 463): change the display-substring `Condition`'s operator from `'ILIKE'` to `'UNACCENT_ILIKE'`. This single change also fixes `countCandidatesBounded`, which reuses this function.
- `applyExpansionFilters` (~line 621): wrap both `strict_word_similarity` arguments in `medplum_unaccent` so ranking stays meaningful once accent-insensitive matches are possible:
  ```ts
  new SqlFunction('strict_word_similarity', [
    new SqlFunction('medplum_unaccent', [new Column(tableAlias, 'display')]),
    new SqlFunction('medplum_unaccent', [new Parameter(filterText)]),
  ]),
  ```
- `expandOperator` (~line 74): normalize `params.filter` to NFC right after the existing null-byte check. Not load-bearing for the DB path anymore (the SQL wrapper handles that), but feeds the JS fallback path below and is cheap defense-in-depth.

**5. `src/fhir/operations/expand.ts` — JS in-memory fallback path** (used for pre-expanded ValueSets and explicit `compose.include.concept` lists — no DB/index involved):

- Add a shared helper:
  ```ts
  function foldForFilter(s: string): string {
    return s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  }
  ```
- Use it in `filterIncludedConcepts` (~line 110, replacing the plain `.toLowerCase()` on `filter`) and in `matchesTextFilter` (~line 666, on the candidate `text`).

**6. `src/fhir/operations/codesystemimport.ts` — write path**

- In `importCodeSystem()` (~line 133), apply `.normalize('NFC')` to `c.display` when building `rows`, and to `designation.value` when building `synonyms` (both the designation-array branch ~line 158 and the synonym-property branch in `processProperties` ~line 232). This is the sole write path into `Coding` (covers both plain FHIR `CodeSystem` create/update and the batch `$import` operation). No conflict-handling changes needed — synonym inserts already use `.ignoreOnConflict()`, which safely absorbs any new collisions this normalization could introduce.

**7. Backfill — new postDeploy `src/migrations/data/vNN.ts`**, modeled on the batched-update pattern in `src/migrations/data/v25.ts` (uses `fns.batchedUpdate` — a `LIMIT`-bounded loop, not one large `UPDATE`, to avoid long-held locks on a 500k–1M row table):

- Update `Coding.display` to `normalize(display, 'NFC')` only where it differs.
- **Must** include a `NOT EXISTS` guard against the unique index on `('system', 'code', 'display', COALESCE("synonymOf", -1))` — two synonym rows for the same code could already differ only by normalization form (one NFC, one NFD), and collapsing both to the same NFC string would violate that unique constraint and abort the batch. Skip (don't fix) any row whose normalization would collide; true duplicates can be cleaned up separately.

**8. Tests (`src/fhir/operations/expand.test.ts`)**

- The two existing failing tests should pass unmodified once steps 1-4 land — this is the acceptance bar for the primary fix.
- Add a ranking test with ≥2 accented candidates sharing an unaccented root (e.g. "Système" and "Systématique" both matching filter "systeme"), since the two existing tests each have only one match and don't exercise the `ORDER BY` change from step 4.
- Add a JS-fallback-path test mirroring the two DB-path tests but via a ValueSet using `compose.include.concept` (exercises `foldForFilter`, which the DB-path tests don't touch).
- Add a write-path test (model: `src/fhir/lookups/coding.test.ts`'s pattern of querying `Coding` directly with raw SQL) asserting that an NFD-decomposed `display`/`designation.value` submitted via CodeSystem create is stored as NFC.

## Critical files

- `src/fhir/sql.ts` — new `UNACCENT_ILIKE` operator
- `src/fhir/operations/expand.ts` — query predicate, ranking, filter normalization, JS fallback path
- `src/fhir/operations/codesystemimport.ts` — write-time NFC normalization
- `src/migrations/migrate.ts` — index declaration (`buildCodingTable`), extension bootstrap (`writeSchema`)
- `src/migrations/data/v25.ts` — batched-update precedent to copy for the backfill
- `src/migrations/schema/v111.ts` — precedent for hand-editing a generated preDeploy file to add extension/function DDL
- `src/fhir/operations/expand.test.ts`, `src/fhir/lookups/coding.test.ts` — test locations

## Verification

1. `npx vitest run src/fhir/operations/expand.test.ts` — the two existing diacritic/normalization tests pass, plus new ranking/fallback tests, with no regressions in the other ~94 tests in the file.
2. `npx vitest run src/fhir/lookups/coding.test.ts src/fhir/operations/codesystemimport.test.ts` — new write-path normalization test passes.
3. Run `npm run migrate` against the local dev DB, confirm the generated preDeploy/postDeploy file split matches the plan (extension+function in preDeploy, index create/drop in postDeploy), then apply and re-run the manual psql checks from the investigation (`SELECT medplum_unaccent('Système')`, `'Artère' ILIKE ...` equivalents) to confirm end-to-end behavior against real Postgres.
4. `EXPLAIN ANALYZE` a filtered `$expand` query against a large seeded CodeSystem (SNOMED/LOINC, per the dev DB's existing seed data) to confirm the planner uses the new `displayUnaccentTrgm` GIN index rather than a sequential scan.
5. Spot-check the backfill migration against the seeded large CodeSystems: confirm it completes without a unique-constraint error and that the affected row count is small (most terminology data should already be NFC).
