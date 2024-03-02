import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getOperationDefinition } from './definitions';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { sendOutcome } from '../outcomes';
import { allOk, badRequest } from '@medplum/core';
import { findTerminologyResource, getParentProperty } from './utils/terminology';
import { CodeSystem } from '@medplum/fhirtypes';
import { Column, Condition, Conjunction, SelectQuery, Union } from '../sql';
import { getAuthenticatedContext } from '../../context';

const operation = getOperationDefinition('CodeSystem', 'subsumes');

type CodeSystemSubsumesParameters = {
  system?: string;
  codeA?: string;
  codeB?: string;
};

// Implements FHIR Terminology Subsumption testing
// http://hl7.org/fhir/R4/codesystem-operation-subsumes.html

export const codeSystemSubsumesOperation = asyncWrap(async (req: Request, res: Response) => {
  const params = parseInputParameters<CodeSystemSubsumesParameters>(operation, req);

  if (!params.system || !params.codeA || !params.codeB) {
    sendOutcome(res, badRequest('Must specify system, codeA, and codeB parameters'));
    return;
  }
  const outcome = await testSubsumption(params.codeA, params.codeB, params.system);
  await sendOutputParameters(req, res, operation, allOk, { outcome });
});

export type SubsumptionOutcome = 'equivalent' | 'subsumes' | 'subsumed-by' | 'not-subsumed';

export async function testSubsumption(left: string, right: string, system: string): Promise<SubsumptionOutcome> {
  const codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', system);

  const subsumedBy = await isSubsumed(left, right, codeSystem);
  const subsumes = await isSubsumed(right, left, codeSystem);

  if (subsumes && subsumedBy) {
    return 'equivalent';
  } else if (subsumes) {
    return 'subsumes';
  } else if (subsumedBy) {
    return 'subsumed-by';
  } else {
    return 'not-subsumed';
  }
}

export async function isSubsumed(baseCode: string, ancestorCode: string, codeSystem: CodeSystem): Promise<boolean> {
  const ctx = getAuthenticatedContext();
  const base = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .where(new Column('Coding', 'system'), '=', codeSystem.id)
    .where(new Column('Coding', 'code'), '=', baseCode);

  const query = findAncestor(base, codeSystem, ancestorCode);
  const results = await query.execute(ctx.repo.getDatabaseClient());
  return results.length > 0;
}

export function findAncestor(base: SelectQuery, codeSystem: CodeSystem, ancestorCode: string): SelectQuery {
  const property = getParentProperty(codeSystem);

  const query = new SelectQuery('Coding')
    .column('id')
    .column('code')
    .column('display')
    .where('system', '=', codeSystem.id);
  const propertyTable = query.getNextJoinAlias();
  query.innerJoin(
    'Coding_Property',
    propertyTable,
    new Condition(new Column('Coding', 'id'), '=', new Column(propertyTable, 'target'))
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

  const recursiveCTE = 'cte_ancestors';
  const recursiveTable = query.getNextJoinAlias();
  query.innerJoin(
    recursiveCTE,
    recursiveTable,
    new Condition(new Column(propertyTable, 'coding'), '=', new Column(recursiveTable, 'id'))
  );

  return new SelectQuery(recursiveCTE)
    .column('code')
    .column('display')
    .withRecursive(recursiveCTE, new Union(base, query))
    .where('code', '=', ancestorCode)
    .limit(1);
}
