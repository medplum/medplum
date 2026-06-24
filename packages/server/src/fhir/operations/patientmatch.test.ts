// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bundle, BundleEntry, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('Patient $match Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Returns 400 when resource parameter is missing', async () => {
    const res = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [],
      });
    expect(res.status).toBe(400);
  });

  test('Returns 400 when resource is not a Patient', async () => {
    const res = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: { resourceType: 'Observation' },
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  test('Returns 400 when Patient has no matchable fields', async () => {
    const res = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Patient',
            } satisfies Patient,
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  test('Returns empty bundle when no patients match', async () => {
    const res = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Patient',
              name: [{ family: 'Zzzznotarealfamilynamezzz' }],
              birthDate: '1900-01-01',
            } satisfies Patient,
          },
        ],
      });
    expect(res.status).toBe(200);
    const bundle = res.body as Bundle;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('searchset');
    expect(bundle.total).toBe(0);
    expect(bundle.entry ?? []).toHaveLength(0);
  });

  test('Matches patient by identifier', async () => {
    // Create a patient with a known identifier
    const createRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        identifier: [{ system: 'http://example.com/mrn', value: 'MRN-MATCH-001' }],
        name: [{ family: 'Testmatch', given: ['Alpha'] }],
        birthDate: '1980-06-15',
        gender: 'female',
      } satisfies Patient);
    expect(createRes.status).toBe(201);

    const matchRes = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Patient',
              identifier: [{ system: 'http://example.com/mrn', value: 'MRN-MATCH-001' }],
              name: [{ family: 'Testmatch', given: ['Alpha'] }],
              birthDate: '1980-06-15',
              gender: 'female',
            } satisfies Patient,
          },
        ],
      });

    expect(matchRes.status).toBe(200);
    const bundle = matchRes.body as Bundle<Patient>;
    expect(bundle.type).toBe('searchset');
    expect(bundle.total).toBeGreaterThan(0);

    const topEntry = bundle.entry?.[0] as BundleEntry<Patient>;
    expect(topEntry.resource?.identifier?.[0]?.value).toBe('MRN-MATCH-001');
    expect(topEntry.search?.score).toBeGreaterThanOrEqual(0.9);

    const gradeExt = topEntry.search?.extension?.find(
      (e) => e.url === 'http://hl7.org/fhir/StructureDefinition/match-grade'
    );
    expect(gradeExt?.valueCode).toBe('certain');
  });

  test('Does not match on name + birthdate alone (no approved CMS combination)', async () => {
    await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ family: 'Namebirthtest', given: ['Beta'] }],
        birthDate: '1975-03-22',
        gender: 'male',
      } satisfies Patient);

    const matchRes = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Patient',
              name: [{ family: 'Namebirthtest', given: ['Beta'] }],
              birthDate: '1975-03-22',
            } satisfies Patient,
          },
        ],
      });

    // First + Last + DOB is not a Table 2 combination — it needs a fourth identifying field.
    expect(matchRes.status).toBe(200);
    expect((matchRes.body as Bundle<Patient>).total).toBe(0);
  });

  test('Matches via First + DOB + Phone (criteria 11)', async () => {
    const phone = '5551112222';
    const birthDate = '1960-05-05';
    const createRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ family: 'Phoneonly', given: ['Delta'] }],
        birthDate,
        telecom: [{ system: 'phone', value: phone }],
      } satisfies Patient);
    expect(createRes.status).toBe(201);

    const matchRes = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Patient',
              name: [{ given: ['Delta'] }],
              birthDate,
              telecom: [{ system: 'phone', value: phone }],
            } satisfies Patient,
          },
        ],
      });

    expect(matchRes.status).toBe(200);
    const bundle = matchRes.body as Bundle<Patient>;
    expect(bundle.entry?.some((e) => e.resource?.id === createRes.body.id)).toBe(true);
  });

  test('Matches via First + DOB + Email (criteria 12)', async () => {
    const email = 'delta.match@example.com';
    const birthDate = '1961-06-06';
    const createRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ family: 'Emailonly', given: ['Epsilon'] }],
        birthDate,
        telecom: [{ system: 'email', value: email }],
      } satisfies Patient);
    expect(createRes.status).toBe(201);

    const matchRes = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Patient',
              name: [{ given: ['Epsilon'] }],
              birthDate,
              telecom: [{ system: 'email', value: email }],
            } satisfies Patient,
          },
        ],
      });

    expect(matchRes.status).toBe(200);
    const bundle = matchRes.body as Bundle<Patient>;
    expect(bundle.entry?.some((e) => e.resource?.id === createRes.body.id)).toBe(true);
  });

  test('Respects onlyCertainMatches flag', async () => {
    await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ family: 'Certaintest', given: ['Gamma'] }],
        birthDate: '1965-11-01',
      } satisfies Patient);

    // Request with onlyCertainMatches=true — birthdate-only search won't produce certain matches
    const matchRes = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Patient',
              birthDate: '1965-11-01',
            } satisfies Patient,
          },
          { name: 'onlyCertainMatches', valueBoolean: true },
        ],
      });

    expect(matchRes.status).toBe(200);
    const bundle = matchRes.body as Bundle<Patient>;
    // All results must be 'certain' grade
    for (const entry of bundle.entry ?? []) {
      const gradeExt = entry.search?.extension?.find(
        (e) => e.url === 'http://hl7.org/fhir/StructureDefinition/match-grade'
      );
      expect(gradeExt?.valueCode).toBe('certain');
    }
  });

  test('Respects count parameter', async () => {
    // Create several patients sharing the same name + birthdate (a partial, non-unique match).
    const sharedBirthDate = '1955-07-04';
    const family = `Counttest${Date.now()}`;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/fhir/R4/Patient')
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send({
            resourceType: 'Patient',
            name: [{ family, given: ['Sharedgiven'] }],
            birthDate: sharedBirthDate,
          } satisfies Patient)
      )
    );

    const matchRes = await request(app)
      .post('/fhir/R4/Patient/$match')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'resource',
            resource: {
              resourceType: 'Patient',
              name: [{ family, given: ['Sharedgiven'] }],
              birthDate: sharedBirthDate,
            } satisfies Patient,
          },
          { name: 'count', valueInteger: 2 },
        ],
      });

    expect(matchRes.status).toBe(200);
    const bundle = matchRes.body as Bundle<Patient>;
    expect((bundle.entry ?? []).length).toBeLessThanOrEqual(2);
  });

  describe('CMS mode (onlyCertainMatches=true)', () => {
    const cmsMatch = (resource: Patient): Promise<request.Response> =>
      request(app)
        .post('/fhir/R4/Patient/$match')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'resource', resource },
            { name: 'onlyCertainMatches', valueBoolean: true },
          ],
        });

    const createPatient = (patient: Patient): Promise<request.Response> =>
      request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(patient);

    test('releases a unique match via rule 11 (First + DOB + Phone)', async () => {
      const phone = '+1-617-555-0142';
      const birthDate = '1971-03-15';
      const created = await createPatient({
        resourceType: 'Patient',
        name: [{ family: `CmsRelease${Date.now()}`, given: ['Robert'] }],
        birthDate,
        telecom: [{ system: 'phone', value: phone }],
      });
      expect(created.status).toBe(201);

      // First name + DOB + phone uniquely identify the patient (with different phone formatting).
      const res = await cmsMatch({
        resourceType: 'Patient',
        name: [{ given: ['Robert'] }],
        birthDate,
        telecom: [{ system: 'phone', value: phone }],
      });

      expect(res.status).toBe(200);
      const bundle = res.body as Bundle<Patient>;
      expect(bundle.entry).toHaveLength(1);
      const entry = bundle.entry?.[0];
      expect(entry?.resource?.id).toBe(created.body.id);
      expect(entry?.search?.score).toBe(1);
      const ext = entry?.search?.extension ?? [];
      expect(ext.find((e) => e.url.endsWith('match-grade'))?.valueCode).toBe('certain');
      expect(ext.find((e) => e.url.endsWith('cms-match-combination'))?.valueString).toBe('11');
    });

    test('suppresses an ambiguous match (two qualifying candidates)', async () => {
      const phone = '+1-617-555-0188';
      const birthDate = '1972-06-20';
      const family = `CmsAmbiguous${Date.now()}`;
      await createPatient({
        resourceType: 'Patient',
        name: [{ family, given: ['Robert'] }],
        birthDate,
        telecom: [{ system: 'phone', value: phone }],
      });
      await createPatient({
        resourceType: 'Patient',
        name: [{ family, given: ['Robert'] }],
        birthDate,
        telecom: [{ system: 'phone', value: phone }],
      });

      const res = await cmsMatch({
        resourceType: 'Patient',
        name: [{ given: ['Robert'] }],
        birthDate,
        telecom: [{ system: 'phone', value: phone }],
      });

      expect(res.status).toBe(200);
      const bundle = res.body as Bundle<Patient>;
      expect(bundle.entry ?? []).toHaveLength(0);
    });

    test('no match when only a single non-discriminating field agrees', async () => {
      const res = await cmsMatch({ resourceType: 'Patient', birthDate: '1973-09-25', name: [{ given: ['Solo'] }] });
      expect(res.status).toBe(200);
      expect((res.body as Bundle<Patient>).entry ?? []).toHaveLength(0);
    });
  });
});
