import { OperationOutcomeError, allOk, badRequest, normalizeOperationOutcome } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { CodeSystem, Coding, OperationDefinition } from '@medplum/fhirtypes';
import { PoolClient } from 'pg';
import { requireSuperAdmin } from '../../admin/super';
import { getAuthenticatedContext } from '../../context';
import { InsertQuery, SelectQuery } from '../sql';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource, parentProperty } from './utils/terminology';

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
 * Endpoint - Project resource type
 *   [fhir base]/CodeSystem/$import
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function codeSystemImportHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireSuperAdmin();

  const params = parseInputParameters<CodeSystemImportParameters>(operation, req);

  let codeSystem: CodeSystem;
  if (req.params.id) {
    codeSystem = await getAuthenticatedContext().repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (params.system) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', params.system);
  } else {
    return [badRequest('No code system specified')];
  }

  try {
    await ctx.repo.withTransaction(async (db) => {
      await importCodeSystem(db, codeSystem, params.concept, params.property);
    });
  } catch (err) {
    return [normalizeOperationOutcome(err)];
  }
  return [allOk, buildOutputParameters(operation, codeSystem)];
}

export async function importCodeSystem(
  db: PoolClient,
  codeSystem: CodeSystem,
  concepts?: Coding[],
  properties?: ImportedProperty[]
): Promise<void> {
  if (concepts?.length) {
    for (const concept of concepts) {
      const row = {
        system: codeSystem.id,
        code: concept.code,
        display: concept.display,
      };
      const query = new InsertQuery('Coding', [row]).mergeOnConflict(['system', 'code']);
      await query.execute(db);
    }
  }

  if (properties?.length) {
    await processProperties(properties, codeSystem, db);
  }
}

async function processProperties(
  importedProperties: ImportedProperty[],
  codeSystem: CodeSystem,
  db: PoolClient
): Promise<void> {
  const cache: Record<string, { id: number; isRelationship: boolean }> = Object.create(null);
  for (const imported of importedProperties) {
    const codingId = (
      await new SelectQuery('Coding')
        .column('id')
        .where('system', '=', codeSystem.id)
        .where('code', '=', imported.code)
        .execute(db)
    )[0]?.id;
    if (!codingId) {
      throw new OperationOutcomeError(badRequest(`Unknown code: ${codeSystem.url}|${imported.code}`));
    }

    const propertyCode = imported.property;
    const cacheKey = codeSystem.url + '|' + propertyCode;
    let { id: propId, isRelationship } = cache[cacheKey] ?? {};
    if (!propId) {
      [propId, isRelationship] = await resolveProperty(codeSystem, propertyCode, db);
      cache[cacheKey] = { id: propId, isRelationship };
    }

    const property: Record<string, any> = {
      coding: codingId,
      property: propId,
      value: imported.value,
    };

    if (isRelationship) {
      const targetId = (
        await new SelectQuery('Coding')
          .column('id')
          .where('system', '=', codeSystem.id)
          .where('code', '=', imported.value)
          .execute(db)
      )[0]?.id;
      if (targetId) {
        property.target = targetId;
      }
    }

    const query = new InsertQuery('Coding_Property', [property]).ignoreOnConflict();
    await query.execute(db);
  }
}

async function resolveProperty(codeSystem: CodeSystem, code: string, db: PoolClient): Promise<[number, boolean]> {
  let prop = codeSystem.property?.find((p) => p.code === code);
  if (!prop) {
    if (code === codeSystem.hierarchyMeaning || (code === 'parent' && !codeSystem.hierarchyMeaning)) {
      prop = { code, uri: parentProperty, type: 'code' };
    } else {
      throw new OperationOutcomeError(badRequest(`Unknown property: ${code}`));
    }
  }
  const isRelationship = prop.type === 'code';

  const knownProp = (
    await new SelectQuery('CodeSystem_Property')
      .column('id')
      .where('system', '=', codeSystem.id)
      .where('code', '=', code)
      .execute(db)
  )[0];
  if (knownProp) {
    return [knownProp.id, isRelationship];
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
  )[0];
  return [newProp.id, isRelationship];
}
