import { OperationOutcomeError, TypedValue, allOk, append, badRequest, notFound } from '@medplum/core';
import { CodeSystem, Coding } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getDatabasePool } from '../../database';
import { sendOutcome } from '../outcomes';
import { Column, Condition, SelectQuery } from '../sql';
import { getOperationDefinition } from './definitions';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { findTerminologyResource } from './utils/terminology';
import { getAuthenticatedContext } from '../../context';

const operation = getOperationDefinition('CodeSystem', 'lookup');

type CodeSystemLookupParameters = {
  code?: string;
  system?: string;
  version?: string;
  coding?: Coding;
  property?: string[];
};

export async function codeSystemLookupHandler(req: Request, res: Response): Promise<void> {
  const params = parseInputParameters<CodeSystemLookupParameters>(operation, req);

  let codeSystem: CodeSystem;
  if (req.params.id) {
    codeSystem = await getAuthenticatedContext().repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.system) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.system, params.version);
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
    coding = { system: params.system ?? codeSystem.url, code: params.code };
  } else {
    sendOutcome(res, badRequest('No coding specified'));
    return;
  }

  const output = await lookupCoding(codeSystem, coding);
  await sendOutputParameters(req, res, operation, allOk, output);
}

export type CodeSystemLookupOutput = {
  name: string;
  display: string;
  property?: { code: string; description: string; value: TypedValue }[];
};

export async function lookupCoding(codeSystem: CodeSystem, coding: Coding): Promise<CodeSystemLookupOutput> {
  if (coding.system && coding.system !== codeSystem.url) {
    throw new OperationOutcomeError(notFound);
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
  lookup.leftJoin(
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
    .where(new Column(codeSystemTable, 'id'), '=', codeSystem.id)
    .where(new Column('Coding', 'code'), '=', coding.code);

  const db = getDatabasePool();
  const result = await lookup.execute(db);
  const resolved = result?.[0];
  if (!resolved) {
    throw new OperationOutcomeError(notFound);
  }

  const output: CodeSystemLookupOutput = {
    name: resolved.title as string,
    display: resolved.display as string,
  };
  for (const property of result) {
    if (property.code && property.value) {
      output.property = append(output.property, {
        code: property.code as string,
        description: property.description as string,
        value: { type: property.type, value: property.value } as TypedValue,
      });
    }
  }
  return output;
}
