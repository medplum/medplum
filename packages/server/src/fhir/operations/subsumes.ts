import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getOperationDefinition } from './definitions';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { sendOutcome } from '../outcomes';
import { allOk, badRequest } from '@medplum/core';
import { findAncestor, findTerminologyResource } from './utils/terminology';
import { CodeSystem } from '@medplum/fhirtypes';
import { Column, SelectQuery } from '../sql';
import { getAuthenticatedContext } from '../../context';

const operation = getOperationDefinition('CodeSystem', 'subsumes');

type CodeSystemSubsumesParameters = {
  system?: string;
  version?: string;
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
  const codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.system, params.version);
  const outcome = await testSubsumption(params.codeA, params.codeB, codeSystem);
  await sendOutputParameters(req, res, operation, allOk, { outcome });
});

export type SubsumptionOutcome = 'equivalent' | 'subsumes' | 'subsumed-by' | 'not-subsumed';

export async function testSubsumption(
  left: string,
  right: string,
  codeSystem: CodeSystem
): Promise<SubsumptionOutcome> {
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
