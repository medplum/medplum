import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import { CodeSystem, ValueSet, ValueSetComposeInclude, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { sendOutcome } from '../outcomes';
import { Column, Condition, Conjunction, SelectQuery, Expression, Disjunction, Union } from '../sql';
import { getAuthenticatedContext } from '../../context';
import { clamp, parseInputParameters, sendOutputParameters } from './utils/parameters';
import { getDatabasePool } from '../../database';
import { getOperationDefinition } from './definitions';
import { abstractProperty, addPropertyFilter, findTerminologyResource, getParentProperty } from './utils/terminology';
import { validateCoding } from './codesystemvalidatecode';

const operation = getOperationDefinition('ValueSet', 'expand');

type ValueSetExpandParameters = {
  url?: string;
  filter?: string;
  offset?: number;
  count?: number;
  excludeNotForUI?: boolean;
};

// Implements FHIR "Value Set Expansion"
// https://www.hl7.org/fhir/operation-valueset-expand.html

// Currently only supports a limited subset
// 1) The "url" parameter to identify the value set
// 2) The "filter" parameter for text search
// 3) Optional offset for pagination (default is zero for beginning)
// 4) Optional count for pagination (default is 10, can be 1-1000)

export const expandOperator = asyncWrap(async (req: Request, res: Response) => {
  const params = parseInputParameters<ValueSetExpandParameters>(operation, req);

  let url = params.url;
  if (!url) {
    sendOutcome(res, badRequest('Missing url'));
    return;
  }

  const filter = params.filter;
  if (filter !== undefined && typeof filter !== 'string') {
    sendOutcome(res, badRequest('Invalid filter'));
    return;
  }

  const pipeIndex = url.indexOf('|');
  if (pipeIndex >= 0) {
    url = url.substring(0, pipeIndex);
  }

  let valueSet = await findTerminologyResource<ValueSet>('ValueSet', url);

  let offset = 0;
  if (params.offset) {
    offset = Math.max(0, params.offset);
  }

  let count = 10;
  if (params.count) {
    count = clamp(params.count, 1, 1000);
  }

  if (shouldUseLegacyTable()) {
    const elements = await queryValueSetElements(valueSet, offset, count, filter);
    await sendOutputParameters(req, res, operation, allOk, {
      resourceType: 'ValueSet',
      url,
      expansion: {
        offset,
        contains: elements,
      },
    } as ValueSet);
  } else {
    valueSet = await expandValueSet(valueSet, params);
    await sendOutputParameters(req, res, operation, allOk, valueSet);
  }
});

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

  const client = getDatabasePool();
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

const MAX_EXPANSION_SIZE = 1001;

export async function expandValueSet(valueSet: ValueSet, params: ValueSetExpandParameters): Promise<ValueSet> {
  const expansion = valueSet.expansion;
  if (expansion?.contains?.length && !expansion.parameter && expansion.total === expansion.contains.length) {
    // Full expansion is already available, use that
    return valueSet;
  }

  // Compute expansion
  const expandedSet = [] as ValueSetExpansionContains[];
  await computeExpansion(valueSet, expandedSet, params);
  if (expandedSet.length >= MAX_EXPANSION_SIZE) {
    valueSet.expansion = {
      total: 1001,
      timestamp: new Date().toISOString(),
      contains: expandedSet.slice(0, 1000),
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
  expansion: ValueSetExpansionContains[],
  params: ValueSetExpandParameters
): Promise<void> {
  if (!valueSet.compose?.include.length) {
    throw new OperationOutcomeError(badRequest('Missing ValueSet definition', 'ValueSet.compose.include'));
  }

  const { count, filter } = params;

  const codeSystemCache: Record<string, CodeSystem> = Object.create(null);
  for (const include of valueSet.compose.include) {
    if (!include.system) {
      throw new OperationOutcomeError(
        badRequest('Missing system URL for ValueSet include', 'ValueSet.compose.include.system')
      );
    }

    const codeSystem = codeSystemCache[include.system] ?? (await findTerminologyResource('CodeSystem', include.system));
    codeSystemCache[include.system] = codeSystem;
    if (include.concept) {
      const concepts = await Promise.all(include.concept.flatMap((c) => validateCoding(codeSystem, c)));
      for (const c of concepts) {
        if (c && (!filter || c.display?.includes(filter))) {
          c.id = undefined;
          expansion.push(c);
        }
      }
    } else {
      await includeInExpansion(include, expansion, codeSystem, params);
    }

    if (expansion.length > (count ?? MAX_EXPANSION_SIZE)) {
      // Return partial expansion
      return;
    }
  }
}

async function includeInExpansion(
  include: ValueSetComposeInclude,
  expansion: ValueSetExpansionContains[],
  codeSystem: CodeSystem,
  params: ValueSetExpandParameters
): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { count, offset, filter } = params;

  let query = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .where('system', '=', codeSystem.id)
    .limit((count ?? MAX_EXPANSION_SIZE) + 1)
    .offset(offset ?? 0);
  if (filter) {
    query.where('display', '!=', null).where('display', 'TSVECTOR_ENGLISH', filterToTsvectorQuery(filter));
  }
  if (include.filter?.length) {
    for (const condition of include.filter) {
      switch (condition.op) {
        case 'is-a':
          query = addDescendants(query, codeSystem, condition.value);
          break;
        case '=':
          query = addPropertyFilter(query, condition.property, condition.value, true);
          break;
        default:
          ctx.logger.warn('Unknown filter type in ValueSet', { filter: condition });
          return; // Unknown filter type, don't make DB query with incorrect filters
      }
    }
  }

  if (params.excludeNotForUI) {
    query = addAbstractFilter(query, codeSystem);
  }

  const results = await query.execute(ctx.repo.getDatabaseClient());
  const system = codeSystem.url;
  for (const { code, display } of results) {
    expansion.push({ system, code, display });
  }
}

function addDescendants(query: SelectQuery, codeSystem: CodeSystem, parentCode: string): SelectQuery {
  const property = getParentProperty(codeSystem);

  const base = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .where('system', '=', codeSystem.id)
    .where('code', '=', parentCode);

  const propertyTable = query.getNextJoinAlias();
  query.innerJoin(
    'Coding_Property',
    propertyTable,
    new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'coding'))
  );

  const csPropertyTable = query.getNextJoinAlias();
  query.innerJoin(
    'CodeSystem_Property',
    csPropertyTable,
    new Conjunction([
      new Condition(new Column(propertyTable, 'property'), '=', new Column(csPropertyTable, 'id')),
      new Condition(new Column(csPropertyTable, 'code'), '=', property.code),
    ])
  );

  const recursiveCTE = 'cte_descendants';
  const recursiveTable = query.getNextJoinAlias();
  query.innerJoin(
    recursiveCTE,
    recursiveTable,
    new Condition(new Column(propertyTable, 'target'), '=', new Column(recursiveTable, 'id'))
  );
  const offset = query.offset_;
  query.offset(0);

  return new SelectQuery('cte_descendants')
    .column('code')
    .column('display')
    .withRecursive('cte_descendants', new Union(base, query))
    .limit(query.limit_)
    .offset(offset);
}

function addAbstractFilter(query: SelectQuery, codeSystem: CodeSystem): SelectQuery {
  const property = codeSystem.property?.find((p) => p.uri === abstractProperty);
  if (!property) {
    return query;
  }
  return addPropertyFilter(query, property.code, 'true', false);
}
