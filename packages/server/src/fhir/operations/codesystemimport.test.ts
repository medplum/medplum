import express from 'express';
import { loadTestConfig } from '../../config';
import { initApp, shutdownApp } from '../../app';
import { initTestAuth } from '../../test.setup';
import request from 'supertest';
import { CodeSystem, Parameters } from '@medplum/fhirtypes';
import { ContentType } from '@medplum/core';
import { getClient } from '../../database';
import { SelectQuery } from '../sql';

const app = express();

export const snomedJSON: CodeSystem = {
  resourceType: 'CodeSystem',
  url: 'http://snomed.info/sct',
  name: 'SNOMEDCT_US',
  title: 'SNOMED CT (US Edition)',
  status: 'active',
  experimental: false,
  hierarchyMeaning: 'is-a',
  versionNeeded: false,
  content: 'not-present',
  property: [
    {
      code: 'parent',
      uri: 'http://hl7.org/fhir/concept-properties#parent',
      description: 'A SNOMED CT concept id that has the target of a direct is-a relationship from the concept',
      type: 'code',
    },
  ],
};

describe('CodeSystem $import', () => {
  let accessToken: string;
  let snomed: CodeSystem;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  beforeEach(async () => {
    accessToken = await initTestAuth({ superAdmin: true });
    expect(accessToken).toBeDefined();

    const resS = await request(app)
      .get(`/fhir/R4/CodeSystem?url=${snomedJSON.url}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(resS.status).toEqual(200);

    if (resS.body.entry.length === 1) {
      const resD = await request(app)
        .delete(`/fhir/R4/CodeSystem/${resS.body.entry[0].resource.id}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .send();
      expect(resD.status).toEqual(200);
    }

    const res = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(snomedJSON);
    expect(res.status).toEqual(201);
    snomed = res.body as CodeSystem;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Imports concepts and associated relationships', async () => {
    const res = await request(app)
      .post(`/fhir/R4/CodeSystem/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: snomed.url },
          { name: 'concept', valueCoding: { code: '184598004', display: 'Needle biopsy of brain (procedure)' } },
          { name: 'concept', valueCoding: { code: '702707005', display: 'Biopsy of head (procedure)' } },
          { name: 'concept', valueCoding: { code: '118690002', display: 'Procedure on head (procedure)' } },
          { name: 'concept', valueCoding: { code: '71388002', display: 'Procedure (procedure)' } },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '184598004' },
              { name: 'property', valueCode: 'parent' },
              { name: 'value', valueString: '702707005' },
            ],
          },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '702707005' },
              { name: 'property', valueCode: 'parent' },
              { name: 'value', valueString: '118690002' },
            ],
          },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '118690002' },
              { name: 'property', valueCode: 'parent' },
              { name: 'value', valueString: '71388002' },
            ],
          },
        ],
      } as Parameters);
    expect(res.status).toBe(200);

    const db = getClient();
    const coding = await new SelectQuery('Coding')
      .column('id')
      .where('system', '=', snomed.id)
      .where('code', '=', '702707005')
      .execute(db);
    expect(coding).toHaveLength(1);

    const target = await new SelectQuery('Coding')
      .column('id')
      .where('system', '=', snomed.id)
      .where('code', '=', '118690002')
      .execute(db);
    expect(target).toHaveLength(1);

    const property = await new SelectQuery('CodeSystem_Property')
      .column('id')
      .where('system', '=', snomed.id)
      .where('code', '=', 'parent')
      .execute(db);
    expect(property).toHaveLength(1);

    const relationship = await new SelectQuery('Coding_Property')
      .column('value')
      .column('target')
      .where('coding', '=', coding[0].id)
      .where('property', '=', property[0].id)
      .execute(db);
    expect(relationship).toHaveLength(1);
    expect(relationship[0].value).toEqual('118690002');
    expect(relationship[0].target).toEqual(target[0].id);
  });
});
