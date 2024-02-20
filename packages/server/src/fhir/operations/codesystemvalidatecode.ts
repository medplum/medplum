import { allOk, badRequest } from '@medplum/core';
import { CodeSystem, Coding } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getDatabasePool } from '../../database';
import { sendOutcome } from '../outcomes';
import { Column, Condition, SelectQuery } from '../sql';
import { getOperationDefinition } from './definitions';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { findCodeSystem } from './expand';

const operation = getOperationDefinition('CodeSystem', 'validate-code');

type CodeSystemValidateCodeParameters = {
  url?: string;
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

  const codeSystem = await findCodeSystem(coding.system as string);
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
  const query = new SelectQuery('Coding');
  const codeSystemTable = query.getNextJoinAlias();
  query.innerJoin(
    'CodeSystem',
    codeSystemTable,
    new Condition(new Column('Coding', 'system'), '=', new Column(codeSystemTable, 'id'))
  );
  query
    .column('id')
    .column('display')
    .where(new Column(codeSystemTable, 'id'), '=', codeSystem.id)
    .where('code', '=', code);

  const db = getDatabasePool();
  const result = await query.execute(db);
  return result.length ? { id: result[0].id, system: codeSystem.url, code, display: result[0].display } : undefined;
}
