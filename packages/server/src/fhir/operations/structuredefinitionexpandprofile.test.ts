import { USCoreStructureDefinitionList } from '@medplum/mock';
import { ContentType, HTTP_HL7_ORG } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { loadTestConfig } from '../../config';
import { initApp, shutdownApp } from '../../app';
import { createTestProject } from '../../test.setup';
import { Bundle, StructureDefinition } from '@medplum/fhirtypes';

jest.mock('node-fetch');

const app = express();

async function createSDs(profileUrls: string[], accessToken: string): Promise<void> {
  for (const profileUrl of profileUrls) {
    const sd = USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl);

    if (!sd) {
      fail(`could not find structure definition for ${profileUrl}`);
    }
    const res = await request(app)
      .post(`/fhir/R4/StructureDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(sd);
    expect(res.status).toEqual(201);
  }
}

describe('StructureDefinition $expand-profile', () => {
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  beforeEach(async () => {
    // A new project per test since tests are dependent on SDs being within search scope or not.
    const project = await createTestProject();
    accessToken = project.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success with nested profiles', async () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    const expectedProfiles = [
      profileUrl,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-birthsex`,
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-genderIdentity`,
    ];
    await createSDs(expectedProfiles, accessToken);

    const res = await request(app)
      .get(`/fhir/R4/StructureDefinition/$expand-profile?url=${profileUrl}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toEqual(200);
    expect(res.body.resourceType).toEqual('Bundle');

    const bundle = res.body as Bundle<StructureDefinition>;
    expect(bundle.entry?.length).toEqual(expectedProfiles.length);
    for (const entry of bundle.entry || []) {
      expect(expectedProfiles.includes(entry.resource?.url ?? '')).toEqual(true);
    }
  });

  test('Success with missing nested profiles', async () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
    // us-core-patient references several other profiles, but they are not in the database
    // so we expect to only get the profiles that are
    const expectedProfiles = [profileUrl, `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`];
    await createSDs(expectedProfiles, accessToken);

    const res = await request(app)
      .get(`/fhir/R4/StructureDefinition/$expand-profile?url=${profileUrl}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toEqual(200);
    expect(res.body.resourceType).toEqual('Bundle');

    const bundle = res.body as Bundle<StructureDefinition>;
    expect(bundle.entry?.length).toEqual(expectedProfiles.length);
    for (const entry of bundle.entry || []) {
      expect(expectedProfiles.includes(entry.resource?.url ?? '')).toEqual(true);
    }
  });

  test('Profile not found', async () => {
    const profileUrl = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`;

    // Note that nothing is created in the database, so we expect an empty bundle

    const res = await request(app)
      .get(`/fhir/R4/StructureDefinition/$expand-profile?url=${profileUrl}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toEqual(400);
  });

  test('Profile URL not specified', async () => {
    const res = await request(app)
      .get(`/fhir/R4/StructureDefinition/$expand-profile`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toEqual(400);
  });
});
