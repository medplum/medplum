import { OperationOutcomeError, TypedValue, allOk, append, badRequest, notFound } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { CodeSystem, Coding } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { Column, Condition, SelectQuery } from '../sql';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource } from './utils/terminology';

const operation = getOperationDefinition('CodeSystem', 'lookup');

type CodeSystemLookupParameters = {
  code?: string;
  system?: string;
  version?: string;
  coding?: Coding;
  property?: string[];
};

export async function codeSystemLookupHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<CodeSystemLookupParameters>(operation, req);

  let codeSystem: CodeSystem;
  if (req.params.id) {
    codeSystem = await getAuthenticatedContext().repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.system) {
    codeSystem = await findTerminologyResource('CodeSystem', params.system, params.version);
  } else if (params.coding?.system) {
    codeSystem = await findTerminologyResource('CodeSystem', params.coding.system, params.version);
  } else {
    return [badRequest('No code system specified')];
  }

  let coding: Coding;
  if (params.coding) {
    coding = params.coding;
  } else if (params.code) {
    coding = { system: params.system ?? codeSystem.url, code: params.code };
  } else {
    return [badRequest('No coding specified')];
  }

  const output = await lookupCoding(codeSystem, coding);
  return [allOk, buildOutputParameters(operation, output)];
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

  const lookup = new SelectQuery('Coding').column('display');
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
  const target = lookup.getNextJoinAlias();
  lookup.leftJoin('Coding', target, new Condition(new Column(propertyTable, 'target'), '=', new Column(target, 'id')));
  lookup
    .column(new Column(csPropTable, 'code'))
    .column(new Column(csPropTable, 'type'))
    .column(new Column(csPropTable, 'description'))
    .column(new Column(propertyTable, 'value'))
    .column(new Column(target, 'display', undefined, 'targetDisplay'))
    .where('code', '=', coding.code)
    .where('system', '=', codeSystem.id);

  const db = getDatabasePool(DatabaseMode.READER);
  const result = await lookup.execute(db);
  const resolved = result?.[0];
  if (!resolved) {
    throw new OperationOutcomeError(notFound);
  }

  const output: CodeSystemLookupOutput = {
    name: codeSystem.title ?? codeSystem.name ?? (codeSystem.url as string),
    display: resolved.display ?? '',
  };
  for (const property of result) {
    if (property.code && property.value) {
      output.property = append(output.property, {
        code: property.code,
        description: property.targetDisplay ?? property.description,
        value: { type: property.type, value: property.value },
      });
    }
  }
  return output;
}
