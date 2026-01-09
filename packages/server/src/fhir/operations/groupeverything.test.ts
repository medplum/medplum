// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, LOINC, createReference, getReferenceString } from '@medplum/core';
import type { Bundle, Group, Observation, Organization, Patient, Practitioner, Resource } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('Group Everything Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success with multiple patients', async () => {
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

    // Create first patient
    const patient1Res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        managingOrganization: createReference(organization),
      } satisfies Patient);
    expect(patient1Res.status).toBe(201);
    const patient1 = patient1Res.body as Patient;

    // Create observation for first patient
    const obs1Res = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(patient1),
        performer: [createReference(practitioner)],
      } satisfies Observation);
    expect(obs1Res.status).toBe(201);
    const observation1 = obs1Res.body as Observation;

    // Create second patient
    const patient2Res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Bob'], family: 'Jones' }],
        managingOrganization: createReference(organization),
      } satisfies Patient);
    expect(patient2Res.status).toBe(201);
    const patient2 = patient2Res.body as Patient;

    // Create observation for second patient
    const obs2Res = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '67890-1' }] },
        subject: createReference(patient2),
        performer: [createReference(practitioner)],
      } satisfies Observation);
    expect(obs2Res.status).toBe(201);
    const observation2 = obs2Res.body as Observation;

    // Create a group with both patients
    const groupRes = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [{ entity: createReference(patient1) }, { entity: createReference(patient2) }],
      } satisfies Group);
    expect(groupRes.status).toBe(201);
    const group = groupRes.body as Group;

    // Execute the operation
    const everythingRes = await request(app)
      .get(`/fhir/R4/Group/${group.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(everythingRes.status).toBe(200);

    const result = everythingRes.body as Bundle;
    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('searchset');
    expect(result.total).toBeGreaterThanOrEqual(6);

    // Verify all expected resources are included
    const resourceRefs = result.entry?.map((e) => getReferenceString(e.resource as Resource)) || [];
    expect(resourceRefs).toContain(getReferenceString(group));
    expect(resourceRefs).toContain(getReferenceString(patient1));
    expect(resourceRefs).toContain(getReferenceString(patient2));
    expect(resourceRefs).toContain(getReferenceString(observation1));
    expect(resourceRefs).toContain(getReferenceString(observation2));
    expect(resourceRefs).toContain(getReferenceString(organization));
    expect(resourceRefs).toContain(getReferenceString(practitioner));

    // Verify all entries have search mode
    for (const entry of result.entry || []) {
      expect(entry.search?.mode).toBeDefined();
      expect(['match', 'include']).toContain(entry.search?.mode);
    }

    // Verify the group itself has match mode
    const groupEntry = result.entry?.find((e) => e.resource?.resourceType === 'Group');
    expect(groupEntry?.search?.mode).toBe('match');

    // Verify patients have match mode
    const patientEntries = result.entry?.filter((e) => e.resource?.resourceType === 'Patient');
    for (const entry of patientEntries || []) {
      expect(entry.search?.mode).toBe('match');
    }
  });

  test('Success with empty group', async () => {
    // Create an empty group
    const groupRes = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'person',
        actual: true,
      } satisfies Group);
    expect(groupRes.status).toBe(201);
    const group = groupRes.body as Group;

    // Execute the operation
    const everythingRes = await request(app)
      .get(`/fhir/R4/Group/${group.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(everythingRes.status).toBe(200);

    const result = everythingRes.body as Bundle;
    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('searchset');
    expect(result.entry?.length).toBe(1);
    expect(getReferenceString(result.entry?.[0]?.resource as Resource)).toBe(getReferenceString(group));
    expect(result.entry?.[0]?.search?.mode).toBe('match');
  });

  test('Success with POST method', async () => {
    // Create a patient
    const patientRes = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Charlie'], family: 'Brown' }],
      } satisfies Patient);
    expect(patientRes.status).toBe(201);
    const patient = patientRes.body as Patient;

    // Create a group
    const groupRes = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [{ entity: createReference(patient) }],
      } satisfies Group);
    expect(groupRes.status).toBe(201);
    const group = groupRes.body as Group;

    // Execute the operation with POST
    const everythingRes = await request(app)
      .post(`/fhir/R4/Group/${group.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(everythingRes.status).toBe(200);

    const result = everythingRes.body as Bundle;
    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('searchset');
    expect(result.entry?.length).toBeGreaterThanOrEqual(2);
  });

  test('Not found', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Group/00000000-0000-0000-0000-000000000000/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Handles non-patient members', async () => {
    // Create a practitioner
    const practRes = await request(app)
      .post(`/fhir/R4/Practitioner`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Practitioner',
        name: [{ given: ['Doctor'], family: 'Who' }],
      });
    expect(practRes.status).toBe(201);
    const practitioner = practRes.body as Practitioner;

    // Create a group with a non-patient member
    const groupRes = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'practitioner',
        actual: true,
        member: [{ entity: createReference(practitioner) }],
      } satisfies Group);
    expect(groupRes.status).toBe(201);
    const group = groupRes.body as Group;

    // Execute the operation
    const everythingRes = await request(app)
      .get(`/fhir/R4/Group/${group.id}/$everything`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(everythingRes.status).toBe(200);

    const result = everythingRes.body as Bundle;
    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('searchset');
    expect(result.entry?.length).toBe(2);

    const resourceRefs = result.entry?.map((e) => getReferenceString(e.resource as Resource)) || [];
    expect(resourceRefs).toContain(getReferenceString(group));
    expect(resourceRefs).toContain(getReferenceString(practitioner));
  });

  test('Pagination with _count and _offset', async () => {
    // Create patients
    const patient1Res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Pagination'], family: 'Test1' }],
      } satisfies Patient);
    expect(patient1Res.status).toBe(201);
    const patient1 = patient1Res.body as Patient;

    const patient2Res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Pagination'], family: 'Test2' }],
      } satisfies Patient);
    expect(patient2Res.status).toBe(201);
    const patient2 = patient2Res.body as Patient;

    // Create observations for each patient
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/fhir/R4/Observation`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: LOINC, code: `test-${i}` }] },
          subject: createReference(patient1),
        } satisfies Observation);
    }

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/fhir/R4/Observation`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: LOINC, code: `test-${i + 3}` }] },
          subject: createReference(patient2),
        } satisfies Observation);
    }

    // Create a group with both patients
    const groupRes = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [{ entity: createReference(patient1) }, { entity: createReference(patient2) }],
      } satisfies Group);
    expect(groupRes.status).toBe(201);
    const group = groupRes.body as Group;

    // Execute the operation with pagination
    const everythingRes = await request(app)
      .get(`/fhir/R4/Group/${group.id}/$everything?_count=3&_offset=1`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(everythingRes.status).toBe(200);

    const result = everythingRes.body as Bundle;
    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('searchset');

    // Should have pagination links
    expect(result.link).toBeDefined();
    expect(result.link?.some((link) => link.relation === 'self')).toBeTruthy();
    expect(result.link?.some((link) => link.relation === 'first')).toBeTruthy();
    expect(result.link?.some((link) => link.relation === 'next')).toBeTruthy();
    expect(result.link?.some((link) => link.relation === 'previous')).toBeTruthy();

    // Verify entry count respects _count
    expect(result.entry?.length).toBeLessThanOrEqual(3);
  });
});
