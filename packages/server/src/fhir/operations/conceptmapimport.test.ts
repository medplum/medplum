// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, SNOMED } from '@medplum/core';
import type { ConceptMap, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import type { Pool } from 'pg';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { createTestProject } from '../../test.setup';
import type { Repository } from '../repo';
import { Column, Condition, SelectQuery } from '../sql';
import { importConceptMap } from './conceptmapimport';

const app = express();
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-us';

describe('importConceptMap()', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Imports basic mappings from resource', async () => {
    const resource: WithId<ConceptMap> = {
      resourceType: 'ConceptMap',
      id: randomUUID(),
      version: '4.0.1',
      status: 'draft',
      experimental: true,
      group: [
        {
          source: SNOMED,
          target: ICD10,
          element: [
            {
              code: '263204007',
              target: [
                {
                  code: 'S52.209A',
                  equivalence: 'narrower',
                  comment:
                    'The target mapping to ICD-10-CM is narrower, since additional patient data on the encounter (initial vs. subsequent) and fracture type is required for a valid ICD-10-CM mapping.',
                },
                {
                  code: 'S52.209D',
                  equivalence: 'narrower',
                  comment:
                    'The target mapping to ICD-10-CM is narrower, since additional patient data on the encounter (initial vs. subsequent), fracture type and healing (for subsequent encounter) is required for a valid ICD-10-CM mapping.',
                },
              ],
            },
          ],
        },
      ],
    };

    const pool = getDatabasePool(DatabaseMode.WRITER);
    const db = await pool.connect();
    await importConceptMap(db, resource);
    db.release();

    const results = await getMappingRows(pool, resource);
    expect(results).toHaveLength(2);
    expect(results).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conceptMap: resource.id,
          sourceSystem: SNOMED,
          sourceCode: '263204007',
          targetSystem: ICD10,
          targetCode: 'S52.209A',
          relationship: 'narrower',
          comment: expect.stringContaining('subsequent'),
        }),
        expect.objectContaining({
          conceptMap: resource.id,
          sourceSystem: SNOMED,
          sourceCode: '263204007',
          targetSystem: ICD10,
          targetCode: 'S52.209D',
          relationship: 'narrower',
          comment: expect.stringContaining('subsequent'),
        }),
      ])
    );
  });

  test('Imports mapping metadata', async () => {
    const resource: WithId<ConceptMap> = {
      resourceType: 'ConceptMap',
      id: randomUUID(),
      version: '4.0.1',
      status: 'draft',
      experimental: true,
      group: [
        {
          source: SNOMED,
          target: ICD10,
          element: [
            {
              code: '1003470004',
              target: [
                {
                  code: 'Z12.9',
                  equivalence: 'equivalent',
                },
                {
                  code: 'Z12.11',
                  equivalence: 'equivalent',
                  dependsOn: [{ property: 'context', system: SNOMED, value: '460591000124101' }],
                },
                {
                  code: 'Z12.72',
                  equivalence: 'equivalent',
                  dependsOn: [{ property: 'context', system: SNOMED, value: '146861000119102' }],
                  product: [{ property: 'http://hl7.org/fhir/StructureDefinition/Patient#gender', value: 'female' }],
                },
              ],
            },
          ],
        },
      ],
    };

    const pool = getDatabasePool(DatabaseMode.WRITER);
    const db = await pool.connect();
    await importConceptMap(db, resource);
    db.release();

    const results = await getMappingRows(pool, resource);
    expect(results).toHaveLength(4);
    expect(results).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conceptMap: resource.id,
          sourceSystem: SNOMED,
          sourceCode: '1003470004',
          targetSystem: ICD10,
          targetCode: 'Z12.9',
          relationship: null,
          uri: null,
          type: null,
          value: null,
          kind: null,
        }),
        expect.objectContaining({
          conceptMap: resource.id,
          sourceSystem: SNOMED,
          sourceCode: '1003470004',
          targetSystem: ICD10,
          targetCode: 'Z12.11',
          relationship: null,
          kind: 'dependsOn',
          uri: 'context',
          type: 'Coding',
          value: `{"system":"${SNOMED}","code":"460591000124101"}`,
        }),
        expect.objectContaining({
          conceptMap: resource.id,
          sourceSystem: SNOMED,
          sourceCode: '1003470004',
          targetSystem: ICD10,
          targetCode: 'Z12.72',
          relationship: null,
          kind: 'dependsOn',
          uri: 'context',
          type: 'Coding',
          value: `{"system":"${SNOMED}","code":"146861000119102"}`,
        }),
        expect.objectContaining({
          conceptMap: resource.id,
          sourceSystem: SNOMED,
          sourceCode: '1003470004',
          targetSystem: ICD10,
          targetCode: 'Z12.72',
          relationship: null,
          kind: 'product',
          uri: 'http://hl7.org/fhir/StructureDefinition/Patient#gender',
          type: 'code',
          value: `"female"`,
        }),
      ])
    );
  });
});

describe('ConceptMap/$import', () => {
  let accessToken: string;
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    ({ accessToken, repo } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      membership: { admin: true },
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Imports concept mappings and attributes', async () => {
    const conceptMap = await repo.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'draft',
      name: 'Test Imported ConceptMap',
    });

    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'mapping',
            part: [
              {
                name: 'source',
                valueCoding: { system: 'http://snomed.info/sct', code: '10347006', display: 'Solar uticaria' },
              },
              {
                name: 'target',
                valueCoding: {
                  system: 'http://hl7.org/fhir/sid/icd-10-cm',
                  code: 'T50.905',
                  display:
                    'Adverse effect of unspecified drugs, medicaments and biological substances, episode of care unspecified',
                },
              },
              {
                name: 'comment',
                valueString:
                  'CONSIDER ADDITIONAL CODE TO IDENTIFY SPECIFIC CONDITION OR DISEASE | EPISODE OF CARE INFORMATION NEEDED | MAP OF SOURCE CONCEPT IS CONTEXT DEPENDENT',
              },
              {
                name: 'dependsOn',
                part: [
                  { name: 'code', valueCode: 'context' },
                  { name: 'value', valueCoding: { system: SNOMED, code: '403625006' } },
                ],
              },
            ],
          },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(200);

    const pool = getDatabasePool(DatabaseMode.READER);

    const results = await getMappingRows(pool, conceptMap);
    expect(results).toHaveLength(1);
    expect(results[0]).toStrictEqual({
      conceptMap: conceptMap.id,
      sourceSystem: SNOMED,
      sourceCode: '10347006',
      sourceDisplay: 'Solar uticaria',
      targetSystem: 'http://hl7.org/fhir/sid/icd-10-cm',
      targetCode: 'T50.905',
      targetDisplay: expect.stringContaining('Adverse effect of unspecified drugs'),
      comment: expect.stringContaining('CONSIDER ADDITIONAL CODE'),
      relationship: null,
      kind: 'dependsOn',
      uri: 'context',
      type: 'Coding',
      value: `{"system":"http://snomed.info/sct","code":"403625006"}`,
    });
  });

  test('Requires admin privileges', async () => {
    const { accessToken, repo } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      membership: { admin: false },
    });

    const conceptMap = await repo.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'draft',
      name: 'Test Imported ConceptMap',
    });

    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'mapping',
            part: [
              { name: 'source', valueCoding: { system: 'http://snomed.info/sct', code: '10347006' } },
              { name: 'target', valueCoding: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'T50.905' } },
            ],
          },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(403);
  });

  test('Allows selecting ConceptMap by URL', async () => {
    const conceptMap = await repo.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'draft',
      url: 'http://example.com/ConceptMap/' + randomUUID(),
    });

    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: conceptMap.url },
          {
            name: 'mapping',
            part: [
              { name: 'source', valueCoding: { system: 'http://snomed.info/sct', code: '10347006' } },
              { name: 'target', valueCoding: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'T50.905' } },
            ],
          },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(200);
  });

  test('Requires ConceptMap to be specified', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'mapping',
            part: [
              { name: 'source', valueCoding: { system: 'http://snomed.info/sct', code: '10347006' } },
              { name: 'target', valueCoding: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'T50.905' } },
            ],
          },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [expect.objectContaining({ details: { text: 'ConceptMap to import into must be specified' } })],
    });
  });

  test('Cannot overspecify ConceptMap', async () => {
    const conceptMap = await repo.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'draft',
      url: 'http://example.com/ConceptMap/' + randomUUID(),
    });

    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: conceptMap.url },
          {
            name: 'mapping',
            part: [
              { name: 'source', valueCoding: { system: 'http://snomed.info/sct', code: '10347006' } },
              { name: 'target', valueCoding: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'T50.905' } },
            ],
          },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining({ details: { text: expect.stringContaining('not permitted for instance operation') } }),
      ],
    });
  });

  test('Requires source code to be specified', async () => {
    const conceptMap = await repo.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'draft',
      url: 'http://example.com/ConceptMap/' + randomUUID(),
    });

    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'mapping',
            part: [
              { name: 'source', valueCoding: { system: 'http://snomed.info/sct' } }, // Must specify code
              { name: 'target', valueCoding: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'T50.905' } },
            ],
          },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [expect.objectContaining({ details: { text: 'Source code for mapping is required' } })],
    });
  });

  test('Ignores unspecified source code in ConceptMap resource', async () => {
    const conceptMap = await repo.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'draft',
      url: 'http://example.com/ConceptMap/' + randomUUID(),
      group: [
        {
          source: SNOMED,
          element: [
            {
              code: '364075005',
              target: [{ code: '8886-4', equivalence: 'equivalent' }],
            },
            {
              target: [{ code: 'unmapped', equivalence: 'equal' }],
            },
          ],
        },
      ],
    });

    const pool = getDatabasePool(DatabaseMode.READER);
    const results = await getMappingRows(pool, conceptMap);
    expect(results).toHaveLength(1);
  });

  test('Handles ConceptMap with no valid mappings', async () => {
    const map: ConceptMap = await repo.createResource({
      resourceType: 'ConceptMap',
      group: [
        {
          target: 'urn:uuid:f2334818-8254-4c9f-95a4-335109e78c25',
          element: [{ target: [{ equivalence: 'disjoint' }] }],
        },
      ],
      status: 'active',
    });

    const pool = getDatabasePool(DatabaseMode.READER);
    const results = await getMappingRows(pool, map);
    expect(results).toHaveLength(0);
  });
});

async function getMappingRows(pool: Pool, conceptMap: ConceptMap): Promise<any[]> {
  const db = await pool.connect();
  const query = new SelectQuery('ConceptMapping')
    .column('conceptMap')
    .column('sourceCode')
    .column('sourceDisplay')
    .column('targetCode')
    .column('targetDisplay')
    .column('relationship')
    .column('comment')
    .join(
      'LEFT JOIN',
      'ConceptMapping_Attribute',
      'attr',
      new Condition(new Column('ConceptMapping', 'id'), '=', new Column('attr', 'mapping'))
    )
    .column(new Column('attr', 'kind'))
    .column(new Column('attr', 'uri'))
    .column(new Column('attr', 'type'))
    .column(new Column('attr', 'value'))
    .join(
      'INNER JOIN',
      'CodingSystem',
      'source',
      new Condition(new Column('source', 'id'), '=', new Column('ConceptMapping', 'sourceSystem'))
    )
    .column(new Column('source', 'system', false, 'sourceSystem'))
    .join(
      'INNER JOIN',
      'CodingSystem',
      'target',
      new Condition(new Column('target', 'id'), '=', new Column('ConceptMapping', 'targetSystem'))
    )
    .column(new Column('target', 'system', false, 'targetSystem'))
    .where('conceptMap', '=', conceptMap.id);

  const results = await query.execute(db);
  db.release();
  return results;
}
