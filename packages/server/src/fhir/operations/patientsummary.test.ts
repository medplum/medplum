import { ContentType, LOINC, createReference, getReferenceString } from '@medplum/core';
import {
  Bundle,
  Composition,
  Condition,
  DiagnosticReport,
  Observation,
  Organization,
  Patient,
  Practitioner,
  Resource,
} from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';
import { OBSERVATION_CATEGORY_SYSTEM, PatientSummaryBuilder } from './patientsummary';

const app = express();
let accessToken: string;

describe('Patient Summary Operation', () => {
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
      .send({ resourceType: 'Practitioner' });
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

    // Execute the operation
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$summary`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);
    const result = res4.body as Bundle;
    expect(result.type).toBe('document');
    expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
    expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');
  });

  describe('PatientSummaryBuilder', () => {
    test('Simple categories', () => {
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const patientRef = createReference(patient);

      const everything: Resource[] = [
        { resourceType: 'AllergyIntolerance', id: 'allergy1', patient: patientRef },
        { resourceType: 'Condition', id: 'condition1', subject: patientRef },
        {
          resourceType: 'DiagnosticReport',
          id: 'report1',
          subject: patientRef,
          status: 'final',
          code: { text: 'test' },
        },
        {
          resourceType: 'Goal',
          id: 'goal1',
          subject: patientRef,
          lifecycleStatus: 'accepted',
          description: { text: 'test' },
        },
        {
          resourceType: 'Immunization',
          id: 'imm1',
          patient: patientRef,
          status: 'completed',
          vaccineCode: { text: 'test' },
        },
        { resourceType: 'MedicationRequest', id: 'med1', subject: patientRef, status: 'active', intent: 'plan' },
        { resourceType: 'Procedure', id: 'proc1', subject: patientRef, status: 'completed' },
        { resourceType: 'Task', id: 'task1', for: patientRef, status: 'completed', intent: 'order' },
      ];

      const builder = new PatientSummaryBuilder(patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(2 + everything.length); // 1 for patient, 1 for composition
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');
    });

    test('Observations', () => {
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);

      const categories = [
        'social-history',
        'vital-signs',
        'imaging',
        'laboratory',
        'procedure',
        'survey',
        'exam',
        'therapy',
        'activity',
      ];

      const everything = categories.map(
        (category, index) =>
          ({
            resourceType: 'Observation',
            id: `obs${index}`,
            subject,
            status: 'final',
            category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: category }] }],
            code: { text: 'test' },
          }) as Observation
      );

      const builder = new PatientSummaryBuilder(patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(2 + everything.length); // 1 for patient, 1 for composition
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');
    });

    test('Observation containing observation', () => {
      // If an Observation is a member of another Observation,
      // then it should not be referenced directly by the Composition entries list.

      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);

      const childObs: Observation = {
        resourceType: 'Observation',
        id: `child`,
        subject,
        status: 'final',
        category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'vital-signs' }] }],
        code: { text: 'test' },
      };

      const parentObs: Observation = {
        resourceType: 'Observation',
        id: `parent`,
        subject,
        status: 'final',
        category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'vital-signs' }] }],
        code: { text: 'test' },
        hasMember: [createReference(childObs)],
      };

      const everything = [parentObs, childObs];

      const builder = new PatientSummaryBuilder(patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(2 + everything.length);
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as Composition;

      const section = composition.section?.find((s) => s.code?.coding?.[0]?.code === '8716-3');
      expect(section).toBeDefined();
      expect(section?.entry?.length).toBe(1);
      expect(section?.entry?.[0]?.reference).toBe(getReferenceString(parentObs));
    });

    test('DiagnosticReport containing observation', () => {
      // If an Observation is a member of a DiagnosticReport,
      // then it should not be referenced directly by the Composition entries list.

      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);

      const childObs: Observation = {
        resourceType: 'Observation',
        id: `child`,
        subject,
        status: 'final',
        code: { text: 'test' },
      };

      const parentReport: DiagnosticReport = {
        resourceType: 'DiagnosticReport',
        id: `parent`,
        subject,
        status: 'final',
        code: { text: 'test' },
        result: [createReference(childObs)],
      };

      const everything = [parentReport, childObs];

      const builder = new PatientSummaryBuilder(patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(2 + everything.length);
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as Composition;

      const section = composition.section?.find((s) => s.code?.coding?.[0]?.code === '30954-2');
      expect(section).toBeDefined();
      expect(section?.entry?.length).toBe(1);
      expect(section?.entry?.[0]?.reference).toBe(getReferenceString(parentReport));
    });
  });
});
