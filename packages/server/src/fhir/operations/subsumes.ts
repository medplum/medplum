// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { CodeSystem } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode } from '../../database';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  findAncestor,
  findTerminologyResource,
  getParentProperty,
  resolveProperty,
  selectCoding,
} from './utils/terminology';

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

  let codeSystem: WithId<CodeSystem>;
  if (req.params.id) {
    codeSystem = await getAuthenticatedContext().repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.system) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.system, { version: params.version });
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
  codeSystem: WithId<CodeSystem>,
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

export async function isSubsumed(
  baseCode: string,
  ancestorCode: string,
  codeSystem: WithId<CodeSystem>
): Promise<boolean> {
  const { repo } = getAuthenticatedContext();
  const base = selectCoding(codeSystem.id, baseCode);
  const db = repo.getDatabaseClient(DatabaseMode.READER);

  const parentProperty = await resolveProperty(db, codeSystem, getParentProperty(codeSystem));
  if (!parentProperty) {
    return false;
  }
  const query = findAncestor(base, codeSystem, parentProperty, ancestorCode);
  const results = await query.execute(db);
  return results.length > 0;
}
