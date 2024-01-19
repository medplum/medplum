import { CodeSystem, Coding } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { allOk, badRequest, Operator } from '@medplum/core';
import { getClient } from '../../database';
import { Column, Condition, SelectQuery } from '../sql';
import { sendOutcome } from '../outcomes';
import { getOperationDefinition } from './definitions';
import { getAuthenticatedContext } from '../../context';

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
  const ctx = getAuthenticatedContext();
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

  const codeSystem = await ctx.repo.searchOne<CodeSystem>({
    resourceType: 'CodeSystem',
    filters: [{ code: 'url', operator: Operator.EQUALS, value: coding.system as string }],
  });
  if (!codeSystem) {
    sendOutcome(res, badRequest('CodeSystem not found'));
    return;
  }

  const query = new SelectQuery('Coding');
  const codeSystemTable = query.getNextJoinAlias();
  query.innerJoin(
    'CodeSystem',
    codeSystemTable,
    new Condition(new Column('Coding', 'system'), '=', new Column(codeSystemTable, 'id'))
  );
  query.column('display').where(new Column(codeSystemTable, 'id'), '=', codeSystem.id).where('code', '=', coding.code);

  const db = getClient();
  const result = await query.execute(db);
  const output: Record<string, any> = Object.create(null);
  if (result.length) {
    output.result = true;
    output.display = result[0].display;
  } else {
    output.result = false;
  }
  await sendOutputParameters(operation, res, allOk, output);
}
