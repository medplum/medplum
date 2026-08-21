// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HTTP_HL7_ORG } from '@medplum/core';
import type { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { addDiagnosesToEncounter } from './conditions';

const ICD_10_CM = `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`;

describe('addDiagnosesToEncounter', () => {
  let medplum: MockClient;
  let patient: Patient;
  let encounter: Encounter;

  beforeEach(async () => {
    medplum = new MockClient();
    patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { code: 'AMB' },
      subject: { reference: `Patient/${patient.id}` },
    });
  });

  test('creates conditions and appends ranked encounter diagnoses', async () => {
    const result = await addDiagnosesToEncounter(medplum, patient, encounter, [
      { coding: [{ system: ICD_10_CM, code: 'E11.9', display: 'Type 2 diabetes mellitus' }] },
      { coding: [{ system: ICD_10_CM, code: 'I10', display: 'Essential hypertension' }] },
    ]);

    expect(result.diagnosis).toHaveLength(2);
    expect(result.diagnosis?.[0].rank).toBe(1);
    expect(result.diagnosis?.[1].rank).toBe(2);

    const conditions = await Promise.all(
      (result.diagnosis ?? []).map((d) => medplum.readReference(d.condition as any))
    );
    expect((conditions[0] as Condition).code?.coding?.[0].code).toBe('E11.9');
    expect((conditions[1] as Condition).code?.coding?.[0].code).toBe('I10');
    expect((conditions[0] as Condition).encounter?.reference).toBe(`Encounter/${encounter.id}`);
    expect((conditions[0] as Condition).subject?.reference).toBe(`Patient/${patient.id}`);
    expect((conditions[0] as Condition).meta?.profile).toContain(
      `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns`
    );
  });

  test('skips ICD-10-CM codes already on the encounter', async () => {
    const existing = await medplum.createResource<Condition>({
      resourceType: 'Condition',
      subject: { reference: `Patient/${patient.id}` },
      code: { coding: [{ system: ICD_10_CM, code: 'E11.9' }] },
    });
    encounter = await medplum.updateResource<Encounter>({
      ...encounter,
      diagnosis: [{ condition: { reference: `Condition/${existing.id}` }, rank: 1 }],
    });

    const result = await addDiagnosesToEncounter(medplum, patient, encounter, [
      { coding: [{ system: ICD_10_CM, code: 'E11.9' }] },
      { coding: [{ system: ICD_10_CM, code: 'I10' }] },
    ]);

    expect(result.diagnosis).toHaveLength(2);
    expect(result.diagnosis?.[0].condition?.reference).toBe(`Condition/${existing.id}`);
    expect(result.diagnosis?.[1].rank).toBe(2);
  });

  test('ignores diagnoses without an ICD-10-CM coding and leaves the encounter unchanged', async () => {
    const result = await addDiagnosesToEncounter(medplum, patient, encounter, [
      { coding: [{ system: 'http://snomed.info/sct', code: '44054006' }] },
      { text: 'free text only' },
    ]);

    expect(result.diagnosis).toBeUndefined();
  });

  test('re-reads the encounter before writing', async () => {
    // Simulate a concurrent edit: the caller holds a stale copy with no diagnosis
    const staleCopy = { ...encounter };
    const existing = await medplum.createResource<Condition>({
      resourceType: 'Condition',
      subject: { reference: `Patient/${patient.id}` },
      code: { coding: [{ system: ICD_10_CM, code: 'R53.83' }] },
    });
    await medplum.updateResource<Encounter>({
      ...encounter,
      diagnosis: [{ condition: { reference: `Condition/${existing.id}` }, rank: 1 }],
    });

    const result = await addDiagnosesToEncounter(medplum, patient, staleCopy, [
      { coding: [{ system: ICD_10_CM, code: 'I10' }] },
    ]);

    expect(result.diagnosis).toHaveLength(2);
    expect(result.diagnosis?.[0].condition?.reference).toBe(`Condition/${existing.id}`);
  });
});
