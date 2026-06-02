// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, HTTP_HL7_ORG, createReference } from '@medplum/core';
import type { ChargeItem, Condition, Coverage, Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { buildClaimFromEncounter, getCptChargeItems } from './claims';

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
});
