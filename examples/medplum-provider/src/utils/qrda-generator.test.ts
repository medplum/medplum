// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, SNOMED } from '@medplum/core';
import { Coverage, Encounter, Patient, Procedure } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { fetchPatientData, generateQRDACategoryI } from './qrda-generator';
import { patientCurtisStrickland, patientJulianJohnston } from '../bots/test-data/patient-records';

describe('QRDA Generator', () => {
  let medplum: MockClient, patient: Patient, patientId: string, anotherPatient: Patient;

  const periodStart = '2023-01-01T00:00:00';
  const periodEnd = '2023-12-31T23:59:59';
  const interventionCategoryCode = '409063005';
  const procedureCategoryCode = '103693007';

  beforeEach(async () => {
    medplum = new MockClient();
    patient = await medplum.createResource(patientCurtisStrickland);
    patientId = patient.id as string;
    anotherPatient = await medplum.createResource(patientJulianJohnston);
  });

  describe('fetchPatientData', () => {
    let baseEncounter: Encounter, baseProcedure: Procedure;

    beforeEach(() => {
      baseEncounter = {
        resourceType: 'Encounter',
        status: 'finished',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        subject: createReference(patient),
      };

      baseProcedure = {
        resourceType: 'Procedure',
        status: 'completed',
        subject: createReference(patient),
      };
    });

    test('fetches patient data', async () => {
      const patientData = await fetchPatientData(medplum, patientId, periodStart, periodEnd);
      expect(Object.keys(patientData)).toEqual(['patient', 'encounters', 'interventions', 'procedures', 'coverages']);
    });

    test('fetches patient data for a single patient', async () => {
      const { patient } = await fetchPatientData(medplum, patientId, periodStart, periodEnd);
      expect(patient.id).toEqual(patientId);
    });

    test('fetches patient data and sorts them by date', async () => {
      const encounterLast = await medplum.createResource({
        ...baseEncounter,
        period: { start: '2023-10-15T08:00:00', end: '2023-10-15T09:00:00' },
      });
      const encounterFirst = await medplum.createResource({
        ...baseEncounter,
        period: { start: '2023-05-15T08:00:00', end: '2023-05-15T09:00:00' },
      });

      const interventionLast = await medplum.createResource({
        ...baseProcedure,
        category: { coding: [{ system: SNOMED, code: interventionCategoryCode }] },
        performedDateTime: '2023-10-15T08:00:00',
      });
      const interventionFirst = await medplum.createResource({
        ...baseProcedure,
        category: { coding: [{ system: SNOMED, code: interventionCategoryCode }] },
        performedDateTime: '2023-05-15T08:00:00',
      });

      const procedureLast = await medplum.createResource({
        ...baseProcedure,
        category: { coding: [{ system: SNOMED, code: procedureCategoryCode }] },
        performedPeriod: { start: '2023-10-15T08:00:00', end: '2023-10-15T09:00:00' },
      });
      const procedureFirst = await medplum.createResource({
        ...baseProcedure,
        category: { coding: [{ system: SNOMED, code: procedureCategoryCode }] },
        performedPeriod: { start: '2023-05-15T08:00:00', end: '2023-05-15T09:00:00' },
      });

      const { encounters, interventions, procedures } = await fetchPatientData(
        medplum,
        patientId,
        periodStart,
        periodEnd
      );

      expect(encounters).toHaveLength(2);
      expect(encounters[0].id).toEqual(encounterFirst.id);
      expect(encounters[1].id).toEqual(encounterLast.id);

      expect(interventions).toHaveLength(2);
      expect(interventions[0].id).toEqual(interventionFirst.id);
      expect(interventions[1].id).toEqual(interventionLast.id);

      expect(procedures).toHaveLength(2);
      expect(procedures[0].id).toEqual(procedureFirst.id);
      expect(procedures[1].id).toEqual(procedureLast.id);
    });

    test('fetches encounters for a single patient during a period', async () => {
      const anotherPatientEncounter = await medplum.createResource({
        ...baseEncounter,
        subject: createReference(anotherPatient),
        period: { start: '2022-10-01T10:00:00', end: '2022-10-01T11:00:00' },
      });

      const encounterBeforePeriod = await medplum.createResource({
        ...baseEncounter,
        period: { start: '2022-10-01T10:00:00', end: '2022-10-01T11:00:00' },
      });

      const encounterAfterPeriod = await medplum.createResource({
        ...baseEncounter,
        period: { start: '2024-05-01T00:00:00', end: '2024-05-01T01:00:00' },
      });

      const encounterWithinPeriod = await medplum.createResource({
        ...baseEncounter,
        period: { start: '2023-02-15T08:00:00', end: '2023-02-15T09:00:00' },
      });

      const { encounters } = await fetchPatientData(medplum, patientId, periodStart, periodEnd);

      // Verify that only encounters within the period are returned
      expect(encounters).toHaveLength(1);
      expect(encounters[0].id).toEqual(encounterWithinPeriod.id);
      expect(encounters.some((e) => e.id === anotherPatientEncounter.id)).toBeFalsy();
      expect(encounters.some((e) => e.id === encounterBeforePeriod.id)).toBeFalsy();
      expect(encounters.some((e) => e.id === encounterAfterPeriod.id)).toBeFalsy();
    });

    describe.each([
      {
        resourceType: 'interventions' as const,
        categoryCode: interventionCategoryCode,
        dataKey: 'interventions' as const,
      },
      {
        resourceType: 'procedures' as const,
        categoryCode: procedureCategoryCode,
        dataKey: 'procedures' as const,
      },
    ])('fetches $resourceType for a single patient during a period', ({ resourceType, categoryCode, dataKey }) => {
      it.each([
        { dateField: 'performedDateTime', dateValue: '2023-02-15T14:00:00' },
        { dateField: 'performedPeriod', dateValue: { start: '2023-02-15T14:00:00', end: '2023-02-15T14:00:00' } },
      ])('considering $dateField', async ({ dateField, dateValue }) => {
        const anotherPatientProcedure = await medplum.createResource({
          ...baseProcedure,
          category: { coding: [{ system: SNOMED, code: categoryCode }] },
          subject: createReference(anotherPatient),
          [dateField]: dateValue,
        });

        const procedureWithAnotherCategory = await medplum.createResource({
          ...baseProcedure,
          category: {
            coding: [
              {
                system: SNOMED,
                code: resourceType === 'interventions' ? procedureCategoryCode : interventionCategoryCode,
              },
            ],
          },
          [dateField]: dateValue,
        });

        const procedureBeforePeriod = await medplum.createResource({
          ...baseProcedure,
          category: { coding: [{ system: SNOMED, code: categoryCode }] },
          [dateField]:
            dateField === 'performedDateTime'
              ? '2022-10-01T10:00:00'
              : { start: '2022-10-01T10:00:00', end: '2022-10-01T11:00:00' },
        });

        const procedureAfterPeriod = await medplum.createResource({
          ...baseProcedure,
          category: { coding: [{ system: SNOMED, code: categoryCode }] },
          [dateField]:
            dateField === 'performedDateTime'
              ? '2024-05-01T00:00:00'
              : { start: '2024-05-01T00:00:00', end: '2024-05-01T00:00:00' },
        });

        const procedureWithinPeriod = await medplum.createResource({
          ...baseProcedure,
          category: { coding: [{ system: SNOMED, code: categoryCode }] },
          [dateField]: dateValue,
        });

        const patientData = await fetchPatientData(medplum, patientId, periodStart, periodEnd);
        const procedures = patientData[dataKey];

        expect(procedures).toHaveLength(1);
        expect(procedures[0].id).toEqual(procedureWithinPeriod.id);
        expect(procedures.some((p) => p.id === anotherPatientProcedure.id)).toBeFalsy();
        expect(procedures.some((p) => p.id === procedureWithAnotherCategory.id)).toBeFalsy();
        expect(procedures.some((p) => p.id === procedureBeforePeriod.id)).toBeFalsy();
        expect(procedures.some((p) => p.id === procedureAfterPeriod.id)).toBeFalsy();
      });
    });

    test('fetches coverages for a single patient', async () => {
      const baseCoverage: Coverage = {
        resourceType: 'Coverage',
        status: 'active',
        beneficiary: createReference(patient),
        payor: [createReference(patient)],
      };

      const anotherPatientCoverage = await medplum.createResource({
        ...baseCoverage,
        beneficiary: createReference(anotherPatient),
      });

      const coverageBeforePeriod = await medplum.createResource({
        ...baseCoverage,
        period: { start: '2022-10-01T10:00:00' },
      });

      const coverageAfterPeriod = await medplum.createResource({
        ...baseCoverage,
        period: { start: '2024-05-01T00:00:00' },
      });

      const coverageWithoutPeriod = await medplum.createResource({
        ...baseCoverage,
      });

      const coverageWithinPeriod = await medplum.createResource({
        ...baseCoverage,
        period: { start: '2023-02-15T14:00:00' },
      });

      const { coverages } = await fetchPatientData(medplum, patientId, periodStart, periodEnd);

      // The function returns all coverages for the patient regardless of date period
      expect(coverages).toHaveLength(4);
      // Should include all coverages for the patient
      expect(coverages.map((c) => c.id)).toEqual(
        expect.arrayContaining([
          coverageWithinPeriod.id,
          coverageBeforePeriod.id,
          coverageAfterPeriod.id,
          coverageWithoutPeriod.id,
        ])
      );
      // Verify other patient's coverage is NOT present
      expect(coverages.some((c) => c.id === anotherPatientCoverage.id)).toBeFalsy();
    });
  });

  describe('generateQRDACategoryI', () => {
    const periodStart = '2023-01-01T00:00:00';
    const periodEnd = '2023-12-31T23:59:59';

    test('does not create QRDA if patient has no data to export', async () => {
      const xml = await generateQRDACategoryI(medplum, {
        patientId,
        measurePeriodStart: periodStart,
        measurePeriodEnd: periodEnd,
      });
      expect(xml).toBeNull();
    });

    test('does not create QRDA if patient has no data to export within the period', async () => {
      await medplum.createResource({
        resourceType: 'Encounter',
        status: 'finished',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        subject: createReference(patient),
        period: { start: '2020-02-15T08:00:00', end: '2020-02-15T09:00:00' },
      });
      await medplum.createResource({
        resourceType: 'Procedure',
        status: 'completed',
        category: { coding: [{ system: SNOMED, code: interventionCategoryCode }] },
        subject: createReference(patient),
        performedDateTime: '2020-02-15T08:00:00',
      });
      await medplum.createResource({
        resourceType: 'Procedure',
        status: 'completed',
        category: { coding: [{ system: SNOMED, code: procedureCategoryCode }] },
        subject: createReference(patient),
        performedDateTime: '2020-02-15T08:00:00',
      });

      const xml = await generateQRDACategoryI(medplum, {
        patientId,
        measurePeriodStart: periodStart,
        measurePeriodEnd: periodEnd,
      });
      expect(xml).toBeNull();
    });

    test('creates QRDA if patient has data to export within the period', async () => {
      const encounter = await medplum.createResource({
        resourceType: 'Encounter',
        status: 'finished',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        subject: createReference(patient),
        period: { start: '2023-02-15T08:00:00', end: '2023-02-15T09:00:00' },
      });

      const xml = await generateQRDACategoryI(medplum, {
        patientId,
        measurePeriodStart: periodStart,
        measurePeriodEnd: periodEnd,
      });
      expect(xml).toBeDefined();
      expect(xml).toContain(encounter.id);
    });
  });
});
