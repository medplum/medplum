import { CodeSystem, Coding, OperationDefinition } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getAuthenticatedContext } from '../../context';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { OperationOutcomeError, Operator, allOk, badRequest, normalizeOperationOutcome } from '@medplum/core';
import { getClient } from '../../database';
import { InsertQuery, SelectQuery } from '../sql';
import { sendOutcome } from '../outcomes';
import { Pool } from 'pg';

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
    { use: 'in', name: 'system', type: 'uri', min: 1, max: '1' },
    { use: 'in', name: 'concept', type: 'Coding', min: 0, max: '*' },
    {
      use: 'in',
      name: 'property',
      min: 0,
      max: '*',
      part: [
        { name: 'code', type: 'code', min: 1, max: '1' },
        { name: 'property', type: 'code', min: 1, max: '1' },
        { name: 'value', type: 'string', min: 1, max: '1' },
      ],
    },
    { use: 'out', name: 'return', type: 'CodeSystem', min: 1, max: '1' },
  ],
};

type ImportedProperty = {
  code: string;
  property: string;
  value: string;
};

type CodeSystemImportParameters = {
  system: string;
  concept?: Coding[];
  property?: ImportedProperty[];
};

/**
 * Handles a request to import codes and their properties into a CodeSystem.
 *
 * Endpoint - Project resource type
 *   [fhir base]/CodeSystem/$import
 *
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function codeSystemImportHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();

  const params = parseInputParameters<CodeSystemImportParameters>(operation, req);
  const codeSystems = await ctx.repo.searchResources<CodeSystem>({
    resourceType: 'CodeSystem',
    filters: [{ code: 'url', operator: Operator.EQUALS, value: params.system }],
  });
  if (codeSystems.length === 0) {
    sendOutcome(res, badRequest('No CodeSystem found with URL ' + params.system));
    return;
  } else if (codeSystems.length > 1) {
    sendOutcome(res, badRequest('Ambiguous code system URI: ' + params.system));
    return;
  }
  const codeSystem = codeSystems[0];

  const db = getClient();
  await db.query('BEGIN');
  if (params.concept) {
    const concepts = [];
    for (const concept of params.concept) {
      concepts.push({
        system: codeSystem.id,
        code: concept.code,
        display: concept.display,
      });
    }
    const query = new InsertQuery('Coding', concepts).mergeOnConflict(['system', 'code']);
    await query.execute(db);
  }

  if (params.property) {
    try {
      await processProperties(params.property, codeSystem, db);
    } catch (err: any) {
      sendOutcome(res, normalizeOperationOutcome(err));
      return;
    }
  }

  await db.query(`COMMIT`);
  await sendOutputParameters(operation, res, allOk, codeSystem);
}

async function processProperties(
  importedProperties: ImportedProperty[],
  codeSystem: CodeSystem,
  db: Pool
): Promise<void> {
  const cache: Record<string, number> = Object.create(null);
  const properties = [];
  for (const imported of importedProperties) {
    const codingId = (
      await new SelectQuery('Coding')
        .column('id')
        .where('system', '=', codeSystem.id)
        .where('code', '=', imported.code)
        .execute(db)
    )[0]?.id;
    if (!codingId) {
      throw new OperationOutcomeError(badRequest('Unknown code: ' + imported.code));
    }

    const propertyCode = imported.property;
    const cacheKey = codeSystem.url + '|' + propertyCode;
    let propId = cache[cacheKey];
    let isRelationship = false;
    if (!propId) {
      [propId, isRelationship] = await resolveProperty(codeSystem, propertyCode, db);
      cache[cacheKey] = propId;
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
      } else {
        throw new OperationOutcomeError(badRequest('Unknown code: ' + imported.code));
      }
    }

    properties.push(property);
  }
  const query = new InsertQuery('Coding_Property', properties);
  await query.execute(db);
}

async function resolveProperty(codeSystem: CodeSystem, code: string, db: Pool): Promise<[number, boolean]> {
  const prop = codeSystem.property?.find((p) => p.code === code);
  if (!prop) {
    throw new OperationOutcomeError(badRequest(`Unknown property: ${code}`));
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
