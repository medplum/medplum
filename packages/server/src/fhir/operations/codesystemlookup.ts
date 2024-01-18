import { Coding } from '@medplum/fhirtypes';
import { getOperationDefinition } from './definitions';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { Request, Response } from 'express';
import { TypedValue, allOk, badRequest, notFound } from '@medplum/core';
import { Column, Condition, SelectQuery } from '../sql';
import { sendOutcome } from '../outcomes';
import { getClient } from '../../database';
import { getAuthenticatedContext } from '../../context';

const operation = getOperationDefinition('CodeSystem', 'lookup');

type CodeSystemLookupParameters = {
  code: string;
  system: string;
  coding: Coding;
  property: string[];
};

export async function codeSystemLookupHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<CodeSystemLookupParameters>(operation, req);

  let coding: Coding;
  if (params.coding) {
    coding = params.coding;
  } else if (params.system && params.code) {
    coding = { system: params.system, code: params.code };
  } else {
    sendOutcome(res, badRequest('No coding specified'));
    return;
  }

  const lookup = new SelectQuery('Coding');
  const codeSystemTable = lookup.getNextJoinAlias();
  lookup.innerJoin(
    'CodeSystem',
    codeSystemTable,
    new Condition(new Column('Coding', 'system'), '=', new Column(codeSystemTable, 'id'))
  );
  const propertyTable = lookup.getNextJoinAlias();
  lookup.leftJoin(
    'Coding_Property',
    propertyTable,
    new Condition(new Column(propertyTable, 'coding'), '=', new Column('Coding', 'id'))
  );
  const csPropTable = lookup.getNextJoinAlias();
  lookup.innerJoin(
    'CodeSystem_Property',
    csPropTable,
    new Condition(new Column(propertyTable, 'property'), '=', new Column(csPropTable, 'id'))
  );
  lookup
    .column(new Column(codeSystemTable, 'title'))
    .column(new Column('Coding', 'display'))
    .column(new Column(csPropTable, 'code'))
    .column(new Column(csPropTable, 'type'))
    .column(new Column(csPropTable, 'description'))
    .column(new Column(propertyTable, 'value'))
    .where(new Column(codeSystemTable, 'url'), '=', coding.system)
    .where(new Column(codeSystemTable, 'projectId'), '=', ctx.project.id)
    .where(new Column('Coding', 'code'), '=', coding.code);

  const db = getClient();
  const result = await lookup.execute(db);

  if (result.length < 1) {
    sendOutcome(res, notFound);
    return;
  }

  const resolved = result[0];
  const output: Record<string, any> = {
    name: resolved.title,
    display: resolved.display,
  };
  for (const property of result) {
    if (property.code && property.value) {
      if (!output.property) {
        output.property = [];
      }
      output.property.push({
        code: property.code,
        description: property.description,
        value: { type: property.type, value: property.value } as TypedValue,
      });
    }
  }

  await sendOutputParameters(operation, res, allOk, output);
}
