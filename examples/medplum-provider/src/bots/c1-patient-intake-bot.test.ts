// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString, SNOMED } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { extensionURLMapping } from '../utils/intake-utils';
import {
  patientIdentifier,
  patientIntakeQuestionnaire,
  patientIntakeQuestionnaireResponse,
} from './test-data/patient-records';
import { handler } from './c1-patient-intake-bot';

describe('C1 Patient Intake Bot', () => {
  let medplum: MockClient, questionnaire: Questionnaire, input: QuestionnaireResponse;

  const bot = { reference: 'Bot/123' };
  const contentType = ContentType.FHIR_JSON;
  const secrets = {};

  beforeEach(async () => {
    medplum = new MockClient();

    questionnaire = await medplum.createResource(patientIntakeQuestionnaire);
    input = {
      ...patientIntakeQuestionnaireResponse,
      questionnaire: getReferenceString(questionnaire),
    };
  });

  describe('QuestionnaireResponse', () => {
    test('creates a QuestionnaireResponse resource', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const questionnaireResponse = await medplum.searchResources('QuestionnaireResponse', {
        subject: getReferenceString(patient),
      });
      expect(questionnaireResponse).toHaveLength(1);
    });
  });

  describe('Patient', () => {
    test('creates a Patient resource', async () => {
      let patient = await medplum.searchOne('Patient', { identifier: patientIdentifier });
      expect(patient).toBeUndefined();

      await handler(medplum, { bot, input, contentType, secrets });

      patient = await medplum.searchOne('Patient', { identifier: patientIdentifier });
      expect(patient).toBeDefined();
    });

    test('creates a Patient resource with full demographics', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      expect(patient).toBeDefined();
      // Name
      expect(patient.name?.[0].given).toStrictEqual(['Curtis']);
      expect(patient.name?.[0].family).toStrictEqual('Strickland');
      // Birth Date
      expect(patient.birthDate).toStrictEqual('1997-11-21');
      expect((patient as any)._birthDate).toStrictEqual({
        extension: [
          {
            url: extensionURLMapping.patientBirthTime,
            valueDateTime: '1997-11-21T19:45:00',
          },
        ],
      });
      // Gender
      expect(patient.gender).toStrictEqual('male');
      // Rance and Ethnicity
      expect(patient.extension).toStrictEqual([
        {
          url: extensionURLMapping.race,
          extension: [
            {
              url: 'ombCategory',
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '1002-5',
                display: 'American Indian or Alaska Native',
              },
            },
            {
              url: 'text',
              valueString: 'American Indian or Alaska Native',
            },
          ],
        },
        {
          url: extensionURLMapping.ethnicity,
          extension: [
            {
              url: 'ombCategory',
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '2186-5',
                display: 'Not Hispanic or Latino',
              },
            },
            {
              url: 'text',
              valueString: 'Not Hispanic or Latino',
            },
          ],
        },
      ]);
      // Identifier
      expect(patient.identifier).toStrictEqual([{ system: 'http://example.com/patientId', value: patientIdentifier }]);
      // Address
      expect(patient.address?.[0].line?.[0]).toStrictEqual('3504 Turner Gateway Station');
      expect(patient.address?.[0].city).toStrictEqual('Hillborough');
      expect(patient.address?.[0].state).toStrictEqual('CO');
      expect(patient.address?.[0].postalCode).toStrictEqual('80034');
      // Telecom
      expect(patient.telecom).toStrictEqual([
        { system: 'phone', value: '502-248-7743', use: 'home' },
        { system: 'email', value: 'cstrickland7064@example.com', use: 'home' },
      ]);
    });
  });

  describe('Encounter', () => {
    test('creates multiple Encounter resources', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const encounters = await medplum.searchResources('Encounter', {
        subject: getReferenceString(patient),
      });
      expect(encounters).toHaveLength(4);
    });

    test('creates a simple Encounter', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const encounters = await medplum.searchResources('Encounter', {
        subject: getReferenceString(patient),
      });

      expect(encounters).toHaveLength(4);
      const encounter = encounters[0];
      expect(encounter.status).toStrictEqual('finished');
      expect(encounter.class).toStrictEqual({
        system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
        code: 'UNK',
        display: 'unknown',
      });
      expect(encounter.type).toStrictEqual([
        {
          coding: [
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: '99203',
              display:
                'Office or other outpatient visit for the evaluation and management of a new patient, which requires a medically appropriate history and/or examination and low level of medical decision making. When using total time on the date of the encounter for code selection, 30 minutes must be met or exceeded.',
            },
          ],
        },
      ]);
      expect(encounter.subject).toStrictEqual(createReference(patient));
      expect(encounter.period).toStrictEqual({
        start: '2023-02-23T08:00:00',
        end: '2023-02-23T08:30:00',
      });
      expect(encounter.length).toStrictEqual({ value: 0, unit: 'd' });
      expect(encounter.extension).toStrictEqual([
        {
          url: 'https://medplum.com/fhir/StructureDefinition/encounter-description',
          valueString: 'Encounter to Document Medications',
        },
      ]);
      expect(encounter.diagnosis).toBeUndefined();
      expect(encounter.hospitalization).toBeUndefined();
    });

    test('creates an Encounter with class code', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const encounters = await medplum.searchResources('Encounter', {
        subject: getReferenceString(patient),
      });

      expect(encounters).toHaveLength(4);
      const encounter = encounters[1];
      expect(encounter.status).toStrictEqual('finished');
      expect(encounter.class).toStrictEqual({
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'VR',
        display: 'virtual',
      });
      expect(encounter.type).toStrictEqual([
        {
          coding: [
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: '90832',
              display: 'Psychotherapy, 30 minutes with patient',
            },
          ],
        },
      ]);
      expect(encounter.subject).toStrictEqual(createReference(patient));
      expect(encounter.period).toStrictEqual({
        start: '2023-10-12T08:00:00',
        end: '2023-10-12T08:30:00',
      });
      expect(encounter.length).toStrictEqual({ value: 0, unit: 'd' });
      expect(encounter.extension).toStrictEqual([
        {
          url: 'https://medplum.com/fhir/StructureDefinition/encounter-description',
          valueString: 'Encounter to Document Medications',
        },
      ]);
      expect(encounter.diagnosis).toBeUndefined();
      expect(encounter.hospitalization).toBeUndefined();
    });
  });

  test('creates an Encounter with diagnosis', async () => {
    const patient = await handler(medplum, { bot, input, contentType, secrets });

    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patient),
    });

    expect(encounters).toHaveLength(4);
    const encounter = encounters[2];
    expect(encounter.status).toStrictEqual('finished');
    expect(encounter.class).toStrictEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
      code: 'UNK',
      display: 'unknown',
    });
    expect(encounter.type).toStrictEqual([
      {
        coding: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '99202',
            display:
              'Office or other outpatient visit for the evaluation and management of a new patient, which requires a medically appropriate history and/or examination and straightforward medical decision making. When using total time on the date of the encounter for code selection, 15 minutes must be met or exceeded.',
          },
        ],
      },
    ]);
    expect(encounter.subject).toStrictEqual(createReference(patient));
    expect(encounter.period).toStrictEqual({
      start: '2023-11-02T17:00:00',
      end: '2023-11-02T18:00:00',
    });
    expect(encounter.length).toStrictEqual({ value: 0, unit: 'd' });
    expect(encounter.extension).toStrictEqual([
      {
        url: 'https://medplum.com/fhir/StructureDefinition/encounter-description',
        valueString: 'Encounter to Document Medications',
      },
    ]);
    expect(encounter.hospitalization).toBeUndefined();

    const conditions = await medplum.searchResources('Condition', {
      subject: getReferenceString(patient),
    });

    expect(conditions).toHaveLength(1);
    const condition = conditions[0];
    expect(condition.code?.coding?.[0]).toStrictEqual({
      system: 'http://snomed.info/sct',
      code: '10811161000119107',
      display: 'Major depressive disorder in mother complicating pregnancy (disorder)',
    });
    expect(encounter.diagnosis).toStrictEqual([
      {
        condition: createReference(condition),
        rank: 1,
      },
    ]);
  });

  test('creates an Encounter with discharge disposition', async () => {
    const patient = await handler(medplum, { bot, input, contentType, secrets });

    const encounters = await medplum.searchResources('Encounter', {
      subject: getReferenceString(patient),
    });

    expect(encounters).toHaveLength(4);
    const encounter = encounters[3];
    expect(encounter.status).toStrictEqual('finished');
    expect(encounter.class).toStrictEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
      code: 'UNK',
      display: 'unknown',
    });
    expect(encounter.type).toStrictEqual([
      {
        coding: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '90837',
            display: 'Psychotherapy, 60 minutes with patient',
          },
        ],
      },
    ]);
    expect(encounter.subject).toStrictEqual(createReference(patient));
    expect(encounter.period).toStrictEqual({
      start: '2023-11-11T08:30:00',
      end: '2023-11-11T09:30:00',
    });
    expect(encounter.length).toStrictEqual({ value: 0, unit: 'd' });
    expect(encounter.extension).toStrictEqual([
      {
        url: 'https://medplum.com/fhir/StructureDefinition/encounter-description',
        valueString: 'Encounter Inpatient',
      },
    ]);
    expect(encounter.hospitalization?.dischargeDisposition?.coding?.[0]).toStrictEqual({
      system: 'http://snomed.info/sct',
      code: '428371000124100',
      display: 'Discharge to healthcare facility for hospice care (procedure)',
    });
    expect(encounter.diagnosis).toBeUndefined();
  });

  describe('Procedure', () => {
    const interventionCategoryFilter = `${SNOMED}|409063005`;
    const procedureCategoryFilter = `${SNOMED}|103693007`;

    test('creates multiple Procedure resources', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const interventions = await medplum.searchResources('Procedure', {
        subject: getReferenceString(patient),
        category: interventionCategoryFilter,
      });
      const procedures = await medplum.searchResources('Procedure', {
        subject: getReferenceString(patient),
        category: procedureCategoryFilter,
      });

      expect(interventions).toHaveLength(2);
      expect(procedures).toHaveLength(1);
    });

    test('creates a Procedure for intervention with author date/time and negation reason', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const interventions = await medplum.searchResources('Procedure', {
        subject: getReferenceString(patient),
        category: interventionCategoryFilter,
      });

      expect(interventions).toHaveLength(2);
      const intervention = interventions[0];
      expect(intervention.status).toStrictEqual('completed');
      expect(intervention.subject).toStrictEqual(createReference(patient));
      expect(intervention.code).toStrictEqual({
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '428191000124101',
            display: 'Documentation of current medications (procedure)',
          },
        ],
      });
      expect(intervention.performedDateTime).toStrictEqual('2023-11-11T08:30:00');
      expect(intervention.statusReason?.coding?.[0]).toStrictEqual({
        system: 'http://snomed.info/sct',
        code: '183932001',
        display: 'Procedure contraindicated (situation)',
      });
      expect(intervention.performedPeriod).toBeUndefined();
    });

    test('creates a Procedure for intervention with relevant and author date/time', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const interventions = await medplum.searchResources('Procedure', {
        subject: getReferenceString(patient),
        category: interventionCategoryFilter,
      });

      expect(interventions).toHaveLength(2);
      const intervention = interventions[1];
      expect(intervention.status).toStrictEqual('completed');
      expect(intervention.subject).toStrictEqual(createReference(patient));
      expect(intervention.code).toStrictEqual({
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '428191000124101',
            display: 'Documentation of current medications (procedure)',
          },
        ],
      });
      expect(intervention.performedPeriod).toStrictEqual({
        start: '2023-12-04T08:30:00',
        end: '2023-12-04T08:30:00',
      });
      expect(intervention.performedDateTime).toStrictEqual('2023-12-04T15:00:00');
      expect(intervention.statusReason).toBeUndefined();
    });

    test('creates a Procedure with full set of fields', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const procedures = await medplum.searchResources('Procedure', {
        subject: getReferenceString(patient),
        category: procedureCategoryFilter,
      });

      expect(procedures).toHaveLength(1);
      const procedure = procedures[0];
      expect(procedure.status).toStrictEqual('completed');
      expect(procedure.subject).toStrictEqual(createReference(patient));
      expect(procedure.code).toStrictEqual({
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '428191000124101',
            display: 'Documentation of current medications (procedure)',
          },
        ],
      });
      expect(procedure.performedPeriod).toStrictEqual({
        start: '2023-04-01T16:00:00',
        end: '2023-04-01T16:00:00',
      });
      expect(procedure.performedDateTime).toStrictEqual('2023-04-01T17:00:00');
      expect(procedure.statusReason?.coding?.[0]).toStrictEqual({
        system: 'http://snomed.info/sct',
        code: '183932001',
        display: 'Procedure contraindicated (situation)',
      });
      expect(procedure.extension).toStrictEqual([
        {
          url: extensionURLMapping.procedureRank,
          valueInteger: 1,
        },
      ]);
    });
  });

  describe('Coverage', () => {
    test('creates multiple Coverage resources', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const coverages = await medplum.searchResources('Coverage', {
        beneficiary: getReferenceString(patient),
      });
      expect(coverages).toHaveLength(1);
    });

    test('creates a Coverage resource with required fields', async () => {
      const patient = await handler(medplum, { bot, input, contentType, secrets });

      const coverages = await medplum.searchResources('Coverage', {
        beneficiary: getReferenceString(patient),
      });

      expect(coverages).toHaveLength(1);
      const coverage = coverages[0];
      expect(coverage.status).toStrictEqual('active');
      expect(coverage.beneficiary).toStrictEqual(createReference(patient));
      expect(coverage.payor).toStrictEqual([createReference(patient)]);
      expect(coverage.type).toStrictEqual({
        coding: [
          {
            system: 'https://nahdo.org/sopt',
            code: '9',
            display: 'MISCELLANEOUS/OTHER',
          },
        ],
      });
      expect(coverage.period).toStrictEqual({ start: '2022-12-21T00:00:00' });
    });
  });
});
