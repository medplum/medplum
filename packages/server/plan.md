# Make `$expand` paginate in concept space and treat `displayLanguage` as a display preference

## Context

`ValueSet/$expand` applies its page window in **row space** while returning results in
**concept space**. `applyExpansionFilters` (`src/fhir/operations/expand.ts:671`) emits
`LIMIT count + 1 OFFSET offset` over `Coding` rows, but `addExpansionItems`
(`expand.ts:313-343`) collapses every row for the same code into one
`expansion.contains` entry. Any code represented by more than one row therefore straddles
page boundaries.

`displayLanguage` is what makes this bite, because `expand.ts:661` implements it as
`WHERE language = <lang>`, which selects *designation* rows — and FHIR permits several
designations per language (distinguished by `designation.use`).

Measured on a 4-code system where each code has two `fr` designations (8 rows):

| request | response |
|---|---|
| `displayLanguage=fr&count=50` | `total=4`, `[C1,C2,C3,ROOT]` — correct |
| `count=2&offset=0` | `total=2`, `[C1,C2]` |
| `count=2&offset=2` | `total=2`, `[C2,C3]` |
| `count=2&offset=4` | `total=2`, `[C3,ROOT]` |
| `count=2&offset=6` | `total=1`, `[ROOT]` |

Walking the pages yields `C1,C2,C2,C3,C3,ROOT,ROOT` — every code after the first is
duplicated. Worse, page 0 reports `total = 2 == count`, because the `count + 1` has-more
probe fetched 3 *rows* that collapsed to 2 *concepts*, so a paging client stops after page
0 having seen 2 of 4 codes. Reproduced identically on the flat include, the `is-a`
descendant path, and the `is-a` + `filter` ancestor path, confirming the defect is in the
shared window rather than in one strategy.

Three further defects share one root cause — using `language`, rather than `synonymOf`, to
decide which rows are canonical:

1. **Empty expansion when `displayLanguage` equals the CodeSystem's own language.**
   `importCodeSystem` inserts canonical rows with no `language`
   (`codesystemimport.ts:152-162`), so `WHERE language = 'en'` on a `language: 'en'`
   CodeSystem matches nothing: `$expand?displayLanguage=en` returns `{"total": 0}`.
   `addExpansionItems:321` already encodes the correct reading (a canonical row's language
   *is* `codeSystem.language`), so the filter contradicts its own file.
2. **Language-less designations leak.** `language IS NULL` (`expand.ts:664`) also matches
   designation rows carrying no language, so they surface as `designation` entries on
   requests that set neither `includeDesignations` nor `displayLanguage`, and they consume
   a slot in the page window. This is not hypothetical: rows written by the `#synonym`
   property path (`codesystemimport.ts:239-256`) set `synonymOf` and leave `language`
   unset, so every imported CodeSystem using that property is affected.
   `buildTextFilterPredicate:476` and `joinDesignations:625` use `synonymOf IS NULL` for
   the same notion, so the conventions disagree within one query.
3. **`includeDesignations` is silently ignored** whenever `displayLanguage` is set, because
   `expand.ts:660-665` is an `if / else if`.

Finally, `displayLanguage` currently changes *membership*, and differently per path, so the
same logical ValueSet has a different size and page count depending on how it is stored:
the DB include drops codes lacking a translation (asserted today at `expand.test.ts:1534`
vs `:1611` — `FSH` disappears); the enumerated `compose.include.concept` path also drops
them via `validateCodings` (`codesystemvalidatecode.ts:103-107`) but then returns the
*untranslated* ValueSet text as the display; and the pre-expanded path keeps the code and
falls back to the base display (`expand.test.ts:1604`).

### Intended outcome

The page window counts concepts, so paging any combination of `filter`, `displayLanguage`,
`includeDesignations`, and `excludeNotForUI` visits every code exactly once — and
`displayLanguage` becomes a display preference that never changes which codes are in the
expansion.

## The invariant

Everything below follows from one rule, which the current file does not have:

> **The driving query returns exactly one row per concept — canonical rows only. Anything
> language- or designation-shaped is either a set operation folded into the `WHERE` (so it
> cannot multiply rows) or decoration applied to the page after the window.**

The type change enforces it: `ExpansionRow` loses `synonymOf` and `language`, so no
downstream code can reconcile rows against each other again.

## Settled decisions

- **`displayLanguage` is a display preference.** Resolve the requested language's
  designation and fall back to the canonical display, so a code with no translation stays
  in the expansion. This also makes `displayLanguage == CodeSystem.language` fall back
  correctly instead of returning empty.
- **A text filter matches *any* display the concept has** — canonical display, translations,
  and `#synonym` rows alike — and the result is shown in the requested language when one is
  set. `displayLanguage` does not scope what the filter searches. This keeps the query
  drivable from the trigram GIN index (non-partial, so it covers designation rows), and it
  is closer to today's behavior than scoping by language would be: `language IS NULL` at
  `expand.ts:664` already makes `#synonym` rows searchable, which is their entire purpose.
  It is nonetheless a **membership change under `filter`**: a code whose only match is a
  French designation now comes back on an unlocalized request, displayed in English.
- **Designations are fetched for the page, not joined into the window.** One mechanism
  serves `includeDesignations`, `displayLanguage`, and `$validate-code`.
- **The base display is no longer relocated into `designation`** when `displayLanguage`
  substitutes a translation (today `addExpansionItems:326-328`). A `displayLanguage`
  response carries only the translated display unless `includeDesignations` is also set.
  Nothing in the spec requires the relocation, and keeping it would mean the decoration
  query must run even when designations were not requested.
- **`expansion.total` stays a `count + 1` has-more probe**, applied after per-concept
  resolution so it counts concepts. No second aggregate query, so no regression against the
  500k–1M-code scale constraint. Exact `COUNT(*)` and spec-correct `count=0` stay out of
  scope.
- **`CodeSystem/$validate-code` is fixed too**, since `$expand`'s enumerated path runs
  through `validateCodings`.
- **Multi-include `offset` is out of scope** (see below).

## Why this is index-shaped, not just a rewrite

The indexes actually present on `Coding` (verified against the dev DB; declared in
`src/migrations/migrate.ts:658-700`):

| Index | Definition |
|---|---|
| `Coding_system_code_primary_idx` | `UNIQUE (system, code) INCLUDE (id) WHERE "synonymOf" IS NULL` |
| `Coding_system_code_display_synonymOf_idx` | `UNIQUE (system, code, display, COALESCE("synonymOf", -1))` — **not** partial |
| `Coding_system_displayUnaccentTrgm_idx` | `GIN (system, medplum_unaccent(display) gin_trgm_ops)` — **not** partial |
| `Coding_system_codeLowerPattern_idx` | `(system, lower(code) text_pattern_ops) WHERE "synonymOf" IS NULL` |
| `Coding_system_language_codeLowerPattern_idx` | `(system, language, lower(code)) WHERE language IS NOT NULL` |

Three consequences drive the whole design:

- **`synonymOf IS NULL` is the indexed notion of "canonical".** There is *no* index with a
  `language IS NULL` predicate, so today's `expand.ts:664` filter is only ever a recheck.
  Switching to `synonymOf IS NULL` is both the correctness fix and an index win.
- **Canonical rows are already one-per-concept and already ordered by `(system, code)`.**
  So driving the expansion off canonical rows makes `LIMIT/OFFSET` a concept-space window
  *and* gives a deterministic ordering from an index scan with no sort — which also closes
  the unordered-pagination gap on the unfiltered path.
- **There is no index on `synonymOf`.** Designation rows are only reachable by
  `(system, code)` prefix on `Coding_system_code_display_synonymOf_idx` — the partial
  `..._primary_idx` excludes them. So every designation lookup in this plan keys on
  `(system, code)`. A lookup keyed on `d."synonymOf" = <outer id>`, which is the obvious
  way to write it, has no supporting index and degenerates to a sequential scan over
  `Coding` — per outer row if written as a lateral. That is the single biggest performance
  trap here.

No migration is required, but only because of the last point: every predicate this plan
introduces keys on `(system, code)`, `synonymOf IS NULL`, `id`, or the trigram expression.
`Coding_system_language_codeLowerPattern_idx` becomes unused by `$expand` once the code
branch stops being language-scoped; leave it in place, and revisit separately. (It is
declared in `migrate.ts` but may not yet exist in a given dev DB — irrelevant here, since
nothing in this plan depends on it.)

## Design

### 1. Canonical rows become the unit of pagination

In `expansionQuery` (`expand.ts:368`), add `synonymOf IS NULL` to the base predicate and
drop the `language` scoping from `applyExpansionFilters` (`expand.ts:660-665`) entirely.
The select list keeps `id`, `code`, and `display`; `synonymOf`/`language` are no longer
needed for reconciliation. Add `ORDER BY code` unconditionally so the unfiltered path is
deterministic.

The ordering is free on the flat path (it is the index order of
`Coding_system_code_primary_idx`) but **not** on the descendant path, where the driving
relation is `cte_descendants` — no index, so this is a full sort of the materialized
subtree on every request. Keep it anyway: a recursive CTE has no stable output order across
offsets, so correct paging requires the sort. Confirm the cost in Verification §3.

### 2. Designations become page decoration — one mechanism

Delete `joinDesignations` (`expand.ts:605`) and add no join in its place. Once the page is
windowed to at most `count + 1` concepts, fetch every designation row for exactly those
codes in one follow-up query, reusing `selectCoding(codeSystem.id, ...pageCodes)`
(`utils/terminology.ts:154`) — its leading `(system, code)` columns are served by
`Coding_system_code_display_synonymOf_idx`. Add `.where('synonymOf', '!=', null)` (which
renders `IS NOT NULL`, `sql.ts:64-71`) and, when `displayLanguage` is set but
`includeDesignations` is not, `.where('language', '=', displayLanguage)` so only the rows
that can affect the display are read.

Resolve both concerns in JS from those rows:

- `display = <requested-language row>?.display ?? <canonical display>`
- `designation[]` from all rows, when `includeDesignations` is set

Skip the query entirely when neither parameter is set, and **guard on an empty page**:
`Operator.IN` renders `IN ()` for an empty array (`sql.ts:627-645`), which is a syntax
error.

This is what lets `includeDesignations` and `displayLanguage` both apply to one request
(defect 3), and it removes the `displayLanguage || includeDesignations` special case at
`expand.ts:589-591`. When several designations share a language, pick the lowest `id` for
stability — the `Coding` table has no `designation.use` column, so there is no better
discriminator, and an arbitrary-but-deterministic choice is what keeps pages repeatable.

Note what this deliberately is *not*: a `LEFT JOIN LATERAL` on `d."synonymOf" = ...` in the
driving query. That form is unindexed (see above), it puts decoration back inside the
window, and `SelectQuery.columns` is typed `Column[]` — two columns both named `display`
would collide in the result row unless aliased. One extra bounded query beats all of that.

### 3. Filtered path: semi-join, then rank, then window

`buildTextFilterPredicate` (`expand.ts:466`) loses its `codeScope` toggle — canonicality now
lives in the outer `WHERE`. The code branch matches `LOWER(code) LIKE 'x%'` on canonical
rows, served by `Coding_system_codeLowerPattern_idx` (whose partial predicate the planner
can prove from the outer `synonymOf IS NULL`).

For the display branch, keep the trigram scan as the *driving* relation and semi-join it
back to canonical rows, using the existing `IN_SUBQUERY` operator (`sql.ts:185`, emits
`= ANY(...)`) and `canonicalCodingId` (`utils/terminology.ts:165`, already returns a raw
`Column`). The two branches stay a **disjunction**, exactly as today — a filter that matches
a code but no display must still return:

```sql
WHERE "Coding"."system" = $sys AND "Coding"."synonymOf" IS NULL
  AND (
    <code match on "Coding"."code">
    OR "Coding"."id" = ANY(
      SELECT COALESCE("m"."synonymOf", "m"."id") FROM "Coding" m
      WHERE "m"."system" = $sys AND <trigram display match>
    )
  )
```

`= ANY(subquery)` is a semi-join, so duplicate matches for one code collapse without any
`DISTINCT ON` — one output row per concept, and the window is concept-space. The subquery
is **not** scoped by `synonymOf` or `language`: per Settled decisions it searches every
display the concept has. That means one query shape for all parameter combinations, so
there is one plan to validate rather than three.

Ranking is unchanged in spirit (`expand.ts:646-657`): exact-code-first, then
`strict_word_similarity` over accent-folded text, then `code` as tiebreaker. When
`displayLanguage` is set, the similarity should be scored against the text the client will
actually see, which is the one thing §2's post-window resolution cannot supply — ranking
happens before `LIMIT`. So attach a lateral **only when `filter` and `displayLanguage` are
both present**, keyed on `(system, code)` rather than `synonymOf`, and against the driving
relation's alias (`query.effectiveTableName`) rather than a hardcoded `"Coding"` — on the
descendant path the driving relation is the CTE:

```sql
LEFT JOIN LATERAL (
  SELECT d."display" FROM "Coding" d
  WHERE d."system" = $sys AND d."code" = <driving>."code"
    AND d."language" = $lang
  ORDER BY d."id" LIMIT 1
) AS "T1" ON true
```

`LEFT JOIN LATERAL` is a supported `JoinType` (`sql.ts:521`) and `new Constant('true')` is
the established `ON` expression (`sql.test.ts:250-256`, `lookups/lookuptable.ts:236`).
`d."language" = $lang` cannot match a canonical row, since canonical rows carry no language.

Use `T1.display` **only** in `orderByExpr`, nested inside the existing `MedplumUnaccentFn`
call as `COALESCE(T1.display, <driving>.display)`; `orderByExpr` takes arbitrary expressions
and binds parameters correctly. Do not add it to the select list — §2 already resolves the
display, and the render-a-`SqlFunction`-to-text workaround silently drops bound parameters.

If `EXPLAIN` shows a poor plan for the semi-join, the fallback is a
`DISTINCT ON (canonicalCodingId)` derived table joined back to `Coding` — same shape, one
extra sort.

### 4. Hierarchy paths

- **Descendant strategy**: restrict the base term of `addDescendants`
  (`utils/terminology.ts:275-282`) to `synonymOf IS NULL`. `Coding_Property.coding` always
  references canonical ids (`codesystemimport.ts:220`), so this strictly reduces work and
  removes the reason `joinDesignations` existed. `addDescendants` has no callers outside
  `expand.ts:588` and its own test, so the change is contained.
- **Ancestor strategy**: restrict the `origin` base term in `addParentFilter`
  (`expand.ts:572-579`) to `synonymOf IS NULL` as well. This subquery runs *per candidate
  row*, and its seed currently multiplies by the number of designation rows on the code for
  no benefit once the outer scan is canonical-only. The `EXISTS(findAncestor …)`
  correlation on `origin.code = Coding.code` is otherwise unchanged.
  **Leave `findAncestor`'s `synonymOf` disjunct (`utils/terminology.ts:220`) alone** even
  though it becomes dead for this caller: `subsumes.ts:88` and `valuesetvalidatecode.ts:196`
  pass `selectCoding` bases that do contain synonym rows.
- `addAbstractFilter` (`expand.ts:675`) is unchanged: `canonicalCodingId` degenerates to
  `id` on canonical rows. (`canonicalCodingId` itself must stay, since
  `addPropertyFilter` is shared with `valuesetvalidatecode.ts:179`.)

### 5. `addExpansionItems` simplifies

With one row per concept, the primary-vs-synonym reconciliation (`expand.ts:320-341`) and
the `DisplayLanguages` map both disappear — including the `displayLanguages` parameter
threaded through `computeExpansion`'s recursion (`expand.ts:199`, `:231`, `:268`) and
`includeInExpansion`. The function becomes: build one entry per row, then let §2's resolver
overwrite `display` and attach `designation[]` for the page. Keep it exported — six test
call sites use it.

### 6. `countCandidatesBounded` counts concepts

`CANDIDATE_THRESHOLD` (`expand.ts:454`) is documented in codes, so the count must be in
codes. Do not wrap the current row-limited derived table in `COUNT(DISTINCT …)`: capping
rows and then de-duplicating yields a lower bound biased in the harmful direction — on
SNOMED, 2001 matched rows might be ~200 concepts, so the heuristic would pick `ancestor`
(the per-candidate walk) exactly when `descendant` is cheaper.

Instead, count rows of **the same query §3 builds** — canonical rows semi-joined to the
match set — so the `LIMIT` caps concepts directly:

```sql
SELECT COUNT(*)::int AS "count" FROM (
  SELECT 1 FROM "Coding"
  WHERE "system" = $sys AND "synonymOf" IS NULL AND <§3 predicate>
  LIMIT $limit
) AS "c"
```

This keeps the existing wrapped-derived-table shape (`expand.ts:512-520`), drops the
`displayLanguage` argument entirely, and means the strategy decision is made against the
same predicate the expansion will run — one builder, two call sites.

### 7. `validateCodings` shares the display resolver

In `codesystemvalidatecode.ts:100-116`, drop the `language`/`synonymOf` branch and issue a
single `selectCoding` for the requested codes, scoped by
`(synonymOf IS NULL OR language = $lang)` when a language is given and unscoped otherwise.
Membership comes from the canonical row; the display comes from the same JS resolver as §2.
A code with no translation then validates successfully and returns its base display.
Display precedence: caller-supplied `coding.display` → requested-language designation →
canonical display.

For `$expand`'s enumerated path, `filterIncludedConcepts` already resolves a display from
`include.concept[].designation` via `getDisplayText` (`expand.ts:707`); the CodeSystem
translation should fill in only when the ValueSet supplies none, so pass the ValueSet-derived
display through as the caller-supplied value.

### Sequencing

Four independently landable, independently testable commits. Only the third carries
plan-shape risk, and it is the only one that would have to be reverted if `EXPLAIN`
disappoints:

1. **§1 + §4 + §5** — canonical-only driving query, `ORDER BY`, hierarchy base terms,
   `addExpansionItems`. Fixes the paging defect and Context defects 1 and 2 on their own.
2. **§2** — designations as page decoration; deletes `joinDesignations`, fixes defect 3.
3. **§3 + §6** — filter semi-join, translated ranking, shared candidate count.
4. **§7** — `$validate-code` and the enumerated path.

### Files

| File | Change |
|---|---|
| `src/fhir/operations/expand.ts` | §1–§6. Bulk of the work |
| `src/fhir/operations/utils/terminology.ts` | §4 `addDescendants` base term |
| `src/fhir/operations/codesystemvalidatecode.ts` | §7 |

## Tests

Convert the relevant `test.fails('FAILING …')` cases in `describe('Pagination')`
(`expand.test.ts:2541`) to passing tests — the row/concept ones at `:2748`, `:2754`, `:2761`
and the `displayLanguage` membership one at `:2786`. Leave the multi-include and
`total`/`offset`/`count=0` cases failing (out of scope).

Add the cases the existing fixtures cannot reach, since `designationCodeSystem`
(`:2571-2594`) gives each code at most one designation per language:

1. A code with **two designations in the same language**, paged with `count=2` — assert
   pages partition the concepts with no duplicate and no early `total`.
2. `displayLanguage` equal to `CodeSystem.language` — assert the full expansion with base
   displays, not `total: 0`.
3. A designation with **no language**, and a `#synonym`-property row — assert neither
   appears without `includeDesignations` and neither consumes a window slot.
4. `filter` matching **only** a French designation, with no `displayLanguage` — assert the
   code is returned with its English display (the membership change in Settled decisions),
   and that a `#synonym` row's text still matches.
5. `filter` + `displayLanguage` together — assert the translated display is what comes back
   and that the better translated match outranks a worse one.
6. `includeDesignations` + `displayLanguage` together — assert both apply (defect 3).

Update existing assertions that encode the old semantics:

- `expand.test.ts:1534`, `:1544` — `FSH` is now present with its base display under
  `displayLanguage=fr` (use `toContainExactly`, `src/test-matchers.ts:12`), and the
  displaced base display is no longer relocated into `designation`.
- `expand.test.ts:1108-1123` — the code-branch/display-branch canonicality asymmetry is
  gone.
- `expand.test.ts:1392-1402` — `joinDesignations` is deleted; drop the test and its import.
- The `addExpansionItems` unit tests (`:2212`–`:2302`) — new row shape, no
  `displayLanguages` argument.
- `utils/terminology.test.ts:29-31` — `addDescendants` SQL shape.
- `codesystemvalidatecode.test.ts:326-335` — a code lacking a translation now validates.

Add SqlBuilder shape assertions (the `:2794-2807` pattern) for the semi-join, the
unconditional `ORDER BY`, that the ranking lateral appears **only** when `filter` and
`displayLanguage` are both set, and that the decoration query is skipped when neither
`includeDesignations` nor `displayLanguage` is set.

## Verification

1. `npx vitest run src/fhir/operations/expand.test.ts src/fhir/operations/codesystemvalidatecode.test.ts src/fhir/operations/utils/terminology.test.ts`
   — plus `codesystemlookup`, `valuesetvalidatecode`, `subsumes`, and `codesystemimport`,
   which share the `Coding` helpers.
2. Re-run the reproduction from Context (4 codes × 2 `fr` designations, `count=2`) and
   confirm the pages partition into `[C1,C2]`, `[C3,ROOT]`, `[]` with no repeats.
3. Confirm plans against the large seeded systems in the local dev DB
   (`psql -h localhost -U medplum medplum`): `EXPLAIN (ANALYZE)` a SNOMED `is-a` expansion
   with and without `filter`/`displayLanguage`, checking that
   - `Coding_system_code_primary_idx` drives the unfiltered path (index scan, no sort);
   - `Coding_system_displayUnaccentTrgm_idx` drives the filtered path, and the semi-join
     does not degrade into a sequential scan over canonical rows;
   - the §2 decoration query uses `Coding_system_code_display_synonymOf_idx` and never a
     seq scan;
   - the ranking lateral, when present, is an index scan per row — a seq scan here means it
     was keyed on `synonymOf` by mistake;
   - the descendant path's `ORDER BY code` sort cost is acceptable on a large subtree
     (§1) — if not, that is the signal to reconsider the sort, not the ordering.
4. Spot-check via the dev server (`curl -u clientId:secret localhost:8103`) that
   `displayLanguage=en` on an English CodeSystem returns a full expansion.

## Out of scope (follow-ups)

- **Keyset pagination.** Ordering the expansion by `code` in concept space is the
  precondition for `WHERE code > $last`. With `OFFSET` still O(offset), this is the
  remaining scale problem on 500k–1M-code systems — and the reason the ordering decision in
  §1 should not be re-litigated later.
- `offset` being consumed independently by each `compose.include` and each nested
  `include.valueSet`, and ignored entirely on the pre-expanded and enumerated paths. Still
  covered by the `test.fails` cases at `expand.test.ts:2675`, `:2687`, `:2698`, `:2705`.
- `expansion.total` as an exact count, `expansion.offset` never being echoed, `count=0`
  semantics, and `count` being overridden by the typeahead default.
- `count=999` returning 1000 concepts because `expandValueSet:178-190` slices to
  `MAX_EXPANSION_SIZE` rather than `count`.
- Dropping the now-unused `Coding_system_language_codeLowerPattern_idx`.
- Restricting the `selectCoding` bases in `subsumes.ts:80` and `valuesetvalidatecode.ts:169`
  to canonical rows, which would let `findAncestor`'s `synonymOf` disjunct go away entirely.
