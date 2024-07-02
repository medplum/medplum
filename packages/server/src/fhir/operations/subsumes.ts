import { allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { CodeSystem } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode } from '../../database';
import { Column, SelectQuery } from '../sql';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findAncestor, findTerminologyResource } from './utils/terminology';

const operation = getOperationDefinition('CodeSystem', 'subsumes');

type CodeSystemSubsumesParameters = {
  system?: string;
  version?: string;
  codeA?: string;
  codeB?: string;
};

// Implements FHIR Terminology Subsumption testing
// http://hl7.org/fhir/R4/codesystem-operation-subsumes.html

export async function codeSystemSubsumesOperation(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<CodeSystemSubsumesParameters>(operation, req);

  let codeSystem: CodeSystem;
  if (req.params.id) {
    codeSystem = await getAuthenticatedContext().repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.system) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.system, params.version);
  } else {
    return [badRequest('No code system specified')];
  }

  if (!params.codeA || !params.codeB) {
    return [badRequest('Must specify codeA and codeB parameters')];
  }
  const outcome = await testSubsumption(codeSystem, params.codeA, params.codeB);
  return [allOk, buildOutputParameters(operation, { outcome })];
}

export type SubsumptionOutcome = 'equivalent' | 'subsumes' | 'subsumed-by' | 'not-subsumed';

export async function testSubsumption(
  codeSystem: CodeSystem,
  left: string,
  right: string
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
  const results = await query.execute(ctx.repo.getDatabaseClient(DatabaseMode.READER));
  return results.length > 0;
}
