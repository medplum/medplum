import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  CodeSystem,
  Coding,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeFilter,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext, getRequestContext } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { Column, Condition, Conjunction, Disjunction, Exists, Expression, SelectQuery } from '../sql';
import { validateCodings } from './codesystemvalidatecode';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, clamp, parseInputParameters } from './utils/parameters';
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

// Implements FHIR "Value Set Expansion"
// https://www.hl7.org/fhir/operation-valueset-expand.html

// Currently only supports a limited subset
// 1) The "url" parameter to identify the value set
// 2) The "filter" parameter for text search
// 3) Optional offset for pagination (default is zero for beginning)
// 4) Optional count for pagination (default is 10, can be 1-1000)

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

  let offset = 0;
  if (params.offset) {
    offset = Math.max(0, params.offset);
  }

  let result: ValueSet;
  if (shouldUseLegacyTable()) {
    let count = 10;
    if (params.count) {
      count = clamp(params.count, 1, 1000);
    }

    const elements = await queryValueSetElements(valueSet, offset, count, filter);
    result = {
      resourceType: 'ValueSet',
      url: valueSet.url,
      expansion: {
        offset,
        contains: elements,
      },
    } as ValueSet;
  } else {
    if (params.filter && !params.count) {
      params.count = 10; // Default to small page size for typeahead queries
    }
    result = await expandValueSet(valueSet, params);
  }

  return [allOk, buildOutputParameters(operation, result)];
}

function shouldUseLegacyTable(): boolean {
  const ctx = getAuthenticatedContext();
  return !ctx.project.features?.includes('terminology');
}

async function queryValueSetElements(
  valueSet: ValueSet,
  offset: number,
  count: number,
  filter?: string
): Promise<ValueSetExpansionContains[]> {
  // Build a collection of all systems to include
  const systemExpressions = buildValueSetSystems(valueSet);
  if (systemExpressions.length === 0) {
    throw new OperationOutcomeError(badRequest('No systems found'));
  }

  const client = getDatabasePool(DatabaseMode.READER);
  const query = new SelectQuery('ValueSetElement')
    .distinctOn('system')
    .distinctOn('code')
    .distinctOn('display')
    .column('system')
    .column('code')
    .column('display')
    .whereExpr(new Disjunction(systemExpressions))
    .orderBy('display')
    .offset(offset)
    .limit(count);

  const filterQuery = filterToTsvectorQuery(filter);
  if (filterQuery) {
    query.where('display', 'TSVECTOR_ENGLISH', filterQuery);
  }

  const rows = await query.execute(client);
  const elements = rows.map((row) => ({
    system: row.system,
    code: row.code,
    display: row.display ?? undefined, // if display is NULL, we want to filter it out before sending this to the client
  })) as ValueSetExpansionContains[];

  return elements;
}

function filterToTsvectorQuery(filter: string | undefined): string | undefined {
  if (!filter) {
    return undefined;
  }

  const noPunctuation = filter.replace(/[^\p{Letter}\p{Number}]/gu, ' ').trim();
  if (!noPunctuation) {
    return undefined;
  }

  return noPunctuation
    .split(/\s+/)
    .map((token) => token + ':*')
    .join(' & ');
}

function buildValueSetSystems(valueSet: ValueSet): Expression[] {
  const result: Expression[] = [];
  if (valueSet.compose?.include) {
    for (const include of valueSet.compose.include) {
      processInclude(result, include);
    }
  } else if (valueSet.expansion?.contains) {
    processExpansion(result, valueSet.expansion.contains);
  }
  return result;
}

function processInclude(systemExpressions: Expression[], include: ValueSetComposeInclude): void {
  if (!include.system) {
    return;
  }

  const systemExpression = new Condition('system', '=', include.system);

  if (include.concept) {
    const codeExpressions: Expression[] = [];
    for (const concept of include.concept) {
      codeExpressions.push(new Condition('code', '=', concept.code));
    }
    systemExpressions.push(new Conjunction([systemExpression, new Disjunction(codeExpressions)]));
  } else {
    systemExpressions.push(systemExpression);
  }
}

function processExpansion(systemExpressions: Expression[], expansionContains: ValueSetExpansionContains[]): void {
  if (!expansionContains) {
    return;
  }

  const systemToConcepts: Record<string, ValueSetExpansionContains[]> = Object.create(null);

  for (const code of expansionContains) {
    if (!code.system) {
      continue;
    }
    if (!(code.system in systemToConcepts)) {
      systemToConcepts[code.system] = [];
    }
    systemToConcepts[code.system].push(code);
  }

  for (const [system, concepts] of Object.entries(systemToConcepts)) {
    const systemExpression = new Condition('system', '=', system);
    const codeExpressions: Expression[] = [];
    for (const concept of concepts) {
      codeExpressions.push(new Condition('code', '=', concept.code));
    }
    systemExpressions.push(new Conjunction([systemExpression, new Disjunction(codeExpressions)]));
  }
}

const MAX_EXPANSION_SIZE = 1000;

export function filterCodings(codings: Coding[], params: ValueSetExpandParameters): Coding[] {
  const filter = params.filter?.trim().toLowerCase();
  if (!filter) {
    return codings;
  }
  return codings.filter((c) => c.display?.toLowerCase().includes(filter));
}

export async function expandValueSet(valueSet: ValueSet, params: ValueSetExpandParameters): Promise<ValueSet> {
  let expandedSet: ValueSetExpansionContains[];

  const expansion = valueSet.expansion;
  if (expansion?.contains?.length && !expansion.parameter && expansion.total === expansion.contains.length) {
    // Full expansion is already available, use that
    expandedSet = filterCodings(expansion.contains, params);
  } else {
    expandedSet = await computeExpansion(valueSet, params);
  }
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
  terminologyResources: Record<string, CodeSystem | ValueSet> = Object.create(null)
): Promise<ValueSetExpansionContains[]> {
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
      (terminologyResources[include.system] as CodeSystem) ??
      (await findTerminologyResource('CodeSystem', include.system));
    terminologyResources[include.system] = codeSystem;

    if (include.concept) {
      const filteredCodings = filterCodings(include.concept, params);
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

const hierarchyOps: ValueSetComposeIncludeFilter['op'][] = ['is-a', 'is-not-a', 'descendent-of'];

async function includeInExpansion(
  include: ValueSetComposeInclude,
  expansion: ValueSetExpansionContains[],
  codeSystem: CodeSystem,
  params: ValueSetExpandParameters
): Promise<void> {
  const db = getAuthenticatedContext().repo.getDatabaseClient(DatabaseMode.READER);

  const hierarchyFilter = include.filter?.find((f) => hierarchyOps.includes(f.op));
  if (hierarchyFilter) {
    // Hydrate parent property ID to optimize expensive DB queries for hierarchy expansion
    const parentProp = getParentProperty(codeSystem);
    const propId = (
      await new SelectQuery('CodeSystem_Property')
        .column('id')
        .where('system', '=', codeSystem.id)
        .where('code', '=', parentProp.code)
        .execute(db)
    )[0]?.id;
    if (propId) {
      parentProp.id = propId;
      codeSystem.property?.unshift?.(parentProp);
    }
  }

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

export function expansionQuery(
  include: ValueSetComposeInclude,
  codeSystem: CodeSystem,
  params?: ValueSetExpandParameters
): SelectQuery | undefined {
  const ctx = getRequestContext();
  let query = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .where('system', '=', codeSystem.id);

  if (include.filter?.length) {
    for (const condition of include.filter) {
      switch (condition.op) {
        case 'is-a':
        case 'descendent-of':
          if (params?.filter) {
            const base = new SelectQuery('Coding', undefined, 'origin')
              .column('id')
              .column('code')
              .column('display')
              .where(new Column('origin', 'system'), '=', codeSystem.id)
              .where(new Column('origin', 'code'), '=', new Column('Coding', 'code'));
            const ancestorQuery = findAncestor(base, codeSystem, condition.value);
            query.whereExpr(new Exists(ancestorQuery));
          } else {
            query = addDescendants(query, codeSystem, condition.value);
          }
          if (condition.op !== 'is-a') {
            query.where('code', '!=', condition.value);
          }
          break;
        case '=':
          query = addPropertyFilter(query, condition.property, condition.value, true);
          break;
        default:
          ctx.logger.warn('Unknown filter type in ValueSet', { filter: condition });
          return undefined; // Unknown filter type, don't make DB query with incorrect filters
      }
    }
  }

  if (params) {
    query = addExpansionFilters(query, params);
  }
  return query;
}

function addExpansionFilters(query: SelectQuery, params: ValueSetExpandParameters): SelectQuery {
  if (params.filter) {
    query.where('display', '!=', null).where('display', 'TSVECTOR_ENGLISH', filterToTsvectorQuery(params.filter));
  }
  if (params.excludeNotForUI) {
    query = addAbstractFilter(query);
  }

  query.limit((params.count ?? MAX_EXPANSION_SIZE) + 1).offset(params.offset ?? 0);
  return query;
}

function addAbstractFilter(query: SelectQuery): SelectQuery {
  const propertyTable = query.getNextJoinAlias();
  query.leftJoin(
    'Coding_Property',
    propertyTable,
    new Conjunction([
      new Condition(new Column(query.tableName, 'id'), '=', new Column(propertyTable, 'coding')),
      new Condition(new Column(propertyTable, 'value'), '=', 'true'),
    ])
  );
  query.where(new Column(propertyTable, 'value'), '=', null);

  const codeSystemProperty = query.getNextJoinAlias();
  query.leftJoin(
    'CodeSystem_Property',
    codeSystemProperty,
    new Conjunction([
      new Condition(new Column(codeSystemProperty, 'id'), '=', new Column(propertyTable, 'property')),
      new Condition(new Column(codeSystemProperty, 'uri'), '=', abstractProperty),
    ])
  );

  return query;
}
