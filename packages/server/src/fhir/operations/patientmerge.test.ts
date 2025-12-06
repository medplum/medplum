// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import type {
  Encounter,
  Observation,
  OperationOutcome,
  Parameters,
  Patient,
  Provenance,
  ServiceRequest,
} from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';

const app = express();
let accessToken: string;

// Helper type for merge operation variants
type MergeOperationType = {
  name: string;
  execute: (
    app: express.Application,
    accessToken: string,
    sourcePatient: Patient,
    targetPatient: Patient
  ) => Promise<request.Response>;
};

describe('Patient Merge Operation', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  // Define both operation types
  const operationTypes: MergeOperationType[] = [
    {
      name: 'Type-level (POST /Patient/$merge)',
      execute: async (app, accessToken, sourcePatient, targetPatient) => {
        return request(app)
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
      },
    },
    {
      name: 'Instance-level (POST /Patient/:id/$merge)',
      execute: async (app, accessToken, sourcePatient, targetPatient) => {
        return request(app)
          .post(`/fhir/R4/Patient/${targetPatient.id}/$merge`)
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send({
            resourceType: 'Parameters',
            parameter: [{ name: 'source-patient', valueReference: createReference(sourcePatient) }],
          });
      },
    },
  ];

  // Run tests for both operation types
  operationTypes.forEach((opType) => {
    describe(`${opType.name}`, () => {
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

          // Execute merge using the current operation type
          const mergeRes = await opType.execute(app, accessToken, sourcePatient, targetPatient);
          expect(mergeRes.status).toBe(200);
          const result = mergeRes.body as Parameters;
          expect(result.resourceType).toBe('Parameters');

          // Verify FHIR spec-compliant output format
          const inputParam = result.parameter?.find((p) => p.name === 'input')?.resource as Parameters;
          expect(inputParam).toBeDefined();
          expect(inputParam.resourceType).toBe('Parameters');

          // Verify input echo contains original parameters
          const echoedSourceParam = inputParam.parameter?.find((p) => p.name === 'source-patient');
          expect(echoedSourceParam).toBeDefined();
          expect(echoedSourceParam?.valueReference?.reference).toBe(getReferenceString(sourcePatient));

          const echoedTargetParam = inputParam.parameter?.find((p) => p.name === 'target-patient');
          expect(echoedTargetParam).toBeDefined();
          expect(echoedTargetParam?.valueReference?.reference).toBe(getReferenceString(targetPatient));

          // Verify machine-readable resourcesUpdated in outcome
          const outcome = result.parameter?.find((p) => p.name === 'outcome')?.resource as OperationOutcome;
          expect(outcome).toBeDefined();
          const resourcesUpdatedExt = outcome.issue?.[0]?.details?.extension?.find(
            (ext) => ext.url === 'https://medplum.com/fhir/StructureDefinition/patient-merge-resources-updated'
          );
          expect(resourcesUpdatedExt).toBeDefined();
          expect(resourcesUpdatedExt?.valueInteger).toBe(0); // No clinical resources created in this test

          const outcomeParam = result.parameter?.find((p) => p.name === 'outcome')?.resource as OperationOutcome;
          expect(outcomeParam).toBeDefined();
          expect(outcomeParam.issue?.[0]?.severity).toBe('information');

          const mergedTarget = result.parameter?.find((p) => p.name === 'result')?.resource as Patient;
          expect(mergedTarget).toBeDefined();
          expect(mergedTarget.id).toBe(targetPatient.id);
          expect(mergedTarget.active).toBe(true);

          // Verify backward compatibility - 'return' parameter still present
          const returnParam = result.parameter?.find((p) => p.name === 'return')?.resource as Patient;
          expect(returnParam).toBeDefined();
          expect(returnParam.id).toBe(targetPatient.id);

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
            mergedTarget.link?.some(
              (l) => l.type === 'replaces' && l.other.reference === getReferenceString(sourcePatient)
            )
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

          await opType.execute(app, accessToken, sourcePatient, targetPatient);

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

          // Execute merge using the current operation type
          const mergeRes = await opType.execute(app, accessToken, sourcePatient, targetPatient);

          expect(mergeRes.status).toBe(200);
          const result = mergeRes.body as Parameters;
          const mergedTarget = result.parameter?.find((p) => p.name === 'result')?.resource as Patient;
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
          await opType.execute(app, accessToken, sourcePatient, targetPatient);

          // Verify source patient still exists and wasn't modified incorrectly
          const sourceAfterMerge = await request(app)
            .get(`/fhir/R4/Patient/${sourcePatient.id}`)
            .set('Authorization', 'Bearer ' + accessToken);
          expect(sourceAfterMerge.status).toBe(200);
          expect(sourceAfterMerge.body.id).toBe(sourcePatient.id);
        });

        test('Processes first page of clinical resources', async () => {
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

          // Execute merge using the current operation type
          const mergeRes = await opType.execute(app, accessToken, sourcePatient, targetPatient);

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

          // Execute merge using the current operation type
          await opType.execute(app, accessToken, sourcePatient, targetPatient);

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

          const mergeRes = await opType.execute(app, accessToken, patient, patient);

          expect(mergeRes.status).toBe(400);
          const outcome = mergeRes.body as OperationOutcome;
          expect(outcome.issue?.[0]?.severity).toBe('error');
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

          const mergeRes = await opType.execute(app, accessToken, sourcePatient, targetPatient);

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

          const mergeRes = await opType.execute(app, accessToken, sourcePatient, targetPatient);

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
          await opType.execute(app, accessToken, sourcePatient, targetPatient);

          // Second merge (idempotent)
          const secondMergeRes = await opType.execute(app, accessToken, sourcePatient, targetPatient);

          expect(secondMergeRes.status).toBe(200);
          const result = secondMergeRes.body as Parameters;
          const mergedTarget = result.parameter?.find((p) => p.name === 'result')?.resource as Patient;
          expect(mergedTarget).toBeDefined();
          expect(mergedTarget.id).toBe(targetPatient.id);

          // Verify outcome indicates no resources updated on second merge
          const outcome = result.parameter?.find((p) => p.name === 'outcome')?.resource as OperationOutcome;
          expect(outcome).toBeDefined();
          expect(outcome.issue?.[0]?.details?.text).not.toContain('Updated');
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
          const mergeRes = await opType.execute(app, accessToken, sourcePatient, targetPatient);

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

          const mergeRes = await opType.execute(app, accessToken, sourcePatient, targetPatient);

          expect(mergeRes.status).toBe(200);
        });
      });
    });
  });

  // Tests for result-patient parameter
  describe('Custom Merge with result-patient Parameter', () => {
    test('Uses provided result-patient for merge', async () => {
      // Create source patient
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'SOURCE-123' }],
          gender: 'male',
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      // Create target patient
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'TARGET-456' }],
          gender: 'female',
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Custom result-patient with specific fields from both
      const customResult: Patient = {
        resourceType: 'Patient',
        id: targetPatient.id,
        name: [
          { given: ['Target'], family: 'Patient' }, // Keep target name
          { use: 'old', given: ['Source'], family: 'Patient' }, // Add source name as old
        ],
        identifier: [
          { system: 'http://example.org/mrn', value: 'TARGET-456' },
          { use: 'old', system: 'http://example.org/mrn', value: 'SOURCE-123' },
        ],
        gender: 'female', // Keep target gender
        link: [{ other: createReference(sourcePatient), type: 'replaces' }],
      };

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
            { name: 'result-patient', resource: customResult },
          ],
        });

      expect(mergeRes.status).toBe(200);
      const result = mergeRes.body as Parameters;
      const mergedTarget = result.parameter?.find((p) => p.name === 'result')?.resource as Patient;
      expect(mergedTarget).toBeDefined();
      expect(mergedTarget.name?.length).toBe(2);
      expect(mergedTarget.name?.find((n) => n.use === 'old')).toBeDefined();
      expect(mergedTarget.gender).toBe('female');
    });

    test('Returns error when result-patient id does not match target', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const invalidResult: Patient = {
        resourceType: 'Patient',
        id: 'wrong-id', // Wrong ID!
        link: [{ other: createReference(sourcePatient), type: 'replaces' }],
      };

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
            { name: 'result-patient', resource: invalidResult },
          ],
        });

      expect(mergeRes.status).toBe(400);
      const outcome = mergeRes.body as OperationOutcome;
      expect(outcome.issue?.[0]?.details?.text).toContain('must match target-patient id');
    });

    test('Returns error when result-patient missing replaces link', async () => {
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      const invalidResult: Patient = {
        resourceType: 'Patient',
        id: targetPatient.id,
        // Missing link!
      };

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
            { name: 'result-patient', resource: invalidResult },
          ],
        });

      expect(mergeRes.status).toBe(400);
      const outcome = mergeRes.body as OperationOutcome;
      expect(outcome.issue?.[0]?.details?.text).toContain("must include a 'replaces' link");
    });
  });

  // Tests for Provenance generation
  describe('Provenance Generation', () => {
    test('Creates Provenance resource after merge', async () => {
      // Create source patient
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'PROV-SRC' }],
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      // Create target patient
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'PROV-TGT' }],
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

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

      // Search for Provenance resources targeting the merged patients
      const provenanceSearch = await request(app)
        .get(`/fhir/R4/Provenance?target=${targetPatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(provenanceSearch.status).toBe(200);
      const provenanceBundle = provenanceSearch.body;
      expect(provenanceBundle.entry).toBeDefined();
      expect(provenanceBundle.entry.length).toBeGreaterThan(0);

      // Find the merge provenance
      const mergeProvenance = provenanceBundle.entry
        .map((e: any) => e.resource as Provenance)
        .find((p: Provenance) => p.activity?.coding?.some((c) => c.code === 'merge'));

      expect(mergeProvenance).toBeDefined();
      expect(mergeProvenance?.activity?.coding?.[0]?.system).toBe(
        'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle'
      );
      expect(mergeProvenance?.activity?.coding?.[0]?.code).toBe('merge');
      expect(mergeProvenance?.reason?.[0]?.coding?.[0]?.code).toBe('PATADMIN');
      expect(mergeProvenance?.agent?.[0]?.type?.coding?.[0]?.code).toBe('performer');
      expect(mergeProvenance?.target?.length).toBe(2);
    });

    test('Does not create Provenance in preview mode', async () => {
      // Create source patient
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'PREV-SRC' }],
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      // Create target patient
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'PREV-TGT' }],
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Get initial count of Provenance resources
      const initialProvenanceSearch = await request(app)
        .get(`/fhir/R4/Provenance?target=${targetPatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      const initialCount = initialProvenanceSearch.body.entry?.length || 0;

      // Execute merge in preview mode
      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
            { name: 'preview', valueBoolean: true },
          ],
        });

      expect(mergeRes.status).toBe(200);

      // Verify no new Provenance was created
      const finalProvenanceSearch = await request(app)
        .get(`/fhir/R4/Provenance?target=${targetPatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      const finalCount = finalProvenanceSearch.body.entry?.length || 0;

      expect(finalCount).toBe(initialCount);
    });
  });

  // Tests for preview mode
  describe('Preview Mode', () => {
    test('Preview mode returns merge result without committing changes', async () => {
      // Create source patient
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'PREVIEW-SRC' }],
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      // Create target patient
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'PREVIEW-TGT' }],
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Create an observation for source patient
      await request(app)
        .post('/fhir/R4/Observation')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: 'test' }] },
          subject: createReference(sourcePatient),
        } satisfies Observation);

      // Execute merge in preview mode
      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: 'source-patient', valueReference: createReference(sourcePatient) },
            { name: 'target-patient', valueReference: createReference(targetPatient) },
            { name: 'preview', valueBoolean: true },
          ],
        });

      expect(mergeRes.status).toBe(200);
      const result = mergeRes.body as Parameters;

      // Verify input echo includes preview parameter
      const inputParam = result.parameter?.find((p) => p.name === 'input')?.resource as Parameters;
      expect(inputParam).toBeDefined();
      const echoedPreviewParam = inputParam.parameter?.find((p) => p.name === 'preview');
      expect(echoedPreviewParam).toBeDefined();
      expect(echoedPreviewParam?.valueBoolean).toBe(true);

      // Verify preview outcome
      const outcome = result.parameter?.find((p) => p.name === 'outcome')?.resource as OperationOutcome;
      expect(outcome.issue?.[0]?.details?.text).toContain('Preview');
      expect(outcome.issue?.[0]?.details?.text).toContain('would update');

      // Verify machine-readable preview flag
      const previewExt = outcome.issue?.[0]?.details?.extension?.find(
        (ext) => ext.url === 'https://medplum.com/fhir/StructureDefinition/patient-merge-preview'
      );
      expect(previewExt).toBeDefined();
      expect(previewExt?.valueBoolean).toBe(true);

      // Verify machine-readable resourcesUpdated count
      const resourcesUpdatedExt = outcome.issue?.[0]?.details?.extension?.find(
        (ext) => ext.url === 'https://medplum.com/fhir/StructureDefinition/patient-merge-resources-updated'
      );
      expect(resourcesUpdatedExt).toBeDefined();
      expect(resourcesUpdatedExt?.valueInteger).toBeGreaterThanOrEqual(0);

      // Verify result shows what would happen
      const mergedTarget = result.parameter?.find((p) => p.name === 'result')?.resource as Patient;
      expect(mergedTarget).toBeDefined();
      expect(mergedTarget.identifier?.length).toBe(2);
      expect(mergedTarget.link?.some((l) => l.type === 'replaces')).toBe(true);

      // Verify source patient was NOT actually updated
      const sourceAfterPreview = await request(app)
        .get(`/fhir/R4/Patient/${sourcePatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      const sourceCheck = sourceAfterPreview.body as Patient;
      expect(sourceCheck.active).toBe(true); // Should still be active
      expect(sourceCheck.link).toBeUndefined(); // Should not have link yet

      // Verify target patient was NOT actually updated
      const targetAfterPreview = await request(app)
        .get(`/fhir/R4/Patient/${targetPatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      const targetCheck = targetAfterPreview.body as Patient;
      expect(targetCheck.identifier?.length).toBe(1); // Should still have only 1 identifier
      expect(targetCheck.link).toBeUndefined(); // Should not have link yet
    });
  });

  // Tests for identifier-based patient resolution
  describe('Identifier-based Patient Resolution', () => {
    test('Resolves patients using identifiers', async () => {
      // Create source patient with identifier
      const sourceRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Source'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'SOURCE-MRN-001' }],
        } satisfies Patient);
      const sourcePatient = sourceRes.body as Patient;

      // Create target patient with identifier
      const targetRes = await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'TARGET-MRN-001' }],
        } satisfies Patient);
      const targetPatient = targetRes.body as Patient;

      // Merge using identifiers instead of direct references
      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'source-patient-identifier',
              valueIdentifier: { system: 'http://example.org/mrn', value: 'SOURCE-MRN-001' },
            },
            {
              name: 'target-patient-identifier',
              valueIdentifier: { system: 'http://example.org/mrn', value: 'TARGET-MRN-001' },
            },
          ],
        });

      expect(mergeRes.status).toBe(200);
      const result = mergeRes.body as Parameters;
      const mergedTarget = result.parameter?.find((p) => p.name === 'result')?.resource as Patient;
      expect(mergedTarget).toBeDefined();
      expect(mergedTarget.id).toBe(targetPatient.id);

      // Verify source was properly merged
      const updatedSourceRes = await request(app)
        .get(`/fhir/R4/Patient/${sourcePatient.id}`)
        .set('Authorization', 'Bearer ' + accessToken);
      const updatedSource = updatedSourceRes.body as Patient;
      expect(updatedSource.active).toBe(false);
    });

    test('Returns error when identifier matches multiple patients', async () => {
      // Create two patients with same identifier (shouldn't happen in real system, but testing error handling)
      await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Patient'], family: 'One' }],
          identifier: [{ system: 'http://example.org/test', value: 'DUPLICATE' }],
        } satisfies Patient);

      await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Patient'], family: 'Two' }],
          identifier: [{ system: 'http://example.org/test', value: 'DUPLICATE' }],
        } satisfies Patient);

      // Create a valid target
      await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'UNIQUE-TARGET' }],
        } satisfies Patient);

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'source-patient-identifier',
              valueIdentifier: { system: 'http://example.org/test', value: 'DUPLICATE' },
            },
            {
              name: 'target-patient-identifier',
              valueIdentifier: { system: 'http://example.org/mrn', value: 'UNIQUE-TARGET' },
            },
          ],
        });

      expect(mergeRes.status).toBe(400);
      const outcome = mergeRes.body as OperationOutcome;
      expect(outcome.issue?.[0]?.details?.text).toContain('Multiple patients');
    });

    test('Returns error when identifier matches no patients', async () => {
      await request(app)
        .post('/fhir/R4/Patient')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Patient',
          name: [{ given: ['Target'], family: 'Patient' }],
          identifier: [{ system: 'http://example.org/mrn', value: 'EXISTS' }],
        } satisfies Patient);

      const mergeRes = await request(app)
        .post('/fhir/R4/Patient/$merge')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'source-patient-identifier',
              valueIdentifier: { system: 'http://example.org/mrn', value: 'NONEXISTENT' },
            },
            {
              name: 'target-patient-identifier',
              valueIdentifier: { system: 'http://example.org/mrn', value: 'EXISTS' },
            },
          ],
        });

      expect(mergeRes.status).toBe(400);
      const outcome = mergeRes.body as OperationOutcome;
      expect(outcome.issue?.[0]?.details?.text).toContain('No patient found');
    });
  });

  // Tests specific to type-level operation only
  describe('Type-level Operation Specific Tests', () => {
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
  });

  // Tests specific to instance-level operation only
  describe('Instance-level Operation Specific Tests', () => {
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
      const mergedTarget = result.parameter?.find((p) => p.name === 'result')?.resource as Patient;
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
});
