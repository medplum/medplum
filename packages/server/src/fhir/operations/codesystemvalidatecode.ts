import { allOk, badRequest } from '@medplum/core';
import { CodeSystem, Coding } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getDatabasePool } from '../../database';
import { sendOutcome } from '../outcomes';
import { SelectQuery } from '../sql';
import { getOperationDefinition } from './definitions';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
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
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function codeSystemValidateCodeHandler(req: Request, res: Response): Promise<void> {
  const params = parseInputParameters<CodeSystemValidateCodeParameters>(operation, req);

  let coding: Coding;
  if (params.coding) {
    coding = params.coding;
  } else if (params.url && params.code) {
    coding = { system: params.url, code: params.code };
  } else {
    sendOutcome(res, badRequest('No coding specified'));
    return;
  }

  const codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', coding.system as string, params.version);
  const result = await validateCode(codeSystem, coding.code as string);

  const output: Record<string, any> = Object.create(null);
  if (result) {
    output.result = true;
    output.display = result.display;
  } else {
    output.result = false;
  }
  await sendOutputParameters(req, res, operation, allOk, output);
}

export async function validateCode(codeSystem: CodeSystem, code: string): Promise<Coding | undefined> {
  const query = new SelectQuery('Coding')
    .column('id')
    .column('display')
    .where('code', '=', code)
    .where('system', '=', codeSystem.id);

  const db = getDatabasePool();
  const result = await query.execute(db);
  return result.length ? { id: result[0].id, system: codeSystem.url, code, display: result[0].display } : undefined;
}
