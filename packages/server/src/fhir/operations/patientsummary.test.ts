// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  LOINC_ALLERGIES_SECTION,
  LOINC_ASSESSMENTS_SECTION,
  LOINC_DEVICES_SECTION,
  LOINC_ENCOUNTERS_SECTION,
  LOINC_GOALS_SECTION,
  LOINC_HEALTH_CONCERNS_SECTION,
  LOINC_IMMUNIZATIONS_SECTION,
  LOINC_MEDICATIONS_SECTION,
  LOINC_NOTE_DOCUMENT,
  LOINC_NOTES_SECTION,
  LOINC_PLAN_OF_TREATMENT_SECTION,
  LOINC_PROBLEMS_SECTION,
  LOINC_PROCEDURES_SECTION,
  LOINC_RESULTS_SECTION,
  LOINC_SOCIAL_HISTORY_SECTION,
  LOINC_VITAL_SIGNS_SECTION,
} from '@medplum/ccda';
import { ContentType, createReference, getReferenceString, LOINC, WithId } from '@medplum/core';
import {
  Bundle,
  CarePlan,
  ClinicalImpression,
  Composition,
  Condition,
  DiagnosticReport,
  Encounter,
  Observation,
  Organization,
  Patient,
  Practitioner,
  Resource,
  ServiceRequest,
} from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
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
    const organization = orgRes.body as WithId<Organization>;

    // Create practitioner
    const practRes = await request(app)
      .post(`/fhir/R4/Practitioner`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Practitioner' });
    expect(practRes.status).toBe(201);
    const practitioner = practRes.body as WithId<Practitioner>;

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
    const patient = res1.body as WithId<Patient>;

    // Create observation
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'vital-signs' }] }],
        code: { coding: [{ system: LOINC, code: '12345-6' }] },
        subject: createReference(patient),
        performer: [createReference(practitioner), createReference(organization)],
      } satisfies Observation);
    expect(res2.status).toBe(201);
    const observation = res2.body as WithId<Observation>;

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
    const condition = res3.body as WithId<Condition>;

    // Execute the operation
    const res4 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$summary`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);

    const result = res4.body as WithId<Bundle>;
    expect(result.type).toBe('document');
    expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
    expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

    const composition = result.entry?.[0]?.resource as WithId<Composition>;
    expectSectionToContain(composition, LOINC_VITAL_SIGNS_SECTION, 'Result', getReferenceString(observation));
    expectSectionToContain(composition, LOINC_PROBLEMS_SECTION, 'Problem', getReferenceString(condition));
  });

  describe('PatientSummaryBuilder', () => {
    test('Simple categories', () => {
      const author: Practitioner = { resourceType: 'Practitioner', id: 'author1' };
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const patientRef = createReference(patient);

      const everything: WithId<Resource>[] = [
        { resourceType: 'AllergyIntolerance', id: 'allergy1', patient: patientRef },
        { resourceType: 'Condition', id: 'condition1', subject: patientRef },
        { resourceType: 'ClinicalImpression', id: 'impression1', status: 'completed', subject: patientRef },
        {
          resourceType: 'DeviceUseStatement',
          id: 'device1',
          status: 'active',
          subject: patientRef,
          device: { display: 'test' },
        },
        {
          resourceType: 'DiagnosticReport',
          id: 'report1',
          subject: patientRef,
          status: 'final',
          code: { text: 'test' },
        },
        {
          resourceType: 'Encounter',
          id: 'encounter1',
          class: { code: 'test' },
          status: 'finished',
          subject: patientRef,
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
        { resourceType: 'ServiceRequest', id: 'sr1', subject: patientRef, status: 'active', intent: 'plan' },
      ];

      const builder = new PatientSummaryBuilder(author, patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(3 + everything.length); // 1 for author, 1 for patient, 1 for composition
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as WithId<Composition>;
      expectSectionToContain(composition, LOINC_ALLERGIES_SECTION, 'Substance', 'AllergyIntolerance/allergy1');
      expectSectionToContain(composition, LOINC_PROBLEMS_SECTION, 'Problem', 'Condition/condition1');
      expectSectionToContain(composition, LOINC_DEVICES_SECTION, 'Device', 'DeviceUseStatement/device1');
      expectSectionToContain(composition, LOINC_ENCOUNTERS_SECTION, 'Encounter', 'Encounter/encounter1');
      expectSectionToContain(composition, LOINC_RESULTS_SECTION, 'Result', 'DiagnosticReport/report1');
      expectSectionToContain(composition, LOINC_GOALS_SECTION, 'Goal', 'Goal/goal1');
      expectSectionToContain(composition, LOINC_IMMUNIZATIONS_SECTION, 'Vaccine', 'Immunization/imm1');
      expectSectionToContain(composition, LOINC_MEDICATIONS_SECTION, 'Medication', 'MedicationRequest/med1');
      expectSectionToContain(composition, LOINC_PROCEDURES_SECTION, 'Procedure', 'Procedure/proc1');
      expectSectionToContain(composition, LOINC_PLAN_OF_TREATMENT_SECTION, 'Planned', 'ServiceRequest/sr1');
    });

    test('ClinicalImpressions', () => {
      const author: Practitioner = { resourceType: 'Practitioner', id: 'author1' };
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);
      const everything: WithId<ClinicalImpression>[] = [
        {
          resourceType: 'ClinicalImpression',
          id: 'assessment',
          status: 'completed',
          subject,
          summary: 'test',
        },
        {
          resourceType: 'ClinicalImpression',
          id: 'note',
          status: 'completed',
          code: { coding: [{ system: LOINC, code: LOINC_NOTE_DOCUMENT }] },
          subject,
          summary: 'test',
        },
      ];

      const builder = new PatientSummaryBuilder(author, patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(3 + everything.length); // 1 for author, 1 for patient, 1 for composition
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as WithId<Composition>;
      expectSectionToContain(composition, LOINC_ASSESSMENTS_SECTION, 'Summary', 'ClinicalImpression/assessment');
      expectSectionToContain(composition, LOINC_NOTES_SECTION, 'Note', 'ClinicalImpression/note');
    });

    test('Conditions', () => {
      const author: Practitioner = { resourceType: 'Practitioner', id: 'author1' };
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);
      const everything: WithId<Condition>[] = [
        {
          resourceType: 'Condition',
          id: 'concern',
          category: [{ coding: [{ system: LOINC, code: LOINC_HEALTH_CONCERNS_SECTION }] }],
          subject,
        },
        {
          resourceType: 'Condition',
          id: 'problem',
          subject,
        },
      ];

      const builder = new PatientSummaryBuilder(author, patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(3 + everything.length); // 1 for author, 1 for patient, 1 for composition
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as WithId<Composition>;
      expectSectionToContain(composition, LOINC_HEALTH_CONCERNS_SECTION, 'Concern', 'Condition/concern');
      expectSectionToContain(composition, LOINC_PROBLEMS_SECTION, 'Problem', 'Condition/problem');
    });

    test('Observations', () => {
      const author: Practitioner = { resourceType: 'Practitioner', id: 'author1' };
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);

      const categories = [
        ['social-history', LOINC_SOCIAL_HISTORY_SECTION],
        ['vital-signs', LOINC_VITAL_SIGNS_SECTION],
        ['imaging', LOINC_RESULTS_SECTION],
        ['laboratory', LOINC_RESULTS_SECTION],
        ['activity', LOINC_RESULTS_SECTION],
      ];

      const everything = categories.map(
        (category, index) =>
          ({
            resourceType: 'Observation',
            id: `obs${index}`,
            subject,
            status: 'final',
            category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: category[0] }] }],
            code: { text: 'test' },
          }) as WithId<Observation>
      );

      const builder = new PatientSummaryBuilder(author, patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(3 + everything.length); // 1 for author, 1 for patient, 1 for composition
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as WithId<Composition>;

      for (let i = 0; i < categories.length; i++) {
        expectSectionToContain(composition, categories[i][1], 'Result', `Observation/obs${i}`);
      }
    });

    test('Observation containing observation', () => {
      // If an Observation is a member of another Observation,
      // then it should not be referenced directly by the Composition entries list.

      const author: Practitioner = { resourceType: 'Practitioner', id: 'author1' };
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);

      const childObs: WithId<Observation> = {
        resourceType: 'Observation',
        id: `child`,
        subject,
        status: 'final',
        category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'vital-signs' }] }],
        code: { text: 'test' },
      };

      const parentObs: WithId<Observation> = {
        resourceType: 'Observation',
        id: `parent`,
        subject,
        status: 'final',
        category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'vital-signs' }] }],
        code: { text: 'test' },
        hasMember: [createReference(childObs)],
      };

      const everything = [parentObs, childObs];

      const builder = new PatientSummaryBuilder(author, patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(3 + everything.length);
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as WithId<Composition>;

      const section = composition.section?.find((s) => s.code?.coding?.[0]?.code === LOINC_VITAL_SIGNS_SECTION);
      expect(section).toBeDefined();
      expect(section?.entry?.length).toBe(1);
      expect(section?.entry?.[0]?.reference).toBe(getReferenceString(parentObs));
    });

    test('DiagnosticReport containing observation', () => {
      // If an Observation is a member of a DiagnosticReport,
      // then it should not be referenced directly by the Composition entries list.

      const author: Practitioner = { resourceType: 'Practitioner', id: 'author1' };
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);

      const childObs: WithId<Observation> = {
        resourceType: 'Observation',
        id: `child`,
        subject,
        status: 'final',
        code: { text: 'test' },
      };

      const parentReport: WithId<DiagnosticReport> = {
        resourceType: 'DiagnosticReport',
        id: `parent`,
        subject,
        status: 'final',
        code: { text: 'test' },
        result: [createReference(childObs)],
      };

      const everything = [parentReport, childObs];

      const builder = new PatientSummaryBuilder(author, patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(3 + everything.length);
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as WithId<Composition>;

      const section = composition.section?.find((s) => s.code?.coding?.[0]?.code === LOINC_RESULTS_SECTION);
      expect(section).toBeDefined();
      expect(section?.entry?.length).toBe(1);
      expect(section?.entry?.[0]?.reference).toBe(getReferenceString(parentReport));
    });

    test('CarePlan containing ServiceRequest', () => {
      // If an ServiceRequest is a member of a CarePlan,
      // then it should not be referenced directly by the Composition entries list.

      const author: Practitioner = { resourceType: 'Practitioner', id: 'author1' };
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);

      const child: WithId<ServiceRequest> = {
        resourceType: 'ServiceRequest',
        id: `child`,
        subject,
        status: 'active',
        intent: 'plan',
        code: { text: 'test' },
      };

      const parent: WithId<CarePlan> = {
        resourceType: 'CarePlan',
        id: `parent`,
        subject,
        status: 'active',
        intent: 'plan',
        activity: [{ reference: createReference(child) }],
      };

      const everything = [parent, child];

      const builder = new PatientSummaryBuilder(author, patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(3 + everything.length);
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as WithId<Composition>;

      const section = composition.section?.find((s) => s.code?.coding?.[0]?.code === LOINC_PLAN_OF_TREATMENT_SECTION);
      expect(section).toBeDefined();
      expect(section?.entry?.length).toBe(1);
      expect(section?.entry?.[0]?.reference).toBe(getReferenceString(parent));
    });

    test('Encounter containing conditions', () => {
      // If an Observation is a member of a DiagnosticReport,
      // then it should not be referenced directly by the Composition entries list.

      const author: Practitioner = { resourceType: 'Practitioner', id: 'author1' };
      const patient: Patient = { resourceType: 'Patient', id: 'patient1' };
      const subject = createReference(patient);

      const child: WithId<Condition> = {
        resourceType: 'Condition',
        id: 'diagnosis',
        subject,
        clinicalStatus: { coding: [{ code: 'active' }] },
        category: [{ coding: [{ code: 'encounter-diagnosis' }] }],
        code: { coding: [{ code: '386661006' }] },
        onsetDateTime: '2011-10-05T07:00:00.000Z',
        recordedDate: '2025-02-24T20:51:00.000Z',
        recorder: { reference: 'Practitioner/davis' },
      };

      const parent: WithId<Encounter> = {
        resourceType: 'Encounter',
        id: 'encounter',
        subject,
        status: 'finished',
        class: { code: 'test' },
        diagnosis: [{ condition: createReference(child) }],
        period: { start: '2015-06-22T20:00:00.000Z', end: '2015-06-22T21:00:00.000Z' },
      };

      const everything = [parent, child];

      const builder = new PatientSummaryBuilder(author, patient, everything);
      const result = builder.build();
      expect(result.entry?.length).toBe(3 + everything.length);
      expect(result.entry?.[0]?.resource?.resourceType).toBe('Composition');
      expect(result.entry?.[1]?.resource?.resourceType).toBe('Patient');

      const composition = result.entry?.[0]?.resource as WithId<Composition>;

      const section = composition.section?.find((s) => s.code?.coding?.[0]?.code === LOINC_ENCOUNTERS_SECTION);
      expect(section).toBeDefined();
      expect(section?.entry?.length).toBe(1);
      expect(section?.entry?.[0]?.reference).toBe(getReferenceString(parent));
    });
  });
});

function expectSectionToContain(composition: Composition, code: string, narrative: string, reference: string): void {
  const section = composition.section?.find((s) => s.code?.coding?.[0]?.code === code);
  if (!section) {
    throw new Error(`Section not found: ${code}`);
  }

  if (!section.text?.div?.includes(narrative)) {
    throw new Error(`Narrative not found in section ${code}: ${narrative} (${section.text?.div})`);
  }

  const entry = section?.entry?.find((e) => e.reference === reference);
  if (!entry) {
    throw new Error(`Entry not found in section ${code}: ${reference}`);
  }
}
