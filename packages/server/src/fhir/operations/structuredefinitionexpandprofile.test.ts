import { ContentType, HTTP_HL7_ORG } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, ElementDefinition, StructureDefinition, StructureDefinitionSnapshot } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

jest.mock('node-fetch');

const app = express();

describe('StructureDefinition $expand-profile', () => {
  let USCoreStructureDefinitions: StructureDefinition[];
  let accessToken: string;

  async function createSDs(profileUrls: string[], accessToken: string): Promise<void> {
    for (const profileUrl of profileUrls) {
      const sd = USCoreStructureDefinitions.find((sd) => sd.url === profileUrl);

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

  beforeAll(async () => {
    USCoreStructureDefinitions = readJson('fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  beforeEach(async () => {
    // A new project per test since tests are dependent on SDs being within search scope or not.
    accessToken = await initTestAuth();
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
      .post(`/fhir/R4/StructureDefinition/$expand-profile?url=${profileUrl}`)
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
      .post(`/fhir/R4/StructureDefinition/$expand-profile?url=${profileUrl}`)
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
      .post(`/fhir/R4/StructureDefinition/$expand-profile?url=${profileUrl}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toEqual(400);
  });

  test('Profile URL not specified', async () => {
    const res = await request(app)
      .post(`/fhir/R4/StructureDefinition/$expand-profile`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toEqual(400);
  });

  test('Circuit breaker for deeply nested profiles', async () => {
    const extensionCount = 10;
    const sds = await createNestedStructureDefinitions(accessToken, extensionCount);
    const sdUrls = sds.map((sd) => sd.url);
    expect(sds.length).toBe(extensionCount + 1);
    const profileUrl = sds[0].url;
    const res = await request(app)
      .post(`/fhir/R4/StructureDefinition/$expand-profile?url=${profileUrl}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toEqual(200);
    const bundle = res.body as Bundle<StructureDefinition>;
    expect(bundle.entry?.length).toEqual(sds.length);
    for (const entry of bundle.entry || []) {
      expect(sdUrls.includes(entry.resource?.url ?? '')).toEqual(true);
    }
  });

  test('Circuit breaker for too deeply nested profiles', async () => {
    const extensionCount = 11;
    const sds = await createNestedStructureDefinitions(accessToken, extensionCount);
    const sdUrls = sds.map((sd) => sd.url);
    expect(sds.length).toBe(extensionCount + 1);
    const profileUrl = sds[0].url;
    const res = await request(app)
      .post(`/fhir/R4/StructureDefinition/$expand-profile?url=${profileUrl}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toEqual(200);
    const bundle = res.body as Bundle<StructureDefinition>;
    expect(bundle.entry?.length).toEqual(sds.length - 1); // -1 because the last extension was not recursed due to circuit breaker

    for (const sdUrl of sdUrls.slice(0, -1)) {
      expect(bundle.entry?.some((entry) => entry.resource?.url === sdUrl)).toEqual(true);
    }

    const missingSdUrl = sdUrls[sdUrls.length - 1];
    expect(bundle.entry?.some((entry) => entry.resource?.url === missingSdUrl)).toEqual(false);
  });
});

async function createNestedStructureDefinitions(
  accessToken: string,
  extensionDepthCount: number
): Promise<StructureDefinition[]> {
  if (extensionDepthCount < 1) {
    throw new Error('extensionDepthCount must be at least one');
  }

  const sds: StructureDefinition[] = [];
  const sd: StructureDefinition = {
    resourceType: 'StructureDefinition',
    id: 'deeply-nested',
    url: 'http://hl7.org/fhir/StructureDefinition/deeply-nested-profile',
    name: 'DeeplyNestedProfile',
    experimental: true,
    date: '2024-02-07',
    description: '',
    kind: 'resource',
    abstract: false,
    status: 'draft',
    type: 'Patient',
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
    derivation: 'constraint',
    snapshot: {
      element: [
        {
          id: 'Patient',
          path: 'Patient',
          definition: '\\-',
          min: 0,
          max: '*',
          base: { path: 'Patient', min: 0, max: '*' },
          isModifier: false,
          isSummary: false,
        },
        {
          id: 'Patient.extension',
          path: 'Patient.extension',
          definition: '\\-',
          slicing: { discriminator: [{ type: 'value', path: 'url' }], ordered: false, rules: 'open' },
          min: 0,
          max: '*',
          base: { path: 'DomainResource.extension', min: 0, max: '*' },
          type: [{ code: 'Extension' }],
          isModifier: false,
          isSummary: false,
        },
        {
          id: 'Patient.extension:someExtension',
          path: 'Patient.extension',
          definition: '\\-',
          sliceName: 'someExtension',
          min: 0,
          max: '1',
          base: { path: 'DomainResource.extension', min: 0, max: '*' },
          type: [{ code: 'Extension', profile: [getExtensionUrl(0)] }],
        },
      ],
    },
  };

  sds.push(sd);
  for (let i = 0; i < extensionDepthCount; i++) {
    const extension = createExtension(
      `nested-extension-${i}`,
      getExtensionUrl(i),
      i === extensionDepthCount - 1 ? undefined : getExtensionUrl(i + 1)
    );

    sds.push(extension);
  }

  for (const sd of sds) {
    const res = await request(app)
      .post(`/fhir/R4/StructureDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(sd);
    expect(res.status).toEqual(201);
  }

  return sds;
}

function getExtensionUrl(index: number): string {
  return `${HTTP_HL7_ORG}/fhir/StructureDefinition/deeply-nested-extension-${index}`;
}

function createExtension(id: string, url: string, nestedExtensionUrl: string | undefined): StructureDefinition {
  let nestedExtensionElement: ElementDefinition | undefined;
  if (nestedExtensionUrl) {
    nestedExtensionElement = {
      id: 'Extension.extension:nestedExtension',
      path: 'Extension.extension',
      definition: '\\-',
      sliceName: 'nestedExtension',
      min: 0,
      max: '1',
      base: { path: 'Extension.extension', min: 0, max: '*' },
      type: [{ code: 'Extension', profile: [nestedExtensionUrl] }],
      mustSupport: true,
      isModifier: false,
      isSummary: false,
    };
  }

  const extension: StructureDefinition & { snapshot: StructureDefinitionSnapshot } = {
    resourceType: 'StructureDefinition',
    id,
    url,
    name: 'DeeplyNestedExtension',
    title: 'Deeply Nested Extension',
    status: 'draft',
    description: 'An arbitrarily deeply nested extension for testing purposes',
    fhirVersion: '4.0.1',
    kind: 'complex-type',
    abstract: false,
    type: 'Extension',
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Extension',
    derivation: 'constraint',
    context: [{ type: 'element', expression: 'Element' }],
    snapshot: {
      element: [
        {
          id: 'Extension',
          path: 'Extension',
          definition: '\\-',
          min: 0,
          max: '*',
          base: { path: 'Extension', min: 0, max: '*' },
          isModifier: false,
        },
        {
          id: 'Extension.id',
          path: 'Extension.id',
          definition: '\\-',
          min: 0,
          max: '1',
          base: { path: 'Extension.id', min: 0, max: '*' },
          type: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type',
                  valueUrl: 'string',
                },
              ],
              code: 'http://hl7.org/fhirpath/System.String',
            },
          ],
          isModifier: false,
          isSummary: false,
        },
        {
          id: 'Extension.extension',
          path: 'Extension.extension',
          definition: '\\-',
          slicing: {
            discriminator: [
              {
                type: 'value',
                path: 'url',
              },
            ],
            description: 'Extensions are always sliced by (at least) url',
            rules: 'open',
          },
          min: 0,
          max: '*',
          base: { path: 'Extension.extension', min: 0, max: '*' },
          type: [
            {
              code: 'Extension',
            },
          ],
          isModifier: false,
          isSummary: false,
        },
      ],
    },
  };

  if (nestedExtensionElement) {
    extension.snapshot.element.push(nestedExtensionElement);
  }

  return extension;
}
