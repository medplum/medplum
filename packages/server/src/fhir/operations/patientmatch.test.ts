// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType } from '@medplum/core';
import type { Bundle, BundleEntry, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import { scoreCandidate } from './patientmatch';

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

  test('Matches patient by name and birthdate', async () => {
    const createRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ family: 'Namebirthtest', given: ['Beta'] }],
        birthDate: '1975-03-22',
        gender: 'male',
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
              name: [{ family: 'Namebirthtest', given: ['Beta'] }],
              birthDate: '1975-03-22',
            } satisfies Patient,
          },
        ],
      });

    expect(matchRes.status).toBe(200);
    const bundle = matchRes.body as Bundle<Patient>;
    expect(bundle.total).toBeGreaterThan(0);

    const topEntry = bundle.entry?.[0] as BundleEntry<Patient>;
    expect(topEntry.resource?.name?.[0]?.family).toBe('Namebirthtest');
    expect(topEntry.search?.score).toBeGreaterThan(0);
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
    // Create several patients sharing the same birthdate
    const sharedBirthDate = '1955-07-04';
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/fhir/R4/Patient')
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send({
            resourceType: 'Patient',
            name: [{ family: `Counttest${Date.now()}`, given: [`Patient${i}`] }],
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
});

describe('scoreCandidate', () => {
  const baseCandidate: WithId<Patient> = {
    resourceType: 'Patient' as const,
    id: 'test-id',
    meta: { versionId: '1', lastUpdated: '2024-01-01T00:00:00Z' },
    name: [{ family: 'Smith', given: ['John'] }],
    birthDate: '1990-01-01',
    gender: 'male' as const,
    identifier: [{ system: 'http://example.com/mrn', value: 'MRN123' }],
  };

  test('Perfect match scores 1.0', () => {
    const input: Patient = {
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      birthDate: '1990-01-01',
      gender: 'male',
      identifier: [{ system: 'http://example.com/mrn', value: 'MRN123' }],
    };
    const { score, grade } = scoreCandidate(baseCandidate, input);
    expect(score).toBe(1.0);
    expect(grade).toBe('certain');
  });

  test('Identifier match alone is certain', () => {
    const input: Patient = {
      resourceType: 'Patient',
      identifier: [{ system: 'http://example.com/mrn', value: 'MRN123' }],
    };
    const { score, grade } = scoreCandidate(baseCandidate, input);
    expect(score).toBe(1.0);
    expect(grade).toBe('certain');
  });

  test('Name + birthdate without identifier scores probable', () => {
    const input: Patient = {
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      birthDate: '1990-01-01',
    };
    const { grade } = scoreCandidate(baseCandidate, input);
    // Should be probable or certain (no identifier to compare against)
    expect(['probable', 'certain']).toContain(grade);
  });

  test('Wrong birthdate lowers score', () => {
    const fullMatch: Patient = {
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      birthDate: '1990-01-01',
      gender: 'male',
    };
    const wrongDob: Patient = {
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      birthDate: '1985-06-15',
      gender: 'male',
    };
    const full = scoreCandidate(baseCandidate, fullMatch);
    const wrong = scoreCandidate(baseCandidate, wrongDob);
    expect(full.score).toBeGreaterThan(wrong.score);
  });

  test('Phone match scores certain', () => {
    const input: Patient = {
      resourceType: 'Patient',
      telecom: [{ system: 'phone', value: '555-867-5309' }],
    };
    const candidate = {
      ...baseCandidate,
      telecom: [{ system: 'phone', value: '5558675309' }], // same digits, different format
    } as WithId<Patient>;
    const { score, grade } = scoreCandidate(candidate, input);
    expect(score).toBe(1.0);
    expect(grade).toBe('certain');
  });

  test('Email match scores certain', () => {
    const input: Patient = {
      resourceType: 'Patient',
      telecom: [{ system: 'email', value: 'John.Smith@Example.COM' }],
    };
    const candidate = {
      ...baseCandidate,
      telecom: [{ system: 'email', value: 'john.smith@example.com' }], // same, different case
    } as WithId<Patient>;
    const { score, grade } = scoreCandidate(candidate, input);
    expect(score).toBe(1.0);
    expect(grade).toBe('certain');
  });

  test('Phone mismatch lowers score', () => {
    const withPhone: Patient = {
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      birthDate: '1990-01-01',
      telecom: [{ system: 'phone', value: '5558675309' }],
    };
    const withWrongPhone: Patient = {
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      birthDate: '1990-01-01',
      telecom: [{ system: 'phone', value: '5550000000' }],
    };
    const candidateWithPhone: WithId<Patient> = {
      ...baseCandidate,
      telecom: [{ system: 'phone', value: '5558675309' }],
    };
    const match = scoreCandidate(candidateWithPhone, withPhone);
    const mismatch = scoreCandidate(candidateWithPhone, withWrongPhone);
    expect(match.score).toBeGreaterThan(mismatch.score);
  });

  test('No overlapping fields returns score 0', () => {
    const input: Patient = { resourceType: 'Patient' };
    const { score } = scoreCandidate(baseCandidate, input);
    expect(score).toBe(0);
  });
});
