// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, HTTP_HL7_ORG, createReference } from '@medplum/core';
import type { ChargeItem, Condition, Coverage, Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { buildClaimFromEncounter, createDiagnosisArray, getCptChargeItems, MAX_CLAIM_DIAGNOSES } from './claims';

const ICD10_CM = `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`;

function condition(id: string, code?: string): Condition {
  return {
    resourceType: 'Condition',
    id,
    subject: { reference: 'Patient/patient-1' },
    ...(code ? { code: { coding: [{ system: ICD10_CM, code }] } } : {}),
  };
}

function chargeWithReason(id: string, reasonCodes: string[]): ChargeItem {
  return {
    resourceType: 'ChargeItem',
    id,
    code: { coding: [{ system: CPT, code: '99213' }] },
    reason: reasonCodes.map((code) => ({ coding: [{ system: ICD10_CM, code }] })),
    status: 'billable',
    subject: { reference: 'Patient/patient-1' },
  };
}

describe('claims utils', () => {
  const patient: WithId<Patient> = { resourceType: 'Patient', id: 'patient-1' };
  const encounter: WithId<Encounter> = {
    resourceType: 'Encounter',
    id: 'encounter-1',
    status: 'finished',
    class: { code: 'outpatient' },
    subject: createReference(patient),
  };
  const practitioner: WithId<Practitioner> = { resourceType: 'Practitioner', id: 'practitioner-1' };
  const coverage: WithId<Coverage> = {
    resourceType: 'Coverage',
    id: 'coverage-1',
    status: 'active',
    beneficiary: { reference: 'Patient/patient-1' },
    payor: [{ reference: 'Organization/organization-1' }],
  };
  const chargeItems: WithId<ChargeItem>[] = [
    {
      resourceType: 'ChargeItem',
      id: 'charge-1',
      code: { coding: [{ system: CPT, code: '1111' }], text: 'Visit' },
      priceOverride: { value: 25 },
      status: 'billable',
      subject: { reference: 'Patient/patient-1' },
    },
  ];

  describe('getCptChargeItems', () => {
    test('filters charge items to CPT codings and preserves modifiers', () => {
      const cptItem: ChargeItem = {
        resourceType: 'ChargeItem',
        id: 'charge-1',
        code: {
          text: 'Test CPT',
          coding: [
            { system: CPT, code: '1234' },
            { system: 'http://example.com', code: 'other' },
          ],
        },
        priceOverride: { value: 42 },
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/chargeitem-modifier',
            valueCodeableConcept: { coding: [{ code: '59' }] },
          },
        ],
        status: 'billable',
        subject: { reference: 'Patient/patient-1' },
      };
      const nonCptItem: ChargeItem = {
        resourceType: 'ChargeItem',
        id: 'charge-2',
        code: { coding: [{ system: 'http://example.com', code: 'not-cpt' }] },
        status: 'billable',
        subject: { reference: 'Patient/patient-1' },
      };

      const items = getCptChargeItems([cptItem, nonCptItem], { reference: 'Encounter/enc-1' });

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(
        expect.objectContaining({
          sequence: 1,
          encounter: [{ reference: 'Encounter/enc-1' }],
          productOrService: expect.objectContaining({
            coding: [{ system: CPT, code: '1234' }],
            text: 'Test CPT',
          }),
          modifier: [{ coding: [{ code: '59' }] }],
          net: { value: 42 },
        })
      );
    });
  });

  describe('buildClaimFromEncounter', () => {
    test('builds an in-memory draft claim from encounter state', () => {
      const result = buildClaimFromEncounter({
        patient,
        encounter,
        practitioner,
        chargeItems,
        insurance: [createReference(coverage)],
      });

      // No persistence: the returned claim has no id.
      expect(result.id).toBeUndefined();
      expect(result).toEqual(
        expect.objectContaining({
          resourceType: 'Claim',
          status: 'draft',
          patient: expect.objectContaining({ reference: 'Patient/patient-1' }),
          provider: expect.objectContaining({ reference: 'Practitioner/practitioner-1' }),
          insurance: [
            expect.objectContaining({
              sequence: 1,
              focal: true,
              coverage: expect.objectContaining({ reference: 'Coverage/coverage-1' }),
            }),
          ],
          total: { value: 25 },
        })
      );
      expect(result.item).toHaveLength(1);
    });

    test('adds the rendering practitioner to careTeam as the primary provider', () => {
      const result = buildClaimFromEncounter({ patient, encounter, practitioner, chargeItems });
      expect(result.careTeam).toEqual([
        expect.objectContaining({
          sequence: 1,
          provider: expect.objectContaining({ reference: 'Practitioner/practitioner-1' }),
          role: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claimcareteamrole', code: 'primary' }],
          },
        }),
      ]);
    });

    test('defaults insurance to an empty array when none is provided', () => {
      const result = buildClaimFromEncounter({ patient, encounter, practitioner, chargeItems });
      expect(result.insurance).toEqual([]);
    });

    test('maps conditions to a diagnosis array, rewriting ICD-10-CM to ICD-10', () => {
      const conditions: Condition[] = [
        {
          resourceType: 'Condition',
          id: 'condition-1',
          subject: { reference: 'Patient/patient-1' },
          code: { coding: [{ system: `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`, code: 'R51' }] },
        },
        {
          resourceType: 'Condition',
          id: 'condition-2',
          subject: { reference: 'Patient/patient-1' },
          code: { coding: [{ system: `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`, code: 'J00' }] },
        },
      ];

      const result = buildClaimFromEncounter({ patient, encounter, practitioner, chargeItems, conditions });

      expect(result.diagnosis).toHaveLength(2);
      expect(result.diagnosis?.[0]).toEqual(
        expect.objectContaining({
          sequence: 1,
          type: [{ coding: [{ code: 'principal' }] }],
          diagnosisCodeableConcept: {
            coding: [expect.objectContaining({ system: `${HTTP_HL7_ORG}/fhir/sid/icd-10`, code: 'R51' })],
          },
        })
      );
      expect(result.diagnosis?.[1]?.type).toEqual([{ coding: [{ code: 'secondary' }] }]);
    });

    test('omits diagnosis when there are no conditions', () => {
      const result = buildClaimFromEncounter({ patient, encounter, practitioner, chargeItems });
      expect(result.diagnosis).toBeUndefined();
    });
  });

  describe('diagnosis pointers (Claim.item.diagnosisSequence)', () => {
    const encounterRef = { reference: 'Encounter/encounter-1' };
    const conditions = [condition('c1', 'E11.9'), condition('c2', 'I10'), condition('c3', 'R53.83')];

    test('maps ChargeItem.reason codes to positions in the ranked diagnosis list', () => {
      const items = getCptChargeItems([chargeWithReason('ch1', ['R53.83', 'E11.9'])], encounterRef, conditions);
      expect(items[0].diagnosisSequence).toEqual([3, 1]);
    });

    test('omits the pointer when a line has no matching reason', () => {
      const items = getCptChargeItems([chargeWithReason('ch1', []), chargeItems[0]], encounterRef, conditions);
      expect(items[0].diagnosisSequence).toBeUndefined();
      expect(items[1].diagnosisSequence).toBeUndefined();
    });

    test('omits diagnosisSequence entirely when the claim has no diagnoses', () => {
      const items = getCptChargeItems([chargeWithReason('ch1', ['E11.9'])], encounterRef, []);
      expect(items[0].diagnosisSequence).toBeUndefined();
    });

    test('caps pointers at 4 per service line', () => {
      const manyConditions = ['A', 'B', 'C', 'D', 'E', 'F'].map((code, i) => condition(`c${i}`, code));
      const items = getCptChargeItems(
        [chargeWithReason('ch1', ['A', 'B', 'C', 'D', 'E', 'F'])],
        encounterRef,
        manyConditions
      );
      expect(items[0].diagnosisSequence).toEqual([1, 2, 3, 4]);
    });

    test('ignores duplicate and unmatched reason codes', () => {
      const items = getCptChargeItems([chargeWithReason('ch1', ['I10', 'I10', 'Z99.9'])], encounterRef, conditions);
      expect(items[0].diagnosisSequence).toEqual([2]);
    });
  });

  describe('createDiagnosisArray', () => {
    test('dedupes conditions by ICD-10-CM code and skips conditions without one', () => {
      const result = createDiagnosisArray([
        condition('c1', 'E11.9'),
        condition('c2'), // no code — must not occupy a Box 21 slot
        condition('c3', 'E11.9'), // duplicate
        condition('c4', 'I10'),
      ]);
      expect(result).toHaveLength(2);
      expect(result[0].diagnosisCodeableConcept?.coding?.[0].code).toBe('E11.9');
      expect(result[1].diagnosisCodeableConcept?.coding?.[0].code).toBe('I10');
      expect(result[1].sequence).toBe(2);
    });

    test('caps the claim at 12 diagnoses (CMS-1500 Box 21 A-L)', () => {
      const many = Array.from({ length: 15 }, (_, i) => condition(`c${i}`, `Z${i}`));
      const result = createDiagnosisArray(many);
      expect(result).toHaveLength(MAX_CLAIM_DIAGNOSES);
      expect(result[11].sequence).toBe(12);
    });

    test('pointer positions stay aligned with diagnosis sequence when conditions are skipped', () => {
      const mixed = [condition('c1'), condition('c2', 'E11.9'), condition('c3', 'I10')];
      const diagnosis = createDiagnosisArray(mixed);
      const items = getCptChargeItems([chargeWithReason('ch1', ['I10'])], { reference: 'Encounter/e1' }, mixed);
      expect(diagnosis[1].diagnosisCodeableConcept?.coding?.[0].code).toBe('I10');
      expect(items[0].diagnosisSequence).toEqual([2]);
    });
  });
});
