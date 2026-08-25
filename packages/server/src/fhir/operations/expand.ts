// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, append, badRequest, EMPTY, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  CodeSystem,
  CodeSystemProperty,
  Coding,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeConcept,
  ValueSetComposeIncludeFilter,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import type { Repository } from '../repo';
import { repoAccess } from '../repository/access-tracker';
import type { Expression, PgQueryable } from '../sql';
import {
  Column,
  Condition,
  Conjunction,
  Constant,
  escapeLikeString,
  MedplumUnaccentFn,
  Parameter,
  SelectQuery,
  SqlFunction,
  Union,
} from '../sql';
import { validateCodings } from './codesystemvalidatecode';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  abstractProperty,
  addDescendants,
  addPropertyFilter,
  findAncestor,
  findTerminologyResource,
  getParentProperty,
  selectCoding,
} from './utils/terminology';

const operation = getOperationDefinition('ValueSet', 'expand');
const MAX_FILTER_TOKENS = 10;

type ValueSetExpandParameters = {
  url?: string;
  filter?: string;
  offset?: number;
  count?: number;
  excludeNotForUI?: boolean;
  includeDesignations?: boolean;
  displayLanguage?: string;
  valueSet?: ValueSet;
};

/**
 * Implements FHIR ValueSet expansion.
 * @see https://www.hl7.org/fhir/operation-valueset-expand.html
 * @param req - The incoming request.
 * @returns The server response.
 */
export async function expandOperator(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ValueSetExpandParameters>(operation, req);
  const filter = params.filter;
  if (filter !== undefined && typeof filter !== 'string') {
    return [badRequest('Invalid filter')];
  }
  if (filter?.includes('\0')) {
    throw new OperationOutcomeError(badRequest('Filter value cannot contain null bytes'));
  }
  if (filter) {
    // Input methods vary in whether they emit precomposed or decomposed accented characters. Both match
    // paths renormalize anyway, but the code comparisons and the ranking parameter do not, so settle on
    // one form here and let everything downstream read a canonical params.filter.
    params.filter = filter.normalize('NFC');
  }
  if (filter && filter.trim().split(/\s+/g).length > MAX_FILTER_TOKENS) {
    return [badRequest(`Filter value cannot contain more than ${MAX_FILTER_TOKENS} tokens`)];
  }

  const repo = getAuthenticatedContext().repo;
  let valueSet = params.valueSet;
  if (!valueSet) {
    let url = params.url;
    if (!url) {
      return [badRequest('Missing url')];
    }

    const pipeIndex = url.indexOf('|');
    if (pipeIndex >= 0) {
      url = url.substring(0, pipeIndex);
    }

    valueSet = await findTerminologyResource<ValueSet>(repo, 'ValueSet', url);
  }

  if (params.filter && !params.count) {
    params.count = 10; // Default to small page size for typeahead queries
  }
  const result = await expandValueSet(repo, valueSet, params);

  return [allOk, buildOutputParameters(operation, result)];
}

const MAX_EXPANSION_SIZE = 1000;

export function filterIncludedConcepts(
  concepts: ValueSetComposeIncludeConcept[] | ValueSetExpansionContains[] | Coding[],
  params: ValueSetExpandParameters,
  system?: string
): ValueSetExpansionContains[] {
  const filter = params.filter?.trim();
  return flattenConcepts(concepts, {
    filter: filter ? foldForFilter(filter) : filter,
    system,
    displayLanguage: params.displayLanguage,
  });
}

/**
 * Folds text down to the form the in-memory filter compares on: case-, accent-, and
 * normalization-insensitive. The JS equivalent of the `medplum_unaccent(...) ILIKE` predicate used on the
 * database path, for pre-expanded ValueSets and explicit `compose.include.concept` lists. Only combining
 * marks are stripped, so letters whose accent is part of the glyph (ø, ð) fold less aggressively here than
 * Postgres `unaccent` folds them.
 * @param s - The text to fold.
 * @returns The folded text.
 */
function foldForFilter(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function flattenConcepts(
  concepts: ValueSetComposeIncludeConcept[] | ValueSetExpansionContains[] | Coding[],
  options?: {
    filter?: string;
    system?: string;
    displayLanguage?: string;
  }
): ValueSetExpansionContains[] {
  const result: Coding[] = [];
  for (const concept of concepts) {
    const system = (concept as Coding).system ?? options?.system;
    if (!system) {
      throw new Error('Missing system for Coding');
    }

    // Flatten contained codings recursively
    const contained = (concept as ValueSetExpansionContains).contains;
    if (contained) {
      result.push(...flattenConcepts(contained, options));
    }

    const filter = options?.filter;
    const display = getDisplayText(concept, options?.displayLanguage);
    if (!filter || matchesTextFilter(display, filter)) {
      result.push({ system, code: concept.code, display });
    }
  }

  return result;
}

export async function expandValueSet(
  repo: Repository,
  valueSet: ValueSet,
  params: ValueSetExpandParameters
): Promise<ValueSet> {
  const expandedSet = await computeExpansion(repo, valueSet, params);
  if (expandedSet.length >= MAX_EXPANSION_SIZE) {
    valueSet.expansion = {
      total: MAX_EXPANSION_SIZE + 1,
      timestamp: new Date().toISOString(),
      contains: expandedSet.slice(0, MAX_EXPANSION_SIZE),
    };
  } else {
    valueSet.expansion = {
      total: expandedSet.length,
      timestamp: new Date().toISOString(),
      contains: expandedSet.slice(0, params.count),
    };
  }
  return valueSet;
}

async function computeExpansion(
  repo: Repository,
  valueSet: ValueSet,
  params: ValueSetExpandParameters,
  terminologyResources: Record<string, WithId<CodeSystem> | WithId<ValueSet>> = Object.create(null)
): Promise<ValueSetExpansionContains[]> {
  const preExpansion = valueSet.expansion;
  if (
    preExpansion?.contains?.length &&
    !preExpansion.parameter &&
    (!preExpansion.total || preExpansion.total === preExpansion.contains.length)
  ) {
    // Full expansion is already available, use that
    return filterIncludedConcepts(preExpansion.contains, params);
  }

  if (!valueSet.compose?.include.length) {
    throw new OperationOutcomeError(badRequest('Missing ValueSet definition', 'ValueSet.compose.include'));
  }

  const maxCount = params.count ?? MAX_EXPANSION_SIZE;
  const expansion: ValueSetExpansionContains[] = [];
  for (const include of valueSet.compose.include) {
    if (include.valueSet) {
      for (const url of include.valueSet) {
        const includedValueSet = await findTerminologyResource<ValueSet>(repo, 'ValueSet', url);
        terminologyResources[includedValueSet.url as string] = includedValueSet;

        const nestedExpansion = await computeExpansion(
          repo,
          includedValueSet,
          {
            ...params,
            count: maxCount - expansion.length,
          },
          terminologyResources
        );
        expansion.push(...nestedExpansion);

        if (expansion.length >= maxCount) {
          // Skip further expansion
          break;
        }
      }
      continue;
    }
    if (!include.system) {
      throw new OperationOutcomeError(
        badRequest('Missing system URL for ValueSet include', 'ValueSet.compose.include.system')
      );
    }

    if (expansion.length >= maxCount) {
      // Skip further expansion
      break;
    }

    const codeSystem =
      (terminologyResources[include.system] as WithId<CodeSystem>) ??
      (await findTerminologyResource(repo, 'CodeSystem', include.system));
    terminologyResources[include.system] = codeSystem;

    if (include.concept) {
      const filteredCodings = filterIncludedConcepts(include.concept, params, include.system);
      const validCodings = await validateCodings(codeSystem, filteredCodings, params);
      for (const c of validCodings) {
        if (c) {
          c.id = undefined;
          expansion.push(c);
        }
      }
    } else {
      await includeInExpansion(include, expansion, codeSystem, params);
    }
  }

  return expansion;
}

async function includeInExpansion(
  include: ValueSetComposeInclude,
  expansion: ValueSetExpansionContains[],
  codeSystem: WithId<CodeSystem>,
  params: ValueSetExpandParameters
): Promise<void> {
  const db = getAuthenticatedContext().repo.getDatabaseClient(
    // for non resource tables derived from CodeSystem, e.g. Coding and CodeSystem_Property
    repoAccess.sqlRead('CodeSystem', { source: 'expand.includeInExpansion' })
  );
  await hydrateCodeSystemProperties(db, codeSystem);

  const strategy = await chooseParentFilterStrategy(db, include, codeSystem, params);
  const query = expansionQuery(include, codeSystem, params, strategy);
  if (!query) {
    return;
  }

  const results = await query.execute(db);
  const page = addExpansionItems(results as ExpansionRow[], expansion, codeSystem);
  await applyDesignations(db, codeSystem, page, params);
}

interface ExpansionRow {
  code: string;
  display: string | null;
}

/**
 * Adds rows from the database to the computed expansion, one entry per row.
 * @param rows - The database rows containing codes and display strings.
 * @param expansion - The expansion currently being generated.
 * @param codeSystem - The CodeSystem from which the codes are drawn.
 * @returns The expansion entries for the given rows.
 */
export function addExpansionItems(
  rows: ExpansionRow[],
  expansion: ValueSetExpansionContains[],
  codeSystem: WithId<CodeSystem>
): ValueSetExpansionContains[] {
  const system = codeSystem.url;
  const page: ValueSetExpansionContains[] = [];
  for (const { code, display } of rows) {
    // An earlier include may already have contributed the code; keep the expansion a set of concepts
    let entry = expansion.find((o) => o.code === code && o.system === system);
    if (!entry) {
      entry = { system, code, display: display ?? undefined };
      expansion.push(entry);
    }
    page.push(entry);
  }
  return page;
}

/**
 * Resolves `displayLanguage` and `includeDesignations` for the concepts on the current page, in one query.
 *
 * Designations are decoration applied after the page window rather than a join inside it: joining them would
 * put more than one row per concept back into the driving query, which is what makes `LIMIT`/`OFFSET` count
 * rows instead of concepts. Keyed on `(system, code)` to hit `Coding_system_code_display_synonymOf_idx` — a
 * lookup on `synonymOf` has no supporting index.
 * @param db - Database client.
 * @param codeSystem - The CodeSystem the concepts are drawn from.
 * @param page - The expansion entries contributed by the current include.
 * @param params - The expand parameters.
 */
async function applyDesignations(
  db: PgQueryable,
  codeSystem: WithId<CodeSystem>,
  page: ValueSetExpansionContains[],
  params: ValueSetExpandParameters
): Promise<void> {
  const { displayLanguage, includeDesignations } = params;
  if (!displayLanguage && !includeDesignations) {
    return;
  }
  const codes = new Set(page.map((entry) => entry.code as string));
  if (!codes.size) {
    return; // `IN ()` is a syntax error
  }

  const query = selectCoding(codeSystem.id, ...codes)
    .where('synonymOf', '!=', null)
    // Several designations may share a language; the lowest ID is an arbitrary but stable choice, which is
    // what keeps repeated requests for the same page identical
    .orderBy('id');
  if (displayLanguage && !includeDesignations) {
    query.where('language', '=', displayLanguage);
  }
  const rows: { code: string; display: string | null; language: string | null }[] = await query.execute(db);

  const byCode = new Map<string, typeof rows>();
  for (const row of rows) {
    const forCode = byCode.get(row.code);
    if (forCode) {
      forCode.push(row);
    } else {
      byCode.set(row.code, [row]);
    }
  }

  for (const entry of page) {
    const designations = byCode.get(entry.code as string);
    if (!designations) {
      continue;
    }
    if (displayLanguage) {
      // Fall back to the canonical display, so a code with no translation stays in the expansion
      entry.display = designations.find((d) => d.language === displayLanguage)?.display ?? entry.display;
    }
    if (includeDesignations) {
      for (const d of designations) {
        if (d.display) {
          entry.designation = append(entry.designation, { language: d.language ?? undefined, value: d.display });
        }
      }
    }
  }
}

/**
 * Hydrate property IDs to optimize expensive DB queries.
 * @param db - Database connection
 * @param codeSystem - CodeSystem resource to hydrate
 */
export async function hydrateCodeSystemProperties(db: PgQueryable, codeSystem: WithId<CodeSystem>): Promise<void> {
  const propertyIds = await new SelectQuery('CodeSystem_Property')
    .column('id')
    .column('code')
    .where('system', '=', codeSystem.id)
    .execute(db);

  if (codeSystem.property?.length !== propertyIds.length && codeSystem.hierarchyMeaning === 'is-a') {
    // Implicit hierarchy property may be present; add it to the CodeSystem so it can be populated
    const parentProp = getParentProperty(codeSystem);
    codeSystem.property = append(codeSystem.property, parentProp);
  }
  // Populate property IDs from the database
  for (const property of codeSystem.property ?? EMPTY) {
    property.id = propertyIds.find((row) => row.code === property.code)?.id;
  }
}

export function expansionQuery(
  include: ValueSetComposeInclude,
  codeSystem: WithId<CodeSystem>,
  params?: ValueSetExpandParameters,
  strategy?: ParentFilterStrategy
): SelectQuery | undefined {
  // Canonical rows are one-per-concept, so the page window below counts concepts rather than rows
  let query: SelectQuery | undefined = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .where('system', '=', codeSystem.id)
    .where('synonymOf', '=', null);

  if (include.filter?.length) {
    query = applyValueSetFilters(query, include.filter, codeSystem, params, strategy);
  }
  if (params) {
    query = applyExpansionFilters(query, codeSystem, params);
  }
  return query;
}

function applyValueSetFilters(
  query: SelectQuery,
  filters: ValueSetComposeIncludeFilter[],
  codeSystem: WithId<CodeSystem>,
  params?: ValueSetExpandParameters,
  strategy?: ParentFilterStrategy
): SelectQuery | undefined {
  for (const condition of filters) {
    switch (condition.op) {
      case 'is-a':
      case 'descendent-of': {
        const parentProperty = getParentProperty(codeSystem);
        if (!parentProperty?.id) {
          return undefined;
        }
        const newQuery = addParentFilter(
          query,
          codeSystem,
          condition,
          parentProperty as WithId<CodeSystemProperty>,
          params,
          strategy
        );
        if (!newQuery) {
          return undefined;
        }
        query = newQuery;
        break;
      }

      case 'exists':
      case '=':
      case 'in': {
        const property = codeSystem.property?.find((p) => p.code === condition.property);
        if (!property?.id) {
          return undefined;
        }
        // The driving relation holds canonical rows only, so its own `id` is the canonical coding ID
        query = addPropertyFilter(
          query,
          condition,
          property as WithId<CodeSystemProperty>,
          new Column(query.effectiveTableName, 'id')
        );
        break;
      }

      default:
        getLogger().warn('Unknown filter type in ValueSet', { filter: condition });
        return undefined; // Unknown filter type, don't make DB query with incorrect filters
    }
  }

  return query;
}

/**
 * Strategy for resolving an `is-a`/`descendent-of` include combined with a text filter.
 * - `ancestor`: correlated `EXISTS(findAncestor …)` per trigram candidate — best for selective filters
 * - `descendant`: materialize the subtree once via `addDescendants` and filter within it,
 *   capping the worst-case cost at the subtree-materialize floor rather than scaling with candidates
 */
export type ParentFilterStrategy = 'ancestor' | 'descendant';

/**
 * Candidate-count crossover for choosing between the `ancestor` and `descendant` strategies. Tuned to the
 * representative dataset: on a ~132k-node subtree the per-candidate ancestor walk costs ~60× a per-descendant
 * enumeration step, so materializing the subtree wins once the filter matches more than ~2000 candidate codes.
 */
const CANDIDATE_THRESHOLD = 2000;

/**
 * Restricts a query of canonical rows to the concepts matching the `filter` text: an exact code match, plus (for
 * filters of at least 3 characters) a per-word `display ILIKE` substring match.
 *
 * A concept matches when *any* display it has matches — canonical display, translation, or `#synonym` row alike —
 * so the display branch has to reach designation rows and then come back to the concept. It does that by joining
 * the driving relation to a derived table of matched canonical IDs, rather than by OR-ing a subquery into the
 * `WHERE`: the join lets both branches be driven by their own index (trigram for display,
 * `Coding_system_codeLowerPattern_idx` for code) and reduces to one primary-key lookup per matching concept,
 * where a disjunction forces a scan of every row in the CodeSystem with the match set as a filter — on SNOMED,
 * ~5x slower for a two-word filter and ~25x for a selective one. The `UNION` also de-duplicates several matching
 * designation rows for one code down to a single row, so the page window stays in concept space with no
 * `DISTINCT` on the outer query.
 * @param query - The query to restrict, whose rows are canonical.
 * @param filterText - The `filter` parameter value.
 * @param systemId - ID of the CodeSystem being expanded.
 */
function applyTextFilter(query: SelectQuery, filterText: string, systemId: string): void {
  const tableName = query.effectiveTableName;

  // Below 3 characters the display-substring branch cannot use the trigram GIN index (a substring needs at least
  // one full trigram), so match the exact code only — and an exact code needs no join to find.
  if (filterText.length < 3) {
    query.whereExpr(new Condition(new Column(tableName, 'code'), '=', filterText));
    return;
  }

  const displayAlias = 'display_match';
  const displayMatches = new SelectQuery('Coding', undefined, displayAlias)
    .column(new Column(undefined, `COALESCE("${displayAlias}"."synonymOf", "${displayAlias}"."id")`, true, 'id'))
    .where(new Column(displayAlias, 'system'), '=', systemId)
    .whereExpr(
      new Conjunction(
        filterText
          .split(/\s+/g)
          .map(
            (word) =>
              new Condition(new Column(displayAlias, 'display'), 'UNACCENT_ILIKE', `%${escapeLikeString(word)}%`)
          )
      )
    );

  // Match the code by case-insensitive prefix, backed by the database index
  const codeAlias = 'code_match';
  const codeMatches = new SelectQuery('Coding', undefined, codeAlias)
    .column(new Column(codeAlias, 'id'))
    .where(new Column(codeAlias, 'system'), '=', systemId)
    .where(new Column(codeAlias, 'synonymOf'), '=', null)
    .where(new Column(codeAlias, 'code'), 'LOWER_LIKE', `${escapeLikeString(filterText)}%`);

  const matchAlias = query.getNextJoinAlias();
  query.join(
    'INNER JOIN',
    new SelectQuery('matches', new Union(displayMatches, codeMatches)).column('id'),
    matchAlias,
    new Condition(new Column(matchAlias, 'id'), '=', new Column(tableName, 'id'))
  );
}

/**
 * Counts, up to `limit`, the codes in a CodeSystem whose display/code matches the filter text.
 * Used to choose the parent-filter strategy.
 *
 * Counts rows of the same canonical-row predicate the expansion itself runs, so `LIMIT` caps *concepts* and the
 * strategy is chosen against the number of codes {@link CANDIDATE_THRESHOLD} is expressed in. Capping rows and
 * de-duplicating afterwards would instead yield a lower bound biased toward the more expensive strategy.
 * @param db - Database client.
 * @param codeSystem - The CodeSystem being expanded (with resolved id).
 * @param filterText - The `filter` parameter value.
 * @param limit - Upper bound on the count (candidates beyond this don't change the decision).
 * @returns The number of matching candidate codes, capped at `limit`.
 */
export async function countCandidatesBounded(
  db: PgQueryable,
  codeSystem: WithId<CodeSystem>,
  filterText: string,
  limit: number
): Promise<number> {
  const inner = new SelectQuery('Coding')
    .column('id')
    .where('system', '=', codeSystem.id)
    .where('synonymOf', '=', null)
    .limit(limit);
  applyTextFilter(inner, filterText, codeSystem.id);
  const countQuery = new SelectQuery('c', inner).raw('COUNT(*)::int AS "count"');
  const rows = await countQuery.execute(db);
  return rows[0]?.count ?? 0;
}

/**
 * Chooses the parent-filter strategy for an include. Only applies to a single `is-a`/`descendent-of` filter
 * combined with a text filter of at least 3 characters.
 * A bounded candidate count decides between walking ancestors (selective filter) and materializing the subtree
 * (broad filter), or undefined otherwise when the decision is not applicable.
 * @param db - Database client.
 * @param include - The ValueSet compose include being expanded.
 * @param codeSystem - The CodeSystem being expanded (with resolved id).
 * @param params - The expand parameters (notably `filter`).
 * @returns The chosen strategy, or undefined when the cost-based choice does not apply.
 */
async function chooseParentFilterStrategy(
  db: PgQueryable,
  include: ValueSetComposeInclude,
  codeSystem: WithId<CodeSystem>,
  params: ValueSetExpandParameters
): Promise<ParentFilterStrategy | undefined> {
  const filterText = params.filter;
  if (!filterText || filterText.length < 3 || include.filter?.length !== 1) {
    return undefined;
  }
  const op = include.filter[0].op;
  if (op !== 'is-a' && op !== 'descendent-of') {
    return undefined;
  }

  const count = await countCandidatesBounded(db, codeSystem, filterText, CANDIDATE_THRESHOLD + 1);
  return count > CANDIDATE_THRESHOLD ? 'descendant' : 'ancestor';
}

export function addParentFilter(
  query: SelectQuery,
  codeSystem: WithId<CodeSystem>,
  condition: ValueSetComposeIncludeFilter,
  parentProperty: WithId<CodeSystemProperty>,
  params?: ValueSetExpandParameters,
  strategy: ParentFilterStrategy = 'ancestor'
): SelectQuery | undefined {
  if (params?.filter && strategy === 'ancestor') {
    if (params.filter.length < 3) {
      return undefined; // Must specify minimum filter length to make this expensive query workable
    }

    // Seeding the walk from the canonical row only: a code's designation rows would multiply the seed set
    // without adding any ancestor the canonical row doesn't already reach
    const base = new SelectQuery('Coding', undefined, 'origin')
      .column('id')
      .column('code')
      .column('synonymOf')
      .where(new Column('origin', 'system'), '=', codeSystem.id)
      .where(new Column('origin', 'synonymOf'), '=', null)
      .where(new Column('origin', 'code'), '=', new Column('Coding', 'code'));

    // For a selective text filter, test ancestry per candidate row: the trigram-matched set is small, so a
    // correlated EXISTS(walk up to the ancestor) is cheaper than materializing the whole subtree.
    const ancestorQuery = findAncestor(base, codeSystem, parentProperty, condition.value);
    query.whereExpr(new SqlFunction('EXISTS', [ancestorQuery]));
  } else {
    // No filter, or a broad text filter over a large subtree: materialize the descendant set once
    // and let applyExpansionFilters filter within it, instead of walking ancestors for every candidate
    query = addDescendants(query, codeSystem, parentProperty, condition.value);
  }
  if (condition.op !== 'is-a') {
    query.where(new Column(query.effectiveTableName, 'code'), '!=', condition.value);
  }
  return query;
}

function applyExpansionFilters(
  query: SelectQuery | undefined,
  codeSystem: WithId<CodeSystem>,
  params: ValueSetExpandParameters
): SelectQuery | undefined {
  if (!query) {
    return undefined;
  }

  const tableAlias = query.effectiveTableName;
  if (params.filter) {
    const filterText = params.filter;
    applyTextFilter(query, filterText, codeSystem.id);
    query
      // Surface exact code match ahead of longer prefix and code-only matches, which would otherwise sort arbitrarily
      .orderByExpr(new Condition(new Column(tableAlias, 'code'), '=', filterText), true)
      // Rank over the same accent-folded text the predicate matches on, so an unaccented filter doesn't
      // score every accented candidate identically low
      .orderByExpr(
        new SqlFunction('strict_word_similarity', [
          new SqlFunction(MedplumUnaccentFn.name, [rankedDisplay(query, codeSystem, params)]),
          new SqlFunction(MedplumUnaccentFn.name, [new Parameter(filterText)]),
        ]),
        true
      );
  }

  if (params.excludeNotForUI) {
    query = addAbstractFilter(query, codeSystem);
  }

  // Canonical rows are already ordered by `(system, code)` in the index, so this is both a free deterministic
  // order for the unfiltered path and the final tiebreaker for the filtered one — without it, Postgres is free
  // to pick a different plan per OFFSET and consecutive windows can skip or repeat codes
  query.orderBy(new Column(tableAlias, 'code'));

  query.limit((params.count ?? MAX_EXPANSION_SIZE) + 1).offset(params.offset ?? 0);
  return query;
}

/**
 * The display expression to rank a text filter against. Ranking happens before `LIMIT`, so it is the one place
 * the requested-language display cannot be resolved after the page window; when `displayLanguage` is set, a
 * lateral supplies the translation so relevance is scored against the text the client will actually see.
 *
 * The lateral is keyed on `(system, code)`, not `synonymOf`, which has no index — and against the driving
 * relation's alias, which on the descendant path is the CTE rather than `Coding`.
 * @param query - The expansion query, joined in place when a translation is needed.
 * @param codeSystem - The CodeSystem being expanded.
 * @param params - The expand parameters.
 * @returns The expression holding the display text to rank on.
 */
function rankedDisplay(
  query: SelectQuery,
  codeSystem: WithId<CodeSystem>,
  params: ValueSetExpandParameters
): Expression {
  const tableAlias = query.effectiveTableName;
  if (!params.displayLanguage) {
    return new Column(tableAlias, 'display');
  }

  const translationAlias = 'translation';
  const joinAlias = query.getNextJoinAlias();
  query.join(
    'LEFT JOIN LATERAL',
    new SelectQuery('Coding', undefined, translationAlias)
      .column(new Column(translationAlias, 'display'))
      .where(new Column(translationAlias, 'system'), '=', codeSystem.id)
      .where(new Column(translationAlias, 'code'), '=', new Column(tableAlias, 'code'))
      // Cannot match a canonical row, which carries no language
      .where(new Column(translationAlias, 'language'), '=', params.displayLanguage)
      .orderBy(new Column(translationAlias, 'id'))
      .limit(1),
    joinAlias,
    new Constant('true')
  );
  return new SqlFunction('COALESCE', [new Column(joinAlias, 'display'), new Column(tableAlias, 'display')]);
}

function addAbstractFilter(query: SelectQuery, codeSystem: WithId<CodeSystem>): SelectQuery {
  const property = codeSystem.property?.find((p) => p.uri === abstractProperty);
  if (!property?.id) {
    return query; // Cannot add database filter; all found Coding rows must be considered selectable
  }

  // LEFT JOIN to check if abstract property is present
  const propertyTable = query.getNextJoinAlias();
  query.join(
    'LEFT JOIN',
    'Coding_Property',
    propertyTable,
    new Conjunction([
      // The driving relation holds canonical rows only, so its own `id` is the canonical coding ID
      new Condition(new Column(query.effectiveTableName, 'id'), '=', new Column(propertyTable, 'coding')),
      new Condition(new Column(propertyTable, 'property'), '=', property.id),
    ])
  );
  // Only return Coding rows where the property is NOT present
  query.where(new Column(propertyTable, 'value'), '=', null);

  return query;
}

/**
 * @param text - Candidate display text, in whatever form it was authored.
 * @param filter - The filter text, already passed through {@link foldForFilter}.
 * @returns True if the candidate contains the filter.
 */
function matchesTextFilter(text: string | undefined, filter: string): boolean {
  return text ? foldForFilter(text).includes(filter) : false;
}

function getDisplayText(
  concept: ValueSetComposeIncludeConcept | ValueSetExpansionContains | Coding,
  language?: string
): string | undefined {
  if (language && 'designation' in concept) {
    return concept.designation?.find((c) => c.language === language)?.value ?? concept.display;
  }
  return concept.display;
}
