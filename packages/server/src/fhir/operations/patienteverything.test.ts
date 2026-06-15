// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, LOINC, createReference, getReferenceString } from '@medplum/core';
import type {
  Binary,
  Bundle,
  BundleEntry,
  Condition,
  DocumentReference,
  Observation,
  Organization,
  Patient,
  Practitioner,
  Resource,
} from '@medplum/fhirtypes';
import express from 'express';
import { Readable } from 'node:stream';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { createTestProject, initTestAuth } from '../../test.setup';
import {
  getBinaryAttachmentToInline,
  readBinaryAttachmentResource,
  readStreamToBufferWithLimit,
  searchPatientCompartment,
} from './patienteverything';

const app = express();
let accessToken: string;

describe('Patient Everything Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    // Create organization
    const orgRes = await request(app)
      .post(`/fhir/R4/Organization`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Organization' });
    expect(orgRes.status).toBe(201);
    const organization = orgRes.body as Organization;

    // Create practitioner
    const practRes = await request(app)
      .post(`/fhir/R4/Practitioner`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Practitioner',
        qualification: [{ code: { text: 'MD' }, issuer: createReference(organization) }],
      });
    expect(practRes.status).toBe(201);
    const practitioner = practRes.body as Practitioner;

    // Create patient
    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        address: [{ use: 'home', line: ['123 Main St'], city: 'Anywhere', state: 'CA', postalCode: '90210' }],
        telecom: [
          { system: 'phone', value: '555-555-5555' },
          { system: 'email', value: 'alice@example.com' },
        ],
        managingOrganization: createReference(organization),
      } satisfies Patient);
    expect(res1.status).toBe(201);
    const patient = res1.body as Patient;

    // Create observation
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(patient),
        performer: [createReference(practitioner), createReference(organization)],
      } satisfies Observation);
    expect(res2.status).toBe(201);
    const observation = res2.body as Observation;

    // Create condition
    // This condition references the patient twice, once as subject and once as asserter
    // This is to test that the condition is only returned once
    const res3 = await request(app)
      .post(`/fhir/R4/Condition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Condition',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        asserter: createReference(patient),
        subject: createReference(patient),
        recorder: createReference(practitioner),
      } satisfies Condition);
    expect(res3.status).toBe(201);
    const condition = res3.body as Condition;

    // Execute the operation
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);
    const result = res4.body as Bundle;
    expect(result.entry?.length).toStrictEqual(5);
    expect(
      result.entry?.map((e) => `${e.search?.mode}:${getReferenceString(e.resource as Resource)}`).sort()
    ).toStrictEqual([
      'include:' + getReferenceString(organization),
      'include:' + getReferenceString(practitioner),
      'match:' + getReferenceString(condition),
      'match:' + getReferenceString(observation),
      'match:' + getReferenceString(patient),
    ]);

    // Create another observation
    const res5 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(patient),
        performer: [createReference(practitioner), createReference(organization)],
      } satisfies Observation);
    expect(res5.status).toBe(201);
    const newObservation = res5.body as Observation;

    // Execute the operation with _since
    const res6 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything?_since=${newObservation.meta?.lastUpdated}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);
    const sinceResult = res6.body as Bundle;
    expect(
      sinceResult.entry?.map((e) => `${e.search?.mode}:${getReferenceString(e.resource as Resource)}`).sort()
    ).toStrictEqual([
      'include:' + getReferenceString(organization),
      'include:' + getReferenceString(practitioner),
      'match:' + getReferenceString(newObservation),
    ]);

    // Execute the operation with _count and _offset
    const res7 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything?_count=1&_offset=1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(200);

    // Bundle should have pagination links
    const bundle = res7.body as Bundle;
    expect(bundle.link).toBeDefined();
    expect(bundle.link?.some((link) => link.relation === 'next')).toBeTruthy();
    expect(bundle.link?.some((link) => link.relation === 'first')).toBeTruthy();
    expect(bundle.link?.some((link) => link.relation === 'previous')).toBeTruthy();
    for (const link of bundle.link ?? []) {
      const url = new URL(link.url);
      expect(url.pathname).toBe(`/fhir/R4/Patient/${patient.id}/$everything`);
      expect(url.searchParams.has('_compartment')).toBe(false);
      expect(url.searchParams.has('_sort')).toBe(false);
      expect(url.searchParams.has('_type')).toBe(false);
      expect(url.searchParams.get('_count')).toBe('1');
    }
    expect(
      new URL(bundle.link?.find((link) => link.relation === 'next')?.url as string).searchParams.get('_offset')
    ).toBe('2');

    // Execute the operation with _type
    const res8 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything?_count=1&_type=Observation`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res8.status).toBe(200);
    const typeBundle = res8.body as Bundle;
    for (const link of typeBundle.link ?? []) {
      const url = new URL(link.url);
      expect(url.pathname).toBe(`/fhir/R4/Patient/${patient.id}/$everything`);
      expect(url.searchParams.get('_type')).toBe('Observation');
      expect(url.searchParams.has('_compartment')).toBe(false);
    }

    // Execute the operation with "start" and "end" parameters
    const res9 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything?start=2020-01-01&end=2040-01-01`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res9.status).toBe(200);
  });

  test('Inline DocumentReference attachments', async () => {
    // Create patient
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient', name: [{ given: ['Bob'], family: 'Jones' }] } satisfies Patient);
    expect(patientRes.status).toBe(201);
    const patient = patientRes.body as Patient;

    // Upload a binary
    const binaryRes = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Hello attachment');
    expect(binaryRes.status).toBe(201);
    const binary = binaryRes.body as Binary;

    // Create a DocumentReference pointing to the binary
    const docRefRes = await request(app)
      .post('/fhir/R4/DocumentReference')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'DocumentReference',
        status: 'current',
        subject: createReference(patient),
        content: [{ attachment: { url: binary.url } }],
      } satisfies DocumentReference);
    expect(docRefRes.status).toBe(201);

    // Without _inlineAttachments, the URL should remain
    const withoutInline = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(withoutInline.status).toBe(200);
    const bundleWithout = withoutInline.body as Bundle;
    const docRefWithout = bundleWithout.entry
      ?.map((e) => e.resource)
      .find((r): r is DocumentReference => r?.resourceType === 'DocumentReference');
    expect(docRefWithout?.content?.[0]?.attachment?.url).toBeDefined();
    expect(docRefWithout?.content?.[0]?.attachment?.data).toBeUndefined();

    const previousMaxTotal = getConfig().inlineAttachmentsMaxTotalBytes;
    getConfig().inlineAttachmentsMaxTotalBytes = 1024;
    try {
      // With _inlineAttachments=true, the attachment should be base64-encoded inline data
      const withInline = await request(app)
        .get(`/fhir/R4/Patient/${patient.id}/$everything?_inlineAttachments=true`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(withInline.status).toBe(200);
      const bundleWith = withInline.body as Bundle;
      const docRefWith = bundleWith.entry
        ?.map((e) => e.resource)
        .find((r): r is DocumentReference => r?.resourceType === 'DocumentReference');
      expect(docRefWith?.content?.[0]?.attachment?.url).toBeUndefined();
      expect(docRefWith?.content?.[0]?.attachment?.contentType).toBe(ContentType.TEXT);
      expect(docRefWith?.content?.[0]?.attachment?.data).toBeDefined();
      expect(Buffer.from(docRefWith?.content?.[0]?.attachment?.data ?? '', 'base64').toString('utf8')).toBe(
        'Hello attachment'
      );
    } finally {
      getConfig().inlineAttachmentsMaxTotalBytes = previousMaxTotal;
    }
  });

  test('Project setting enables inline DocumentReference attachments', async () => {
    const previousMaxTotal = getConfig().inlineAttachmentsMaxTotalBytes;
    getConfig().inlineAttachmentsMaxTotalBytes = 1024;
    const { accessToken: projectAccessToken } = await createTestProject({
      project: {
        setting: [{ name: 'patientEverythingInlineAttachments', valueBoolean: true }],
      },
      withAccessToken: true,
    });

    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + projectAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient', name: [{ given: ['Project'], family: 'Setting' }] } satisfies Patient);
    expect(patientRes.status).toBe(201);
    const patient = patientRes.body as Patient;

    const binaryRes = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + projectAccessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('Project setting attachment');
    expect(binaryRes.status).toBe(201);
    const binary = binaryRes.body as Binary;

    const docRefRes = await request(app)
      .post('/fhir/R4/DocumentReference')
      .set('Authorization', 'Bearer ' + projectAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'DocumentReference',
        status: 'current',
        subject: createReference(patient),
        content: [{ attachment: { url: binary.url, contentType: ContentType.TEXT } }],
      } satisfies DocumentReference);
    expect(docRefRes.status).toBe(201);

    try {
      const res = await request(app)
        .get(`/fhir/R4/Patient/${patient.id}/$everything`)
        .set('Authorization', 'Bearer ' + projectAccessToken);
      expect(res.status).toBe(200);
      const bundle = res.body as Bundle;
      const docRef = findDocumentReference(bundle);
      expect(docRef?.content?.[0]?.attachment?.url).toBeUndefined();
      expect(Buffer.from(docRef?.content?.[0]?.attachment?.data ?? '', 'base64').toString('utf8')).toBe(
        'Project setting attachment'
      );

      const optOutRes = await request(app)
        .get(`/fhir/R4/Patient/${patient.id}/$everything?_inlineAttachments=false`)
        .set('Authorization', 'Bearer ' + projectAccessToken);
      expect(optOutRes.status).toBe(200);
      const optOutDocRef = findDocumentReference(optOutRes.body as Bundle);
      expect(optOutDocRef?.content?.[0]?.attachment?.url).toBeDefined();
      expect(optOutDocRef?.content?.[0]?.attachment?.data).toBeUndefined();
    } finally {
      getConfig().inlineAttachmentsMaxTotalBytes = previousMaxTotal;
    }
  });

  test('Skips inlining attachments when the attachment cannot fit or be read', async () => {
    const previousMaxTotal = getConfig().inlineAttachmentsMaxTotalBytes;
    getConfig().inlineAttachmentsMaxTotalBytes = 5;
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient', name: [{ given: ['Max'], family: 'SizeTest' }] } satisfies Patient);
    expect(patientRes.status).toBe(201);
    const patient = patientRes.body as Patient;

    const binaryRes = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('123456');
    expect(binaryRes.status).toBe(201);
    const binary = binaryRes.body as Binary;

    const secondBinaryRes = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('67890');
    expect(secondBinaryRes.status).toBe(201);
    const secondBinary = secondBinaryRes.body as Binary;

    const thirdBinaryRes = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('x');
    expect(thirdBinaryRes.status).toBe(201);
    const thirdBinary = thirdBinaryRes.body as Binary;

    const docRefRes = await request(app)
      .post('/fhir/R4/DocumentReference')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'DocumentReference',
        status: 'current',
        subject: createReference(patient),
        content: [
          { attachment: { url: binary.url, contentType: ContentType.TEXT } },
          { attachment: { url: 'https://example.com/external.txt', contentType: ContentType.TEXT } },
          {
            attachment: {
              url: 'Binary/00000000-0000-4000-8000-000000000003',
              contentType: ContentType.TEXT,
            },
          },
          {
            attachment: {
              url: `Binary/${secondBinary.id}/_history/${secondBinary.meta?.versionId}`,
              contentType: ContentType.TEXT,
            },
          },
          { attachment: { url: thirdBinary.url, contentType: ContentType.TEXT } },
        ],
      } satisfies DocumentReference);
    expect(docRefRes.status).toBe(201);

    try {
      const res = await request(app)
        .get(`/fhir/R4/Patient/${patient.id}/$everything?_inlineAttachments=true`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toBe(200);
      const bundle = res.body as Bundle;
      const docRef = findDocumentReference(bundle);
      expect(docRef?.content?.[0]?.attachment?.url).toBeDefined();
      expect(docRef?.content?.[0]?.attachment?.data).toBeUndefined();
      expect(docRef?.content?.[1]?.attachment?.url).toBeDefined();
      expect(docRef?.content?.[1]?.attachment?.data).toBeUndefined();
      expect(docRef?.content?.[2]?.attachment?.url).toBeDefined();
      expect(docRef?.content?.[2]?.attachment?.data).toBeUndefined();
      expect(docRef?.content?.[3]?.attachment?.url).toBeUndefined();
      expect(Buffer.from(docRef?.content?.[3]?.attachment?.data ?? '', 'base64').toString('utf8')).toBe('67890');
      expect(docRef?.content?.[4]?.attachment?.url).toBeDefined();
      expect(docRef?.content?.[4]?.attachment?.data).toBeUndefined();
    } finally {
      getConfig().inlineAttachmentsMaxTotalBytes = previousMaxTotal;
    }
  });
});

function findDocumentReference(bundle: Bundle): DocumentReference | undefined {
  return bundle.entry
    ?.map((e) => e.resource)
    .find((r): r is DocumentReference => r?.resourceType === 'DocumentReference');
}

describe('Patient Everything inline attachments helpers', () => {
  test('Identifies inlineable Binary attachments', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const versionId = '00000000-0000-4000-8000-000000000002';
    const attachment = { url: `Binary/${id}/_history/${versionId}` };

    expect(getBinaryAttachmentToInline({ attachment })).toEqual({ attachment, id, versionId });
    expect(getBinaryAttachmentToInline({ attachment: { data: 'SGVsbG8=' } })).toBeUndefined();
    expect(getBinaryAttachmentToInline({ attachment: { url: 'https://example.com/file.txt' } })).toBeUndefined();
  });

  test('Reads current and versioned Binary attachments', async () => {
    const binary = { resourceType: 'Binary', id: 'binary-id' } as Binary;
    const versionedBinary = { resourceType: 'Binary', id: 'binary-id', meta: { versionId: 'version-id' } } as Binary;
    const repo = {
      readResource: jest.fn().mockResolvedValue(binary),
      readVersion: jest.fn().mockResolvedValue(versionedBinary),
    };

    await expect(readBinaryAttachmentResource(repo, 'binary-id')).resolves.toBe(binary);
    expect(repo.readResource).toHaveBeenCalledWith('Binary', 'binary-id');

    await expect(readBinaryAttachmentResource(repo, 'binary-id', 'version-id')).resolves.toBe(versionedBinary);
    expect(repo.readVersion).toHaveBeenCalledWith('Binary', 'binary-id', 'version-id');
  });

  test('Reads string and Buffer stream chunks into a Buffer', async () => {
    const buffer = await readStreamToBufferWithLimit(Readable.from(['Hello ', Buffer.from('attachment')]), 1024);

    expect(buffer?.toString('utf8')).toBe('Hello attachment');
  });

  test('Returns undefined and destroys the stream when the max byte count is exceeded', async () => {
    const stream = Readable.from([Buffer.from('123'), Buffer.from('456')]);
    const destroySpy = jest.spyOn(stream, 'destroy');

    await expect(readStreamToBufferWithLimit(stream, 5)).resolves.toBeUndefined();
    expect(destroySpy).toHaveBeenCalled();
  });
});

describe('searchPatientCompartment', () => {
  beforeEach(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterEach(async () => {
    await shutdownApp();
  });

  test('Successfully paginates through resource types', async () => {
    const { repo } = await createTestProject({ withRepo: true });
    const organization = await repo.createResource<Organization>({ resourceType: 'Organization' });
    const practitioner = await repo.createResource<Practitioner>({ resourceType: 'Practitioner' });
    const patient = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [{ use: 'home', line: ['123 Main St'], city: 'Anywhere', state: 'CA', postalCode: '90210' }],
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
      managingOrganization: createReference(organization),
    });
    const observation = await repo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: LOINC, code: '12345-6' }] },
      subject: createReference(patient),
      performer: [createReference(practitioner), createReference(organization)],
    });

    // This condition references the patient twice, once as subject and once as asserter
    // This is to test that the condition is only returned once
    const condition = await repo.createResource({
      resourceType: 'Condition',
      code: { coding: [{ system: LOINC, code: '12345-6' }] },
      asserter: createReference(patient),
      subject: createReference(patient),
      recorder: createReference(practitioner),
    });

    // Force search to paginate to ensure that it's handled correctly
    const results: BundleEntry[] = [];
    let offset = 0;
    while (offset < 100) {
      const bundle = await searchPatientCompartment(repo, patient, { count: 1, offset });
      if (bundle.entry?.length) {
        results.push(...bundle.entry);
        offset += bundle.entry.length;
      } else {
        break;
      }
    }
    expect(results).toHaveLength(3);
    expect(results).toStrictEqual(
      expect.arrayContaining<BundleEntry>([
        expect.objectContaining({ resource: patient, search: { mode: 'match' } }),
        expect.objectContaining({ resource: observation, search: { mode: 'match' } }),
        expect.objectContaining({ resource: condition, search: { mode: 'match' } }),
      ])
    );
  });
});
