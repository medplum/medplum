// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, append, badRequest, EMPTY, isEmpty, OperationOutcomeError } from '@medplum/core';
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
  Disjunction,
  escapeLikeString,
  Parameter,
  SelectQuery,
  SqlFunction,
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
  const filter = params.filter?.trim().toLowerCase();
  return flattenConcepts(concepts, { filter, system, displayLanguage: params.displayLanguage });
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
 * least 3 characters) a per-word `display ILIKE` substring match. Below 3 characters the `display ILIKE
 * '%filter%'` branch cannot use the trigram GIN index (a substring needs at least one full trigram), so only the
 * exact code is matched.
 * @param filterText - The `filter` parameter value.
 * @param tableName - Table/alias that the `code` column belongs to (`Coding` or the descendant CTE).
 * @returns The WHERE expression selecting rows that match the filter text.
 */
function buildTextFilterPredicate(filterText: string, tableName: string): Expression {
  const codeCondition = new Condition(new Column(tableName, 'code'), '=', filterText);
  if (filterText.length < 3) {
    return codeCondition;
  }
  return new Disjunction([
    codeCondition,
    new Conjunction(
      filterText.split(/\s+/g).map((word) => new Condition('display', 'ILIKE', `%${escapeLikeString(word)}%`))
    ),
  ]);
}

/**
 * Counts, up to `limit`, the codes in a CodeSystem whose display/code matches the filter text.
 * Used to choose the parent-filter strategy.
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
    .whereExpr(buildTextFilterPredicate(filterText, 'Coding'))
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

  if (params.filter) {
    query
      .whereExpr(buildTextFilterPredicate(params.filter, query.effectiveTableName))
      .orderByExpr(
        new SqlFunction('strict_word_similarity', [new Column(undefined, 'display'), new Parameter(params.filter)]),
        true
      );
  }

  if (params.displayLanguage) {
    query.where('language', '=', params.displayLanguage);
  } else if (!params.includeDesignations) {
    // Include translations of codes only by request
    query.where('language', '=', null);
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

function matchesTextFilter(text: string | undefined, filter: string): boolean {
  return text ? text.toLowerCase().includes(filter) : false;
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
