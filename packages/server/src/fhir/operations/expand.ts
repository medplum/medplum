// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, append, badRequest, OperationOutcomeError } from '@medplum/core';
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
import type { Pool, PoolClient } from 'pg';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';
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

    valueSet = await findTerminologyResource<ValueSet>('ValueSet', url);
  }

  if (params.filter && !params.count) {
    params.count = 10; // Default to small page size for typeahead queries
  }
  const result = await expandValueSet(valueSet, params);

  return [allOk, buildOutputParameters(operation, result)];
}

const MAX_EXPANSION_SIZE = 1000;

export function filterIncludedConcepts(
  concepts: ValueSetComposeIncludeConcept[] | ValueSetExpansionContains[] | Coding[],
  params: ValueSetExpandParameters,
  system?: string
): ValueSetExpansionContains[] {
  const filter = params.filter?.trim().toLowerCase();
  const codings: Coding[] = flattenConcepts(concepts, { filter, system });
  if (!filter) {
    return codings;
  }
  return codings.filter((c) => c.display?.toLowerCase().includes(filter));
}

function flattenConcepts(
  concepts: ValueSetComposeIncludeConcept[] | ValueSetExpansionContains[] | Coding[],
  options?: {
    filter?: string;
    system?: string;
  }
): Coding[] {
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
    if (!filter || concept.display?.toLowerCase().includes(filter)) {
      result.push({ system, code: concept.code, display: concept.display });
    }
  }

  return result;
}

export async function expandValueSet(valueSet: ValueSet, params: ValueSetExpandParameters): Promise<ValueSet> {
  const expandedSet = await computeExpansion(valueSet, params);
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
        const includedValueSet = await findTerminologyResource<ValueSet>('ValueSet', url);
        terminologyResources[includedValueSet.url as string] = includedValueSet;

        const nestedExpansion = await computeExpansion(
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
      (await findTerminologyResource('CodeSystem', include.system));
    terminologyResources[include.system] = codeSystem;

    if (include.concept) {
      const filteredCodings = filterIncludedConcepts(include.concept, params, include.system);
      const validCodings = await validateCodings(codeSystem, filteredCodings);
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
  const db = getAuthenticatedContext().repo.getDatabaseClient(DatabaseMode.READER);
  await hydrateCodeSystemProperties(db, codeSystem);

  const query = expansionQuery(include, codeSystem, params);
  if (!query) {
    return;
  }

  const results = await query.execute(db);
  const system = codeSystem.url;
  for (const { code, display } of results) {
    expansion.push({ system, code, display });
  }
}

/**
 * Hydrate property IDs to optimize expensive DB queries.
 * @param db - Database connection
 * @param codeSystem - CodeSystem resource to hydrate
 */
export async function hydrateCodeSystemProperties(
  db: Pool | PoolClient,
  codeSystem: WithId<CodeSystem>
): Promise<void> {
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
  if (codeSystem.property?.length) {
    for (const property of codeSystem.property) {
      property.id = propertyIds.find((row) => row.code === property.code)?.id;
    }
  }
}

export function expansionQuery(
  include: ValueSetComposeInclude,
  codeSystem: WithId<CodeSystem>,
  params?: ValueSetExpandParameters
): SelectQuery | undefined {
  let query = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .column('synonymOf')
    .where('system', '=', codeSystem.id);

  if (include.filter?.length) {
    for (const condition of include.filter) {
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
            params
          );
          if (!newQuery) {
            return undefined;
          }
          query = newQuery;
          break;
        }
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
  }

  if (params) {
    query = addExpansionFilters(query, codeSystem, params);
  }
  return query;
}

export function addParentFilter(
  query: SelectQuery,
  codeSystem: WithId<CodeSystem>,
  condition: ValueSetComposeIncludeFilter,
  parentProperty: WithId<CodeSystemProperty>,
  params?: ValueSetExpandParameters
): SelectQuery | undefined {
  if (params?.filter) {
    if (params.filter.length < 3) {
      return undefined; // Must specify minimum filter length to make this expensive query workable
    }

    const base = new SelectQuery('Coding', undefined, 'origin')
      .column('id')
      .column('code')
      .column('display')
      .column('synonymOf')
      .where(new Column('origin', 'system'), '=', codeSystem.id)
      .where(new Column('origin', 'code'), '=', new Column('Coding', 'code'));
    const ancestorQuery = findAncestor(base, codeSystem, parentProperty, condition.value);
    query.whereExpr(new SqlFunction('EXISTS', [ancestorQuery]));
  } else {
    query = addDescendants(query, codeSystem, parentProperty, condition.value);
  }
  if (condition.op !== 'is-a') {
    query.where(new Column(query.effectiveTableName, 'code'), '!=', condition.value);
  }
  return query;
}

function addExpansionFilters(
  query: SelectQuery,
  codeSystem: WithId<CodeSystem>,
  params: ValueSetExpandParameters
): SelectQuery {
  if (params.filter) {
    query
      .whereExpr(
        new Disjunction([
          new Condition(new Column('Coding', 'code'), '=', params.filter),
          new Conjunction(
            params.filter
              .split(/\s+/g)
              .map((filter) => new Condition('display', 'ILIKE', `%${escapeLikeString(filter)}%`))
          ),
        ])
      )
      .orderByExpr(
        new SqlFunction('strict_word_similarity', [new Column(undefined, 'display'), new Parameter(params.filter)]),
        true
      );
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
