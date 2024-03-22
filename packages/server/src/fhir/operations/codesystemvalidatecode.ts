import { allOk, badRequest } from '@medplum/core';
import { CodeSystem, Coding } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getDatabasePool } from '../../database';
import { sendOutcome } from '../outcomes';
import { SelectQuery } from '../sql';
import { getOperationDefinition } from './definitions';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { findTerminologyResource } from './utils/terminology';
import { getAuthenticatedContext } from '../../context';

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
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function codeSystemValidateCodeHandler(req: Request, res: Response): Promise<void> {
  const params = parseInputParameters<CodeSystemValidateCodeParameters>(operation, req);

  let codeSystem: CodeSystem;
  if (req.params.id) {
    codeSystem = await getAuthenticatedContext().repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.url) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.url, params.version);
  } else if (params.coding?.system) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.coding.system, params.version);
  } else {
    sendOutcome(res, badRequest('No code system specified'));
    return;
  }

  let coding: Coding;
  if (params.coding) {
    coding = params.coding;
  } else if (params.code) {
    coding = { system: params.url ?? codeSystem.url, code: params.code };
  } else {
    sendOutcome(res, badRequest('No coding specified'));
    return;
  }

  const result = await validateCoding(codeSystem, coding);

  const output: Record<string, any> = Object.create(null);
  if (result) {
    output.result = true;
    output.display = result.display;
  } else {
    output.result = false;
  }
  await sendOutputParameters(req, res, operation, allOk, output);
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
