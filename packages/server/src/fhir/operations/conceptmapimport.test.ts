// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, SNOMED, WithId } from '@medplum/core';
import { ConceptMap, Parameters } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { DatabaseMode, getDatabasePool } from '../../database';
import { createTestProject } from '../../test.setup';
import { Column, Condition, SelectQuery } from '../sql';
import { importConceptMapResource } from './conceptmapimport';

const app = express();
const ICD10 = 'http://hl7.org/fhir/sid/icd-10-us';

describe('importConceptMapReosurce()', () => {
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

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Imports basic mappings from resource', async () => {
    const pool = getDatabasePool(DatabaseMode.WRITER);
    const db = await pool.connect();
    await importConceptMapResource(db, resource);

    const query = new SelectQuery('ConceptMapping')
      .column('conceptMap')
      .column('sourceSystem')
      .column('sourceCode')
      .column('targetSystem')
      .column('targetCode')
      .column('relationship')
      .column('comment')
      .where('conceptMap', '=', resource.id);
    const results = await query.execute(db);
    db.release();
    expect(results).toHaveLength(2);
    expect(results).toStrictEqual(
      expect.arrayContaining([
        {
          conceptMap: resource.id,
          sourceSystem: SNOMED,
          sourceCode: '263204007',
          targetSystem: ICD10,
          targetCode: 'S52.209A',
          relationship: 'narrower',
          comment: expect.stringContaining('subsequent'),
        },
        {
          conceptMap: resource.id,
          sourceSystem: SNOMED,
          sourceCode: '263204007',
          targetSystem: ICD10,
          targetCode: 'S52.209D',
          relationship: 'narrower',
          comment: expect.stringContaining('subsequent'),
        },
      ])
    );
  });
});

describe('ConceptMap/$import', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Imports concept mappings and attributes', async () => {
    const { accessToken, repo } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      membership: { admin: true },
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
    const db = await pool.connect();

    const query = new SelectQuery('ConceptMapping')
      .column('conceptMap')
      .column('sourceSystem')
      .column('sourceCode')
      .column('sourceDisplay')
      .column('targetSystem')
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
      .where('conceptMap', '=', conceptMap.id);
    const results = await query.execute(db);
    db.release();
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
});
