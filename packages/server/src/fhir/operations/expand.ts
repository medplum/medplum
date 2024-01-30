import { badRequest, OperationOutcomeError, Operator, Operator as SearchOperator } from '@medplum/core';
import {
  CodeSystem,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeFilter,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getDatabasePool } from '../../database';
import { sendOutcome } from '../outcomes';
import { systemRepo } from '../repo';
import { Column, Condition, Conjunction, Disjunction, Expression, SelectQuery } from '../sql';
import { getAuthenticatedContext } from '../../context';
import { parentProperty } from './codesystemimport';

// Implements FHIR "Value Set Expansion"
// https://www.hl7.org/fhir/operation-valueset-expand.html

// Currently only supports a limited subset
// 1) The "url" parameter to identify the value set
// 2) The "filter" parameter for text search
// 3) Optional offset for pagination (default is zero for beginning)
// 4) Optional count for pagination (default is 10, can be 1-20)

export const expandOperator = asyncWrap(async (req: Request, res: Response) => {
  let url = req.query.url as string | undefined;
  if (typeof url !== 'string') {
    sendOutcome(res, badRequest('Missing url'));
    return;
  }

  const filter = req.query.filter;
  if (filter !== undefined && typeof filter !== 'string') {
    sendOutcome(res, badRequest('Invalid filter'));
    return;
  }

  const pipeIndex = url.indexOf('|');
  if (pipeIndex >= 0) {
    url = url.substring(0, pipeIndex);
  }

  // First, get the ValueSet resource
  const valueSet = await getValueSetByUrl(url);
  if (!valueSet) {
    sendOutcome(res, badRequest('ValueSet not found'));
    return;
  }

  // Build a collection of all systems to include
  const systemExpressions = buildValueSetSystems(valueSet);
  if (systemExpressions.length === 0) {
    sendOutcome(res, badRequest('No systems found'));
    return;
  }

  let offset = 0;
  if (req.query.offset) {
    offset = Math.max(0, parseInt(req.query.offset as string, 10));
  }

  let count = 10;
  if (req.query.count) {
    count = Math.max(1, Math.min(20, parseInt(req.query.count as string, 10)));
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
  }));

  res.status(200).json({
    resourceType: 'ValueSet',
    url,
    expansion: {
      offset,
      contains: elements,
    },
  } as ValueSet);
});

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

function getValueSetByUrl(url: string): Promise<ValueSet | undefined> {
  return systemRepo.searchOne<ValueSet>({
    resourceType: 'ValueSet',
    filters: [{ code: 'url', operator: SearchOperator.EQUALS, value: url }],
  });
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

  const systemExpression = new Condition('system', '=', include.system as string);

  if (include.concept) {
    const codeExpressions: Expression[] = [];
    for (const concept of include.concept) {
      codeExpressions.push(new Condition('code', '=', concept.code as string));
    }
    systemExpressions.push(new Conjunction([systemExpression, new Disjunction(codeExpressions)]));
  } else {
    systemExpressions.push(systemExpression);
  }
}

async function expandValueSet(valueSet: ValueSet): Promise<ValueSet> {
  const expansion = valueSet.expansion;
  if (expansion?.contains?.length && !expansion.parameter) {
    if (expansion.total && expansion.total > expansion.contains.length) {
      // Partial expansion, needs to be recomputed
    }

    // Full expansion is already available, use that
    return valueSet;
  }

  // Compute expansion
  const expandedSet = [] as ValueSetExpansionContains[];
  await computeExpansion(valueSet, expandedSet);
}

const MAX_EXPANSION_SIZE = 1001;

async function computeExpansion(valueSet: ValueSet, expansion: ValueSetExpansionContains[]): Promise<void> {
  if (!valueSet.compose?.include.length) {
    throw new OperationOutcomeError(badRequest('Missing ValueSet definition', 'ValueSet.compose.include'));
  }

  const repo = getAuthenticatedContext().repo;
  for (const include of valueSet.compose.include) {
    if (include.valueSet?.length) {
      // for (const valueSetUrl of include.valueSet) {
      //   const includedValueSet = await repo.searchOne<ValueSet>({
      //     resourceType: 'ValueSet',
      //     filters: [{ code: 'url', operator: Operator.EQUALS, value: valueSetUrl }],
      //   });
      //   if (!includedValueSet) {
      //     throw new OperationOutcomeError(badRequest('Included ValueSet not found: ' + valueSetUrl));
      //   }

      //   const nestedExpansion = await expandValueSet(includedValueSet);
      // }
      throw new OperationOutcomeError(
        badRequest('Recursive ValueSet expansion is not supported', 'ValueSet.compose.include.valueSet')
      );
    }

    if (include.system) {
      const codeSystem = await repo.searchOne<CodeSystem>({
        resourceType: 'CodeSystem',
        filters: [{ code: 'url', operator: Operator.EQUALS, value: include.system }],
      });
      if (!codeSystem) {
        throw new OperationOutcomeError(
          badRequest(`Code system ${include.system} not found`, 'ValueSet.compose.include.system')
        );
      }

      let query = new SelectQuery('Coding')
        .column('code')
        .column('display')
        .where('system', '=', codeSystem.id)
        .limit(MAX_EXPANSION_SIZE);
      query = addFilters(include.filter, query, codeSystem);
      const results = await query.execute(repo.getDatabaseClient());
      if (results.length === MAX_EXPANSION_SIZE) {
        // Return partial expansion
      }

      expansion.push(
        ...(results.map((r) => ({
          code: r.code,
          display: r.display,
          system: codeSystem.url,
        })) as ValueSetExpansionContains[])
      );
      if (expansion.length === MAX_EXPANSION_SIZE) {
        // Return partial expansion
      }
    }
  }
}

function addFilters(
  filters: ValueSetComposeIncludeFilter[] | undefined,
  query: SelectQuery,
  codeSystem: CodeSystem
): SelectQuery {
  if (!filters) {
    return query;
  }

  for (const filter of filters) {
    if (filter.op === 'is-a' || filter.op === 'is-not-a') {
      if (codeSystem.hierarchyMeaning !== 'is-a') {
        throw new OperationOutcomeError(
          badRequest(
            `Invalid filter: CodeSystem ${codeSystem.url} does not have an is-a hierarchy`,
            'ValueSet.compose.include.filter'
          )
        );
      }
      const properties = codeSystem.property?.filter((p) => p.uri === parentProperty).map((p) => p.code);

      const propertyTable = query.getNextJoinAlias();
      query.innerJoin(
        'Coding_Property',
        propertyTable,
        new Conjunction([new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'coding'))])
      );

      const csPropertyTable = query.getNextJoinAlias();
      query.innerJoin(
        'CodeSystem_Property',
        csPropertyTable,
        new Conjunction([
          new Condition(new Column(propertyTable, 'property'), '=', new Column(csPropertyTable, 'id')),
          new Condition(new Column(csPropertyTable, 'code'), '=', properties),
        ])
      );

      const targetTable = query.getNextJoinAlias();
      query.innerJoin(
        'Coding',
        targetTable,
        new Conjunction([
          new Condition(new Column(propertyTable, 'target'), '=', new Column(targetTable, 'id')),
          new Condition(new Column(targetTable, 'code'), '=', filter.value),
        ])
      );
    }
  }

  return query;
}
