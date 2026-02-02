// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TypedValue, WithId } from '@medplum/core';
import { OperationOutcomeError, allOk, append, badRequest, notFound, serverError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { CodeSystem, CodeSystemProperty, Coding } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { Column, Condition } from '../sql';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource, selectCoding } from './utils/terminology';

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
  const repo = getAuthenticatedContext().repo;

  const ctx = getAuthenticatedContext();
  let codeSystem: WithId<CodeSystem>;
  if (req.params.id) {
    codeSystem = await ctx.repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.system) {
    codeSystem = await findTerminologyResource(repo, 'CodeSystem', params.system, { version: params.version });
  } else if (params.coding?.system) {
    codeSystem = await findTerminologyResource(repo, 'CodeSystem', params.coding.system, { version: params.version });
  } else {
    return [badRequest('No code system specified')];
  }

  let coding: Coding & { code: string };
  if (params.coding) {
    if (!params.coding.code) {
      return [badRequest('No code specified')];
    }
    coding = params.coding as Coding & { code: string };
  } else if (params.code) {
    coding = { system: params.system ?? codeSystem.url, code: params.code };
  } else {
    return [badRequest('No coding specified')];
  }

  const output = await lookupCoding(ctx.repo.shardId, codeSystem, coding);
  return [allOk, buildOutputParameters(operation, output)];
}

export type CodeSystemLookupOutput = {
  name: string;
  display: string;
  designation?: { language?: string; value: string }[];
  property?: { code: string; description: string; value: TypedValue }[];
};

async function lookupCoding(
  shardId: string,
  codeSystem: WithId<CodeSystem>,
  coding: Coding & { code: string }
): Promise<CodeSystemLookupOutput> {
  if (coding.system && coding.system !== codeSystem.url) {
    throw new OperationOutcomeError(notFound);
  }

  const lookup = selectCoding(codeSystem.id, coding.code);
  const propertyTable = lookup.getNextJoinAlias();
  lookup.join(
    'LEFT JOIN',
    'Coding_Property',
    propertyTable,
    new Condition(new Column(propertyTable, 'coding'), '=', new Column('Coding', 'id'))
  );
  const csPropTable = lookup.getNextJoinAlias();
  lookup.join(
    'LEFT JOIN',
    'CodeSystem_Property',
    csPropTable,
    new Condition(new Column(propertyTable, 'property'), '=', new Column(csPropTable, 'id'))
  );
  const target = lookup.getNextJoinAlias();
  lookup.join(
    'LEFT JOIN',
    'Coding',
    target,
    new Condition(new Column(propertyTable, 'target'), '=', new Column(target, 'id'))
  );
  lookup
    .column(new Column(csPropTable, 'code'))
    .column(new Column(csPropTable, 'type'))
    .column(new Column(csPropTable, 'description'))
    .column(new Column(propertyTable, 'value'))
    .column(new Column(target, 'display', undefined, 'targetDisplay'));

  const db = getDatabasePool(DatabaseMode.READER, shardId);
  const result = await lookup.execute(db);
  if (!result.length) {
    throw new OperationOutcomeError(notFound);
  }

  const output: CodeSystemLookupOutput = {
    name: codeSystem.title ?? codeSystem.name ?? (codeSystem.url as string),
    display: result.find((r) => !r.synonymOf).display ?? '',
  };
  for (const property of result) {
    if (property.synonymOf) {
      output.designation = append(output.designation, {
        language: property.language,
        value: property.display,
      });
    } else if (property.code && property.value) {
      output.property = append(output.property, {
        code: property.code,
        description: property.targetDisplay ?? property.description ?? undefined,
        value: toTypedValue(property.value, property.type),
      });
    }
  }
  return output;
}

function toTypedValue(value: string, type: CodeSystemProperty['type']): TypedValue {
  switch (type) {
    case 'boolean':
      if (value === 'true') {
        return { type, value: true };
      } else if (value === 'false') {
        return { type, value: false };
      } else {
        throw new OperationOutcomeError(serverError(new Error('Invalid value for boolean property: ' + value)));
      }
    case 'integer':
      return { type, value: Number.parseInt(value, 10) };
    case 'decimal':
      return { type, value: Number.parseFloat(value) };
    default:
      return { type, value };
  }
}
