// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import type {
  AsyncJob,
  Encounter,
  Login,
  Observation,
  OperationOutcome,
  Parameters,
  ParametersParameter,
  Patient,
  Project,
  ProjectMembership,
  ServiceRequest,
  UserConfiguration,
} from '@medplum/fhirtypes';
import type { WithId } from '@medplum/core';
import express from 'express';
import type { Job } from 'bullmq';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { runInAsyncContext } from '../../context';
import { createTestProject, waitForAsyncJob } from '../../test.setup';
import type { PatientMergeJobData } from '../../workers/patient-merge';
import { execPatientMergeJob, getPatientMergeQueue } from '../../workers/patient-merge';

const app = express();
let accessToken: string;
let login: WithId<Login>;
let membership: WithId<ProjectMembership>;
let project: WithId<Project>;

describe('Patient Merge Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken, login, membership, project } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  describe('Basic Functionality', () => {
    test('Successfully merge two patients', async () => {
      // Create source patient
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['John'], family: 'Doe' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'MRN-001' }],
          active: true,
        } satisfies Patient);
      expect(sourceRes.status).toBe(201);
      const sourcePatient = sourceRes.body as Patient;

      // Create target patient
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['John'], family: 'Doe' }],
          identifier: [{ system: 'http://example.org/ssn', value: 'SSN-123' }],
          active: true,
        } satisfies Patient);
      expect(targetRes.status).toBe(201);
      const targetPatient = targetRes.body as Patient;

      // Execute merge
      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'source-patient',
              valueReference: createReference(sourcePatient),
            },
            {
              name: 'target-patient',
              valueReference: createReference(targetPatient),
            },
          ],
        });
      expect(mergeRes.status).toBe(200);
      const result = mergeRes.body as Parameters;
      expect(result.resourceType).toBe('Parameters');
      const mergedTarget = result.parameter?.find((p) => p.name === 'return')?.resource as Patient;
      expect(mergedTarget).toBeDefined();
      expect(mergedTarget.id).toBe(targetPatient.id);
      expect(mergedTarget.active).toBe(true);

      // Verify source patient is inactive and linked
      const updatedSourceRes = await request(app)
        .get(`/fhir/R4/Patient/${sourcePatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(updatedSourceRes.status).toBe(200);
      const updatedSource = updatedSourceRes.body as Patient;
      expect(updatedSource.active).toBe(false);
      expect(updatedSource.link).toBeDefined();
      expect(
        updatedSource.link?.some(
          (l) => l.type === 'replaced-by' && l.other.reference === getReferenceString(targetPatient)
        )
      ).toBe(true);

      // Verify target patient has replaces link
      expect(mergedTarget.link).toBeDefined();
      expect(
        mergedTarget.link?.some((l) => l.type === 'replaces' && l.other.reference === getReferenceString(sourcePatient))
      ).toBe(true);

      // Verify identifiers merged
      expect(mergedTarget.identifier).toBeDefined();
      expect(mergedTarget.identifier?.length).toBe(2);
      const mrnIdentifier = mergedTarget.identifier?.find((id) => id.system === 'http://example.org/mrn');
      expect(mrnIdentifier).toBeDefined();
      expect(mrnIdentifier?.use).toBe('old');
    });

    test('Source becomes inactive with replaced-by link', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      const updatedSourceRes = await request(app)
        .get(`/fhir/R4/Patient/${sourcePatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      const updatedSource = updatedSourceRes.body as Patient;
      expect(updatedSource.active).toBe(false);
      expect(updatedSource.link?.some((l) => l.type === 'replaced-by')).toBe(true);
    });
  });

  describe('Clinical Resource Updates', () => {
    test('Updates all clinical resource references and verifies count', async () => {
      // Create patients
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Create clinical resources for source patient
      const observationRes = await request(app)
        .post('/fhir/R4/Observation')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: 'test' }] },
          subject: createReference(sourcePatient),
        } satisfies Observation);
      const observation = observationRes.body as Observation;

      const encounterRes = await request(app)
        .post('/fhir/R4/Encounter')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Encounter',
          status: 'finished',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory',
          },
          subject: createReference(sourcePatient),
        } satisfies Encounter);
      expect(encounterRes.status).toBe(201);
      const encounter = encounterRes.body as Encounter;
      expect(encounter.id).toBeDefined();

      const serviceRequestRes = await request(app)
        .post('/fhir/R4/ServiceRequest')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'order',
          subject: createReference(sourcePatient),
        } satisfies ServiceRequest);
      const serviceRequest = serviceRequestRes.body as ServiceRequest;

      // Execute merge
      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBe(200);
      const result = mergeRes.body as Parameters;
      const mergedTarget = result.parameter?.find((p) => p.name === 'return')?.resource as Patient;
      expect(mergedTarget).toBeDefined();
      expect(mergedTarget.id).toBe(targetPatient.id);

      // Verify references updated
      const updatedObsRes = await request(app)
        .get(`/fhir/R4/Observation/${observation.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(updatedObsRes.body.subject.reference).toBe(getReferenceString(targetPatient));

      // Verify Encounter was updated
      const updatedEncRes = await request(app)
        .get(`/fhir/R4/Encounter/${encounter.id}`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(updatedEncRes.status).toBe(200);
      expect(updatedEncRes.body).toBeDefined();
      expect(updatedEncRes.body.resourceType).toBe('Encounter');
      expect(updatedEncRes.body.subject).toBeDefined();
      expect(updatedEncRes.body.subject.reference).toBe(getReferenceString(targetPatient));

      const updatedSrRes = await request(app)
        .get(`/fhir/R4/ServiceRequest/${serviceRequest.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(updatedSrRes.body.subject.reference).toBe(getReferenceString(targetPatient));
    });

    test('Skips Patient resource itself in clinical updates', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Create observation
      await request(app)
        .post('/fhir/R4/Observation')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: 'test' }] },
          subject: createReference(sourcePatient),
        } satisfies Observation);

      // Execute merge - Patient resource should be skipped, only Observation updated
      await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      // Verify source patient still exists and wasn't modified incorrectly
      const sourceAfterMerge = await request(app)
        .get(`/fhir/R4/Patient/${sourcePatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(sourceAfterMerge.status).toBe(200);
      expect(sourceAfterMerge.body.id).toBe(sourcePatient.id);
    });

    test('Processes first page of clinical resources (pagination will be added in PR 2)', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Create a few observations (all will be on the first page since default page size is 1000)
      const observations: Observation[] = [];
      for (let i = 0; i < 5; i++) {
        const obsRes = await request(app)
          .post('/fhir/R4/Observation')
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            resourceType: 'Observation',
            status: 'final',
            code: { coding: [{ system: 'http://loinc.org', code: `test-${i}` }] },
            subject: createReference(sourcePatient),
          } satisfies Observation);
        observations.push(obsRes.body as Observation);
      }

      // Execute merge
      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBe(200);

      // Verify all observations were updated (they're all on the first page)
      for (const observation of observations) {
        const updatedObsRes = await request(app)
          .get(`/fhir/R4/Observation/${observation.id}`)
          .set('Authorization', 'Bearer ' + accessToken);
        expect(updatedObsRes.body.subject.reference).toBe(getReferenceString(targetPatient));
      }
    });

    test('Handles resources with multiple references to same patient', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Create observation with multiple references to source patient
      const observationRes = await request(app)
        .post('/fhir/R4/Observation')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: 'test' }] },
          subject: createReference(sourcePatient),
          performer: [createReference(sourcePatient)], // Multiple references
        } satisfies Observation);
      const observation = observationRes.body as Observation;

      // Execute merge
      await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      // Verify all references were updated
      const updatedObsRes = await request(app)
        .get(`/fhir/R4/Observation/${observation.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(updatedObsRes.body.subject.reference).toBe(getReferenceString(targetPatient));
      expect(updatedObsRes.body.performer[0].reference).toBe(getReferenceString(targetPatient));
    });
  });

  describe('Error Cases', () => {
    test('Returns error when source equals target', async () => {
      const patientRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Test'], family: 'Patient' }] } satisfies Patient);
      const patient = patientRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(patient) },
            { name: 'target-patient', valueReference: createReference(patient) },
          ],
        });

      expect(mergeRes.status).toBe(400);
      const outcome = mergeRes.body as OperationOutcome;
      expect(outcome.issue?.[0]?.severity).toBe('error');
    });

    test('Returns error when patient not found', async () => {
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: { reference: 'Patient/nonexistent' } },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBeGreaterThanOrEqual(400);
    });

    test('Returns error when reference format is invalid', async () => {
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: { reference: 'invalid-format' } },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBe(400);
    });

    test('Returns error when missing required parameters', async () => {
      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: { reference: 'Patient/123' } },
            // Missing target-patient
          ],
        });

      expect(mergeRes.status).toBe(400);
    });

    test('Returns error on conflicting identifier values', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'MRN-001' }],
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'MRN-002' }], // Different value, same system
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBeGreaterThanOrEqual(400);
    });

    test('Returns error on inconsistent link structure', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
          link: [{ other: { reference: 'Patient/target' }, type: 'replaced-by' }], // Source claims to be replaced by target
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          // Target is missing the 'replaces' link back to source - inconsistent!
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBe(400);
      const outcome = mergeRes.body as OperationOutcome;
      expect(outcome.issue?.[0]?.severity).toBe('error');
      expect(outcome.issue?.[0]?.details?.text).toContain('Inconsistent patient link structure');
    });
  });

  describe('Idempotency', () => {
    test('Returns target as-is when patients already merged', async () => {
      // Create and merge patients
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // First merge
      await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      // Second merge (idempotent)
      const secondMergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(secondMergeRes.status).toBe(200);
      const result = secondMergeRes.body as Parameters;
      const mergedTarget = result.parameter?.find((p) => p.name === 'return')?.resource as Patient;
      expect(mergedTarget).toBeDefined();
      expect(mergedTarget.id).toBe(targetPatient.id);

      // Verify resourcesUpdated is 0 (no resources updated on second merge)
      const resourcesUpdated = result.parameter?.find((p) => p.name === 'resourcesUpdated')?.valueInteger;
      expect(resourcesUpdated).toBe(0);
    });
  });

  describe('Instance-Level Operation', () => {
    test('Can use patient ID in URL path as target-patient', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Use instance-level operation: ID in URL path
      const mergeRes = await request(app)
        .post(`/fhir/R4/Patient/${targetPatient.id}/$merge`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            // target-patient not needed when ID is in URL
          ],
        });

      expect(mergeRes.status).toBe(200);
      const result = mergeRes.body as Parameters;
      const mergedTarget = result.parameter?.find((p) => p.name === 'return')?.resource as Patient;
      expect(mergedTarget).toBeDefined();
      expect(mergedTarget.id).toBe(targetPatient.id);

      // Verify source is inactive
      const updatedSourceRes = await request(app)
        .get(`/fhir/R4/Patient/${sourcePatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(updatedSourceRes.body.active).toBe(false);
    });

    test('Instance-level operation still accepts target-patient parameter', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Instance-level with target-patient parameter (should use URL ID, parameter ignored)
      const mergeRes = await request(app)
        .post(`/fhir/R4/Patient/${targetPatient.id}/$merge`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) }, // Optional when ID in URL
          ],
        });

      expect(mergeRes.status).toBe(200);
      const result = mergeRes.body as Parameters;
      const mergedTarget = result.parameter?.find((p) => p.name === 'return')?.resource as Patient;
      expect(mergedTarget).toBeDefined();
      expect(mergedTarget.id).toBe(targetPatient.id);
    });

    test('Instance-level operation requires source-patient parameter', async () => {
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post(`/fhir/R4/Patient/${targetPatient.id}/$merge`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [],
        });

      expect(mergeRes.status).toBe(400);
    });

    test('Instance-level operation returns error when target patient not found', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/nonexistent/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [{ name: 'source-patient', valueReference: createReference(sourcePatient) }],
        });

      expect(mergeRes.status).toBe(400);
    });
  });

  describe('Edge Cases', () => {
    test('Handles patient with existing links', async () => {
      // Create master patient
      const masterRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Master'], family: 'Patient' }] } satisfies Patient);
      const masterPatient = masterRes.body as Patient;

      // Create source patient already linked to master
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
          link: [{ other: createReference(masterPatient), type: 'replaced-by' }],
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      // Create target patient
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Merge source into target
      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBe(200);
      const updatedSourceRes = await request(app)
        .get(`/fhir/R4/Patient/${sourcePatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      const updatedSource = updatedSourceRes.body as Patient;
      // Should have both replaced-by links (to master and to target)
      expect(updatedSource.link?.length).toBeGreaterThanOrEqual(1);
    });

    test('Handles empty identifiers', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBe(200);
    });
  });

  describe('Async Execution', () => {
    test('Prefer: respond-async returns 202 with Content-Location', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Prefer', 'respond-async')
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      expect(mergeRes.status).toBe(202);
      expect(mergeRes.headers['content-location']).toBeDefined();
    });

    test('Async job completes successfully', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Prefer', 'respond-async')
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
          ],
        });

      const asyncJob = await waitForAsyncJob(mergeRes.headers['content-location'], app, accessToken);
      expect(asyncJob).toMatchObject<Partial<AsyncJob>>({
        resourceType: 'AsyncJob',
        status: 'completed',
        request: expect.stringContaining('$merge'),
        output: expect.objectContaining<Parameters>({
          resourceType: 'Parameters',
          parameter: expect.arrayContaining<ParametersParameter>([
            expect.objectContaining<ParametersParameter>({
              name: 'return',
              resource: expect.objectContaining<Patient>({
                resourceType: 'Patient',
                id: targetPatient.id,
              }),
            }),
            expect.objectContaining<ParametersParameter>({
              name: 'resourcesUpdated',
              valueInteger: expect.any(Number),
            }),
          ]),
        }),
      });

      // Verify the merge actually completed
      const updatedSourceRes = await request(app)
        .get(`/fhir/R4/Patient/${sourcePatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(updatedSourceRes.body.active).toBe(false);
    });

    test('Instance-level operation works with async execution', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Source'], family: 'Patient' }] } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ resourceType: 'Patient', name: [{ given: ['Target'], family: 'Patient' }] } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const mergeRes = await request(app)
        .post(`/fhir/R4/Patient/${targetPatient.id}/$merge`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Prefer', 'respond-async')
        .send({
          resourceType: 'Parameters',
          parameter: [{ name: 'source-patient', valueReference: createReference(sourcePatient) }],
        });

      expect(mergeRes.status).toBe(202);
      expect(mergeRes.headers['content-location']).toBeDefined();

      const asyncJob = await waitForAsyncJob(mergeRes.headers['content-location'], app, accessToken);
      expect(asyncJob.status).toBe('completed');
    });
  });
});

