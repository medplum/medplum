// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  append,
  badRequest,
  flatMapFilter,
  forbidden,
  OperationOutcomeError,
  TypedValue,
  WithId,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Coding, ConceptMap, ConceptMapGroupElementTargetDependsOn, OperationDefinition } from '@medplum/fhirtypes';
import { PoolClient } from 'pg';
import { getAuthenticatedContext } from '../../context';
import { InsertQuery } from '../sql';
import { parseInputParameters } from './utils/parameters';
import { findTerminologyResource } from './utils/terminology';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'conceptmap-import',
  status: 'active',
  kind: 'operation',
  code: 'import',
  experimental: true,
  resource: ['ConceptMap'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'url', type: 'uri', min: 0, max: '1' },
    {
      use: 'in',
      name: 'mapping',
      min: 1,
      max: '*',
      part: [
        { use: 'in', name: 'source', type: 'Coding', min: 1, max: '1' },
        // `target.system` is required; leave `target.code` empty for null map
        { use: 'in', name: 'target', type: 'Coding', min: 1, max: '1' },
        // Default value of relationship is `equivalent`, to reduce overhead
        {
          use: 'in',
          name: 'relationship',
          type: 'code',
          min: 0,
          max: '1',
          binding: {
            strength: 'required',
            valueSet: 'http://hl7.org/fhir/ValueSet/concept-map-equivalence',
          },
        },
        { use: 'in', name: 'comment', type: 'string', min: 0, max: '1' },
        {
          use: 'in',
          name: 'property',
          min: 0,
          max: '*',
          part: [
            { use: 'in', name: 'code', type: 'code', min: 1, max: '1' },
            { use: 'in', name: 'value', type: 'Any', min: 1, max: '1' },
          ],
        },
        {
          use: 'in',
          name: 'dependsOn',
          min: 0,
          max: '*',
          part: [
            { use: 'in', name: 'code', type: 'code', min: 1, max: '1' },
            { use: 'in', name: 'value', type: 'Any', min: 0, max: '1' },
          ],
        },
        {
          use: 'in',
          name: 'product',
          min: 0,
          max: '*',
          part: [
            { use: 'in', name: 'code', type: 'code', min: 1, max: '1' },
            { use: 'in', name: 'value', type: 'Any', min: 0, max: '1' },
          ],
        },
      ],
    },
    { use: 'out', name: 'return', type: 'ConceptMap', min: 1, max: '1' },
  ],
};

export type ConceptMapImportParameters = {
  url?: string;
  mapping: ConceptMapping[];
};

export type ConceptMapping = {
  source: Coding;
  target: Coding;
  relationship?: string;
  comment?: string;
  property?: MappingAttribute[];
  dependsOn?: MappingAttribute[];
  product?: MappingAttribute[];
};

export type MappingAttribute = {
  code: 'string';
  value?: TypedValue;
};

const EMPTY_ARRAY: readonly [] = Object.freeze([]);

export async function conceptMapImportHandler(req: FhirRequest): Promise<FhirResponse> {
  const repo = getAuthenticatedContext().repo;
  const isSuperAdmin = repo.isSuperAdmin();
  if (!repo.isProjectAdmin() && !isSuperAdmin) {
    return [forbidden];
  }

  const params = parseInputParameters<ConceptMapImportParameters>(operation, req);
  console.log('===== GOT PARAMS', JSON.stringify(params, null, 2));

  let conceptMap: WithId<ConceptMap>;
  if (req.params.id) {
    conceptMap = await repo.readResource('ConceptMap', req.params.id);
  } else if (params.url) {
    conceptMap = await findTerminologyResource('ConceptMap', params.url, { ownProjectOnly: !isSuperAdmin });
  } else {
    return [badRequest('ConceptMap to import into must be specified')];
  }

  await repo.withTransaction((db) => importConceptMap(db, conceptMap, params.mapping));
  return [allOk, conceptMap];
}

export async function importConceptMap(
  db: PoolClient,
  conceptMap: WithId<ConceptMap>,
  mappings: readonly ConceptMapping[] = EMPTY_ARRAY
): Promise<void> {
  await importConceptMapResource(db, conceptMap);

  const mappingRows: MappingRow[] = [];
  const attributeRows: (Omit<AttributeRow, 'mapping'>[] | undefined)[] = [];
  for (const mapping of mappings) {
    if (!mapping.source.code) {
      throw new OperationOutcomeError(badRequest('Source code for mapping is required'));
    }

    mappingRows.push({
      conceptMap: conceptMap.id,
      sourceSystem: mapping.source.system ?? '',
      sourceCode: mapping.source.code,
      sourceDisplay: mapping.source.display,
      targetSystem: mapping.target.system ?? '',
      targetCode: mapping.target.code ?? '',
      targetDisplay: mapping.target.display,
      relationship: mapping.relationship === 'equivalent' ? undefined : mapping.relationship,
      comment: mapping.comment,
    });

    let mappingAttributes: Omit<AttributeRow, 'mapping'>[] | undefined;
    for (const property of mapping.property ?? EMPTY_ARRAY) {
      mappingAttributes = append(mappingAttributes, {
        kind: 'property',
        uri: property.code,
        type: property.value?.type,
        value: JSON.stringify(property.value?.value),
      });
    }
    for (const dependency of mapping.dependsOn ?? EMPTY_ARRAY) {
      mappingAttributes = append(mappingAttributes, {
        kind: 'dependsOn',
        uri: dependency.code,
        type: dependency.value?.type,
        value: JSON.stringify(dependency.value?.value),
      });
    }
    for (const product of mapping.product ?? EMPTY_ARRAY) {
      mappingAttributes = append(mappingAttributes, {
        kind: 'product',
        uri: product.code,
        type: product.value?.type,
        value: JSON.stringify(product.value?.value),
      });
    }
    attributeRows.push(mappingAttributes);
  }
  await writeMappingRows(db, mappingRows, attributeRows);
}

export async function importConceptMapResource(db: PoolClient, conceptMap: WithId<ConceptMap>): Promise<void> {
  const mappingRows: MappingRow[] = [];
  const attributeRows: (Omit<AttributeRow, 'mapping'>[] | undefined)[] = [];

  for (const group of conceptMap.group ?? EMPTY_ARRAY) {
    for (const mapping of group.element ?? EMPTY_ARRAY) {
      if (!mapping.code) {
        throw new OperationOutcomeError(badRequest('Source code for mapping is required'));
      }
      for (const target of mapping.target ?? EMPTY_ARRAY) {
        mappingRows.push({
          conceptMap: conceptMap.id,
          sourceSystem: group.source ?? '',
          sourceCode: mapping.code,
          sourceDisplay: mapping.display,
          targetSystem: group.target ?? '',
          targetCode: target.code ?? '',
          targetDisplay: target.display,
          relationship: target.equivalence === 'equivalent' ? undefined : target.equivalence,
          comment: target.comment,
        });

        let mappingAttributes: Omit<AttributeRow, 'mapping'>[] | undefined;
        for (const dependency of target.dependsOn ?? EMPTY_ARRAY) {
          const value = getAttributeValue(dependency);
          mappingAttributes = append(mappingAttributes, {
            kind: 'dependsOn',
            uri: dependency.property,
            type: value.type,
            value: JSON.stringify(value.value),
          });
        }
        for (const product of target.product ?? EMPTY_ARRAY) {
          const value = getAttributeValue(product);
          mappingAttributes = append(mappingAttributes, {
            kind: 'product',
            uri: product.property,
            type: value.type,
            value: JSON.stringify(value.value),
          });
        }
        attributeRows.push(mappingAttributes);
      }
    }
  }
  await writeMappingRows(db, mappingRows, attributeRows);
}

function getAttributeValue(attr: ConceptMapGroupElementTargetDependsOn): TypedValue {
  if (attr.system) {
    return {
      type: 'Coding',
      value: { system: attr.system, code: attr.value, display: attr.display },
    };
  } else if (attr.display) {
    return {
      type: 'Coding',
      value: { code: attr.value, display: attr.display },
    };
  } else {
    return { type: 'code', value: attr.value };
  }
}

type MappingRow = {
  conceptMap: string;
  sourceSystem: string;
  sourceCode: string;
  sourceDisplay?: string;
  targetSystem: string;
  targetCode: string;
  targetDisplay?: string;
  relationship?: string;
  comment?: string;
};
type AttributeRow = {
  mapping: string;
  kind: 'property' | 'dependsOn' | 'product';
  uri: string;
  type?: string;
  value?: string;
};

async function writeMappingRows(
  db: PoolClient,
  mappings: MappingRow[],
  attributes: (Omit<AttributeRow, 'mapping'>[] | undefined)[]
): Promise<void> {
  if (mappings.length) {
    const insertMappings = new InsertQuery('ConceptMapping', mappings)
      .mergeOnConflict(['conceptMap', 'sourceSystem', 'sourceCode', 'targetSystem', 'targetCode'])
      .returnColumn('id');
    const mappingIds = (await insertMappings.execute(db)).rows;

    const attributeRows = flatMapFilter(attributes, (attrs, i) =>
      attrs?.map((a) => ({ ...a, mapping: mappingIds[i].id }))
    );
    if (attributeRows.length) {
      const insertAttributes = new InsertQuery('ConceptMapping_Attribute', attributeRows).ignoreOnConflict();
      await insertAttributes.execute(db);
    }
  }
}
