// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, append, badRequest, EMPTY, isEmpty, OperationOutcomeError } from '@medplum/core';
import type { FhirRepository, FhirRequest, FhirResponse, FhirRouteOptions, FhirRouter } from '@medplum/fhir-router';
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
import { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';
import { foldText } from '../../util/text';
import type { Repository } from '../repo';
import { repoAccess } from '../repository/access-tracker';
import type { Expression, PgQueryable } from '../sql';
import {
  Column,
  Condition,
  Conjunction,
  Constant,
  Disjunction,
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
 * @param _repo - The current user FHIR repository.
 * @param _router - The router for router options.
 * @param options - Additional route options.
 * @returns The server response.
 */
export async function expandOperator(
  req: FhirRequest,
  _repo: FhirRepository,
  _router: FhirRouter,
  options?: FhirRouteOptions
): Promise<FhirResponse> {
  const params = parseInputParameters<ValueSetExpandParameters>(operation, req);
  const filter = params.filter;
  if (filter !== undefined && typeof filter !== 'string') {
    return [badRequest('Invalid filter')];
  }
  if (filter?.includes('\0')) {
    throw new OperationOutcomeError(badRequest('Filter value cannot contain null bytes'));
  }
  if (filter && filter.trim().split(/\s+/g).length > MAX_FILTER_TOKENS) {
    return [badRequest(`Filter value cannot contain more than ${MAX_FILTER_TOKENS} tokens`)];
  }

  const repo = getAuthenticatedContext().repo;
  if (!options?.batch) {
    repo.setMode(DatabaseMode.READER);
  }

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

function flattenConcepts(
  concepts: ValueSetComposeIncludeConcept[] | ValueSetExpansionContains[] | Coding[],
  options?: {
    filter?: string;
    system?: string;
    displayLanguage?: string;
    dropUntranslated?: boolean;
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
    if (!display && options?.displayLanguage && options?.dropUntranslated) {
      continue;
    }
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
    return flattenConcepts(preExpansion.contains, {
      filter: normalizeTextFilter(params.filter),
      displayLanguage: params.displayLanguage,
      dropUntranslated: true,
    });
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
      // Under displayLanguage, an enumerated concept's display is resolved from the CodeSystem by
      // validateCodings below, so the text filter has nothing to match against until after that
      const filter = normalizeTextFilter(params.filter);
      const deferredFilter = params.displayLanguage ? filter : undefined;
      const codings = flattenConcepts(include.concept, {
        system: include.system,
        displayLanguage: params.displayLanguage,
        filter: deferredFilter ? undefined : filter,
      });
      for (const c of await validateCodings(codeSystem, codings, params)) {
        if (c && (!deferredFilter || matchesTextFilter(c.display, deferredFilter))) {
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
  addExpansionItems(results as ExpansionRow[], expansion, codeSystem);
}

interface ExpansionRow {
  code: string;
  display: string | null;
  synonymOf: string | null;
  language: string | null;
}

/**
 * Adds rows from the database to the computed expansion, deduplicating/collecting synonyms of the same code
 * together into one entry.
 * @param rows - The database rows containing codes and display strings.
 * @param expansion - The expansion currently being generated.
 * @param codeSystem - The CodeSystem from which the codes are drawn.
 */
export function addExpansionItems(
  rows: ExpansionRow[],
  expansion: ValueSetExpansionContains[],
  codeSystem: WithId<CodeSystem>
): void {
  const system = codeSystem.url;
  for (const { code, display, synonymOf, language } of rows) {
    const ex = expansion.find((o) => o.code === code);
    if (ex) {
      if (isEmpty(synonymOf)) {
        // Incoming display string is the primary, replacing the one currently in the expansion
        if (ex.display) {
          ex.designation = append(ex.designation, { language: codeSystem.language, value: ex.display });
        }
        ex.display = display ?? undefined;
      } else if (display) {
        // Incoming display string is a synonym for the code already in the expansion
        ex.designation = append(ex.designation, { language: language ?? undefined, value: display });
      }
    } else {
      // New code being added to the expansion
      expansion.push({ system, code, display: display ?? undefined });
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
  let query: SelectQuery | undefined = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .column('synonymOf')
    .column('language')
    .where('system', '=', codeSystem.id);

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
        query = addPropertyFilter(query, condition, property as WithId<CodeSystemProperty>);
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
 * Builds the text-filter predicate used by `$expand` filtering: an exact code match, plus (for filters of at
 * least 3 characters) a per-word accent-insensitive `display` substring match. Below 3 characters the display
 * branch cannot use the trigram GIN index, so only the exact code is matched.
 * @param codeSystem - The CodeSystem being expanded (with resolved id).
 * @param filterText - The `filter` parameter value.
 * @param tableName - Table/alias that the `code` column belongs to (`Coding` or the descendant CTE).
 * @param displayLanguage - The requested display language, if any.
 * @returns The WHERE expression selecting rows that match the filter text.
 */
function buildFilterPredicate(
  codeSystem: WithId<CodeSystem>,
  filterText: string,
  tableName: string,
  displayLanguage?: string
): Expression {
  // Below 3 characters the display-substring branch cannot use the trigram GIN index
  // (a substring needs at least one full trigram), so match on the code alone.
  const matchDisplay = filterText.length >= 3;

  // Restrict the `code` branch to canonical rows: synonyms for the same code are redundant. This scoping lets the planner
  // use the partial `(system, lower(code)) WHERE "synonymOf" IS NULL` index, keeping the `code` branch of the query plan
  // well-indexed. The `display` branch intentionally still matches synonym rows, so alternate terms remain searchable.
  if (!displayLanguage) {
    const codeCondition = new Conjunction([
      buildCodeMatch(filterText, tableName),
      new Condition(new Column(tableName, 'synonymOf'), '=', null),
    ]);
    return matchDisplay ? new Disjunction([codeCondition, buildDisplayMatch(filterText, tableName)]) : codeCondition;
  }

  // The display to match against lives on the translation rows, which the canonical-row anchor in
  // applyExpansionFilters excludes, so collect matching codes in a subquery and semi-join the outer query onto it
  const codeArm = new SelectQuery('Coding')
    .column('code')
    .where('system', '=', codeSystem.id)
    .where('synonymOf', '=', null)
    .whereExpr(buildCodeMatch(filterText, 'Coding'));
  let candidates: Expression = codeArm;
  if (matchDisplay) {
    const displayArm = new SelectQuery('Coding')
      .column('code')
      .where('system', '=', codeSystem.id)
      .where('language', '=', displayLanguage)
      .whereExpr(buildDisplayMatch(filterText, 'Coding'));
    // UNION ALL: the semi-join below makes duplicate candidate codes irrelevant, so skip the dedup pass
    candidates = new Union(codeArm, displayArm).all();
  }
  return new Condition(new Column(tableName, 'code'), 'IN_SUBQUERY', candidates);
}

function buildCodeMatch(filterText: string, tableName: string): Expression {
  return filterText.length >= 3
    ? new Condition(new Column(tableName, 'code'), 'LOWER_LIKE', `${escapeLikeString(filterText)}%`)
    : new Condition(new Column(tableName, 'code'), '=', filterText);
}

function buildDisplayMatch(filterText: string, tableName: string): Expression {
  return new Conjunction(
    filterText
      .split(/\s+/g)
      .map((word) => new Condition(new Column(tableName, 'display'), 'UNACCENT_ILIKE', `%${escapeLikeString(word)}%`))
  );
}

/**
 * Anchors the query on canonical rows and attaches each code's translation in the requested language, replacing
 * the projected display with the translated one. Codes without a translation drop out of the expansion, since the
 * join is an inner one.
 * @param query - The expansion query, projecting the columns of `ExpansionRow`.
 * @param codeSystem - The CodeSystem being expanded (with resolved id).
 * @param displayLanguage - The requested display language.
 * @returns The column holding the translated display, for use in ordering.
 */
function joinTranslation(query: SelectQuery, codeSystem: WithId<CodeSystem>, displayLanguage: string): Column {
  // Staying anchored on canonical rows keeps the property and hierarchy filters working against a single row per code
  const anchorAlias = query.effectiveTableName;
  query.where(new Column(anchorAlias, 'synonymOf'), '=', null);

  const innerAlias = 'translation';
  const translation = new SelectQuery('Coding', undefined, innerAlias)
    .column(new Column(innerAlias, 'display'))
    .column(new Column(innerAlias, 'language'))
    .where(new Column(innerAlias, 'system'), '=', codeSystem.id)
    .where(new Column(innerAlias, 'code'), '=', new Column(anchorAlias, 'code'))
    .where(new Column(innerAlias, 'language'), '=', displayLanguage)
    .orderBy(new Column(innerAlias, 'id'))
    .limit(1);

  const translationAlias = query.getNextJoinAlias();
  query.join('INNER JOIN LATERAL', translation, translationAlias, new Constant('true'));

  const displayColumn = new Column(translationAlias, 'display');
  query
    .clearColumns() // Replace rather than append: the descendant CTE projects its own display/language columns
    .column(new Column(anchorAlias, 'id'))
    .column(new Column(anchorAlias, 'code'))
    .column(displayColumn)
    .column(new Column(translationAlias, 'language'))
    .column(new Column(anchorAlias, 'synonymOf')); // Always NULL, per the canonical-row anchor above
  return displayColumn;
}

/**
 * Counts, up to `limit`, the codes in a CodeSystem whose display/code matches the filter text.
 * Used to choose the parent-filter strategy.
 * @param db - Database client.
 * @param codeSystem - The CodeSystem being expanded (with resolved id).
 * @param filterText - The `filter` parameter value.
 * @param limit - Upper bound on the count (candidates beyond this don't change the decision).
 * @param displayLanguage - The requested display language, if any.
 * @returns The number of matching candidate codes, capped at `limit`.
 */
export async function countCandidatesBounded(
  db: PgQueryable,
  codeSystem: WithId<CodeSystem>,
  filterText: string,
  limit: number,
  displayLanguage?: string
): Promise<number> {
  const inner = new SelectQuery('Coding')
    .column('id')
    .where('system', '=', codeSystem.id)
    .where('synonymOf', '=', null)
    .whereExpr(buildFilterPredicate(codeSystem, filterText, 'Coding', displayLanguage))
    .limit(limit);
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

  const count = await countCandidatesBounded(
    db,
    codeSystem,
    filterText,
    CANDIDATE_THRESHOLD + 1,
    params.displayLanguage
  );
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

    const base = new SelectQuery('Coding', undefined, 'origin')
      .column('id')
      .column('code')
      .column('display')
      .column('synonymOf')
      .column('language')
      .where(new Column('origin', 'system'), '=', codeSystem.id)
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
  const displayColumn = params.displayLanguage
    ? joinTranslation(query, codeSystem, params.displayLanguage)
    : new Column(tableAlias, 'display');

  if (!params.displayLanguage && !params.includeDesignations) {
    // Include translations of codes only by request
    query.where('language', '=', null);
  }

  if (params.filter) {
    const filterText = params.filter;
    query
      .whereExpr(buildFilterPredicate(codeSystem, filterText, tableAlias, params.displayLanguage))
      // Surface exact code match ahead of longer prefix and code-only matches, which would otherwise sort arbitrarily
      .orderByExpr(new Condition(new Column(tableAlias, 'code'), '=', filterText), true)
      .orderByExpr(
        new SqlFunction('strict_word_similarity', [unaccent(displayColumn), unaccent(new Parameter(filterText))]),
        true
      )
      // Final tiebreaker so the overall order is deterministic
      .orderBy(new Column(tableAlias, 'code'));
  }

  if (params.excludeNotForUI) {
    query = addAbstractFilter(query, codeSystem);
  }

  query.limit((params.count ?? MAX_EXPANSION_SIZE) + 1).offset(params.offset ?? 0);
  return query;
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
      new Condition(new Column(query.effectiveTableName, 'id'), '=', new Column(propertyTable, 'coding')),
      new Condition(new Column(propertyTable, 'property'), '=', property.id),
    ])
  );
  // Only return Coding rows where the property is NOT present
  query.where(new Column(propertyTable, 'value'), '=', null);

  return query;
}

function unaccent(expr: Expression): Expression {
  return new SqlFunction(MedplumUnaccentFn.name, [expr]);
}

/**
 * Folds the `filter` parameter for in-memory matching (enumerated concepts and stored expansions), so that it
 * approximates the accent-insensitive `medplum_unaccent` comparison the DB-backed filter performs. See
 * {@link foldText} for the characters where the two diverge.
 * @param filter - The `filter` parameter value.
 * @returns The folded filter text, or undefined when the filter is absent or blank.
 */
function normalizeTextFilter(filter: string | undefined): string | undefined {
  const trimmed = filter?.trim();
  return trimmed ? foldText(trimmed) : undefined;
}

function matchesTextFilter(text: string | undefined, filter: string): boolean {
  return text ? foldText(text).includes(filter) : false;
}

function getDisplayText(
  concept: ValueSetComposeIncludeConcept | ValueSetExpansionContains | Coding,
  language?: string
): string | undefined {
  if (language) {
    return (concept as ValueSetExpansionContains).designation?.find((d) => d.language === language)?.value;
  }
  return concept.display;
}
