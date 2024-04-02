import { allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { CodeSystem, Coding } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getDatabasePool } from '../../database';
import { SelectQuery } from '../sql';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource } from './utils/terminology';

const operation = getOperationDefinition('CodeSystem', 'validate-code');

type CodeSystemValidateCodeParameters = {
  url?: string;
  version?: string;
  code?: string;
  coding?: Coding;
};

/**
 * Handles a request to validate whether a code belongs to a CodeSystem.
 *
 * Endpoint - CodeSystem resource type
 *   [fhir base]/CodeSystem/$validate-code
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function codeSystemValidateCodeHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<CodeSystemValidateCodeParameters>(operation, req);

  let codeSystem: CodeSystem;
  if (req.params.id) {
    codeSystem = await getAuthenticatedContext().repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.url) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.url, params.version);
  } else if (params.coding?.system) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.coding.system, params.version);
  } else {
    return [badRequest('No code system specified')];
  }

  let coding: Coding;
  if (params.coding) {
    coding = params.coding;
  } else if (params.code) {
    coding = { system: params.url ?? codeSystem.url, code: params.code };
  } else {
    return [badRequest('No coding specified')];
  }

  const result = await validateCoding(codeSystem, coding);

  const output: Record<string, any> = Object.create(null);
  if (result) {
    output.result = true;
    output.display = result.display;
  } else {
    output.result = false;
  }
  return [allOk, buildOutputParameters(operation, output)];
}

export async function validateCoding(codeSystem: CodeSystem, coding: Coding): Promise<Coding | undefined> {
  if (coding.system && coding.system !== codeSystem.url) {
    return undefined;
  }

  const query = new SelectQuery('Coding')
    .column('id')
    .column('display')
    .where('code', '=', coding.code)
    .where('system', '=', codeSystem.id);

  const db = getDatabasePool();
  const result = await query.execute(db);
  return result.length
    ? { id: result[0].id, system: codeSystem.url, code: coding.code, display: result[0].display }
    : undefined;
}
