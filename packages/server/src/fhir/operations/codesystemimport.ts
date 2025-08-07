// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, WithId, allOk, badRequest, forbidden, normalizeOperationOutcome } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { CodeSystem, CodeSystemProperty, Coding, OperationDefinition } from '@medplum/fhirtypes';
import { PoolClient } from 'pg';
import { getAuthenticatedContext } from '../../context';
import { Condition, InsertQuery, SelectQuery } from '../sql';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource, parentProperty, selectCoding } from './utils/terminology';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'codesystem-import',
  status: 'active',
  kind: 'operation',
  code: 'import',
  experimental: true,
  resource: ['CodeSystem'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    { use: 'in', name: 'system', type: 'uri', min: 0, max: '1' },
    { use: 'in', name: 'concept', type: 'Coding', min: 0, max: '*' },
    {
      use: 'in',
      name: 'property',
      min: 0,
      max: '*',
      part: [
        { use: 'in', name: 'code', type: 'code', min: 1, max: '1' },
        { use: 'in', name: 'property', type: 'code', min: 1, max: '1' },
        { use: 'in', name: 'value', type: 'string', min: 1, max: '1' },
      ],
    },
    { use: 'out', name: 'return', type: 'CodeSystem', min: 1, max: '1' },
  ],
};

export type ImportedProperty = {
  code: string;
  property: string;
  value: string;
};

export type CodeSystemImportParameters = {
  system?: string;
  concept?: Coding[];
  property?: ImportedProperty[];
};

/**
 * Handles a request to import codes and their properties into a CodeSystem.
 *
 * Endpoint - CodeSystem resource type
 *   [fhir base]/CodeSystem/$import
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function codeSystemImportHandler(req: FhirRequest): Promise<FhirResponse> {
  const repo = getAuthenticatedContext().repo;
  const isSuperAdmin = repo.isSuperAdmin();
  if (!repo.isProjectAdmin() && !isSuperAdmin) {
    return [forbidden];
  }

  const params = parseInputParameters<CodeSystemImportParameters>(operation, req);

  let codeSystem: WithId<CodeSystem>;
  if (req.params.id) {
    codeSystem = await repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.system) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.system, {
      ownProjectOnly: !isSuperAdmin,
    });
  } else {
    return [badRequest('No code system specified')];
  }

  try {
    await repo.withTransaction(async (db) => {
      await importCodeSystem(db, codeSystem, params.concept, params.property);
    });
  } catch (err) {
    return [normalizeOperationOutcome(err)];
  }
  return [allOk, buildOutputParameters(operation, codeSystem)];
}

export async function importCodeSystem(
  db: PoolClient,
  codeSystem: WithId<CodeSystem>,
  concepts?: Coding[],
  properties?: ImportedProperty[]
): Promise<void> {
  if (concepts?.length) {
    const rows = uniqueOn(concepts, (c) => c.code as string).map((c) => ({
      system: codeSystem.id,
      code: c.code,
      display: c.display,
      isSynonym: false,
    }));
    const query = new InsertQuery('Coding', rows).mergeOnConflict(
      ['system', 'code'],
      new Condition('synonymOf', '=', null)
    );
    await query.execute(db);
  }

  if (properties?.length) {
    await processProperties(properties, codeSystem, db);
  }
}

function uniqueOn<T>(arr: T[], keyFn: (el: T) => string): T[] {
  const seen = Object.create(null);
  for (const el of arr) {
    const key = keyFn(el);
    seen[key] = el;
  }
  return Object.values(seen);
}

async function processProperties(
  importedProperties: ImportedProperty[],
  codeSystem: WithId<CodeSystem>,
  db: PoolClient
): Promise<void> {
  const cache: Record<string, { id: number; property: CodeSystemProperty }> = Object.create(null);
  const lookupCodes = new Set<string>();
  for (const imported of importedProperties) {
    const propertyCode = imported.property;
    const cacheKey = codeSystem.url + '|' + propertyCode;
    let { id: propId, property } = cache[cacheKey] ?? {};
    if (!propId) {
      [propId, property] = await resolveProperty(codeSystem, propertyCode, db);
      cache[cacheKey] = { id: propId, property };
    }

    lookupCodes.add(imported.code);
    if (property.type === 'code') {
      lookupCodes.add(imported.value);
    }
  }

  // Batch lookup all Codings with associated properties
  const codingIds = await selectCoding(codeSystem.id, ...lookupCodes).execute(db);
  const rows: Record<string, any>[] = [];
  const syonyms: Record<string, any>[] = [];
  for (const imported of importedProperties) {
    const sourceCodingId = codingIds.find((r) => r.code === imported.code)?.id;
    if (!sourceCodingId) {
      throw new OperationOutcomeError(badRequest(`Unknown code: ${codeSystem.url}|${imported.code}`));
    }

    const { id: propId, property } = cache[`${codeSystem.url}|${imported.property}`] ?? {};
    const targetCodingId = codingIds.find((r) => r.code === imported.value)?.id;
    rows.push({
      coding: sourceCodingId,
      property: propId,
      value: imported.value,
      target: property.type === 'code' && targetCodingId ? targetCodingId : null,
    });

    if (property.uri === 'http://hl7.org/fhir/concept-properties#synonym') {
      syonyms.push({
        system: codeSystem.id,
        code: imported.code,
        display: imported.value,
        isSynonym: true,
        synonymOf: sourceCodingId,
      });
    }
  }

  const query = new InsertQuery('Coding_Property', rows).ignoreOnConflict();
  await query.execute(db);

  if (syonyms.length) {
    const query = new InsertQuery('Coding', syonyms).ignoreOnConflict();
    await query.execute(db);
  }
}

async function resolveProperty(
  codeSystem: CodeSystem,
  code: string,
  db: PoolClient
): Promise<[number, CodeSystemProperty]> {
  let prop = codeSystem.property?.find((p) => p.code === code);
  if (!prop) {
    if (code === codeSystem.hierarchyMeaning || (code === 'parent' && !codeSystem.hierarchyMeaning)) {
      prop = { code, uri: parentProperty, type: 'code' };
    } else {
      throw new OperationOutcomeError(badRequest(`Unknown property: ${code}`));
    }
  }

  const knownProp = (
    await new SelectQuery('CodeSystem_Property')
      .column('id')
      .where('system', '=', codeSystem.id)
      .where('code', '=', code)
      .execute(db)
  )[0];
  if (knownProp) {
    return [knownProp.id, prop];
  }

  const newProp = (
    await new InsertQuery('CodeSystem_Property', [
      {
        system: codeSystem.id,
        code,
        type: prop.type,
        uri: prop.uri,
        description: prop.description,
      },
    ])
      .returnColumn('id')
      .execute(db)
  ).rows[0];
  return [newProp.id, prop];
}
