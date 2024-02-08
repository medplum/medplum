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
import { sendOutcome } from '../outcomes';
import { getSystemRepo } from '../repo';
import { Column, Condition, Conjunction, SelectQuery, Expression, Disjunction } from '../sql';
import { getAuthenticatedContext } from '../../context';
import { parentProperty } from './codesystemimport';
import { clamp } from './utils/parameters';
import { validateCode } from './codesystemvalidatecode';
import { getDatabasePool } from '../../database';

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
  let valueSet = await getValueSetByUrl(url);
  if (!valueSet) {
    sendOutcome(res, badRequest('ValueSet not found'));
    return;
  }

  let offset = 0;
  if (req.query.offset) {
    offset = Math.max(0, parseInt(req.query.offset as string, 10));
  }

  let count = 10;
  if (req.query.count) {
    count = clamp(parseInt(req.query.count as string, 10), 1, 1000);
  }

  if (shouldUseLegacyTable()) {
    const elements = await queryValueSetElements(valueSet, offset, count, filter);
    res.status(200).json({
      resourceType: 'ValueSet',
      url,
      expansion: {
        offset,
        contains: elements,
      },
    } as ValueSet);
  } else {
    valueSet = await expandValueSet(valueSet, offset, count, filter);
    res.status(200).json(valueSet);
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

function getValueSetByUrl(url: string): Promise<ValueSet | undefined> {
  const systemRepo = getSystemRepo();
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

const MAX_EXPANSION_SIZE = 1001;

export async function expandValueSet(
  valueSet: ValueSet,
  offset: number,
  count: number,
  filter?: string
): Promise<ValueSet> {
  const expansion = valueSet.expansion;
  if (expansion?.contains?.length && !expansion.parameter && expansion.total === expansion.contains.length) {
    // Full expansion is already available, use that
    return valueSet;
  }

  // Compute expansion
  const expandedSet = [] as ValueSetExpansionContains[];
  await computeExpansion(valueSet, expandedSet, offset, count, filter);
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
      contains: expandedSet.slice(0, count),
    };
  }
  return valueSet;
}

async function computeExpansion(
  valueSet: ValueSet,
  expansion: ValueSetExpansionContains[],
  offset: number,
  count: number,
  filter?: string
): Promise<void> {
  if (!valueSet.compose?.include.length) {
    throw new OperationOutcomeError(badRequest('Missing ValueSet definition', 'ValueSet.compose.include'));
  }

  const repo = getAuthenticatedContext().repo;
  for (const include of valueSet.compose.include) {
    if (include.valueSet?.length) {
      throw new OperationOutcomeError(
        badRequest('Recursive ValueSet expansion is not supported', 'ValueSet.compose.include.valueSet')
      );
    }

    if (include.system && !include.concept) {
      const codeSystems = await repo.searchResources<CodeSystem>({
        resourceType: 'CodeSystem',
        filters: [{ code: 'url', operator: Operator.EQUALS, value: include.system }],
        sortRules: [
          // Select highest version (by lexical sort -- no version is assumed to be "current")
          { code: 'version', descending: true },
          // Break ties by selecting more recently-updated resource (lexically -- no date is assumed to be current)
          { code: 'date', descending: true },
        ],
      });

      let codeSystem: CodeSystem;
      if (!codeSystems.length) {
        throw new OperationOutcomeError(
          badRequest(`Code system ${include.system} not found`, 'ValueSet.compose.include.system')
        );
      } else if (codeSystems.length === 1) {
        codeSystem = codeSystems[0];
      } else {
        codeSystem = codeSystems.sort((a: CodeSystem, b: CodeSystem) => {
          // Select the non-base FHIR versions of resources before the base FHIR ones
          // This is kind of a kludge, but is required to break ties because some CodeSystems (including SNOMED)
          // don't have a version and the base spec version doesn't include a date (and so is always considered current)
          if (a.extension?.some((e) => e.url === 'http://hl7.org/fhir/StructureDefinition/structuredefinition-wg')) {
            return 1;
          } else if (
            b.extension?.some((e) => e.url === 'http://hl7.org/fhir/StructureDefinition/structuredefinition-wg')
          ) {
            return -1;
          }
          return 0;
        })[0];
      }

      let query = new SelectQuery('Coding')
        .column('code')
        .column('display')
        .where('system', '=', codeSystem.id)
        .limit(count + 1)
        .offset(offset)
        .orderBy('id');
      if (filter) {
        query.where('display', 'TSVECTOR_ENGLISH', filterToTsvectorQuery(filter));
      }
      query = addFilters(include.filter, query, codeSystem);
      const results = await query.execute(repo.getDatabaseClient());
      expansion.push(
        ...(results.map((r) => ({
          code: r.code,
          display: r.display,
          system: codeSystem.url,
        })) as ValueSetExpansionContains[])
      );
    } else if (include.system && include.concept) {
      const concepts = await Promise.all(
        include.concept.flatMap(async (c) =>
          validateCode(include.system as string, c.code)
        ) as ValueSetExpansionContains[]
      );
      expansion.push(...(filter ? concepts.filter((c) => c.display?.includes(filter)) : concepts));
    }

    if (expansion.length > count) {
      // Return partial expansion
      return;
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
      let properties = codeSystem.property?.filter((p) => p.uri === parentProperty);
      if (!properties?.length) {
        // Implicit parent property for hierarchical CodeSystems
        properties = [{ code: codeSystem.hierarchyMeaning ?? 'parent', uri: parentProperty, type: 'code' }];
      }

      for (const property of properties) {
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
            new Condition(new Column(csPropertyTable, 'code'), '=', property.code),
          ])
        );

        const targetTable = query.getNextJoinAlias();
        query.leftJoin(
          'Coding',
          targetTable,
          new Conjunction([
            new Condition(new Column(propertyTable, 'target'), '=', new Column(targetTable, 'id')),
            new Condition(new Column(targetTable, 'code'), '=', filter.value),
          ])
        );
        query.where(new Column(targetTable, 'id'), filter.op === 'is-not-a' ? '=' : '!=', null);
      }
    }
  }

  return query;
}
