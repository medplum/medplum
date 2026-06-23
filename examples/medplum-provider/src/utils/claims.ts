// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, createReference, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  ClaimItem,
  Condition,
  Coverage,
  Encounter,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { calculateTotalPrice } from './chargeitems';

export interface BuildClaimArgs {
  patient: WithId<Patient>;
  encounter: WithId<Encounter>;
  practitioner: WithId<Practitioner>;
  chargeItems: ChargeItem[];
  conditions?: Condition[];
  insurance?: Reference<Coverage>[];
}

/**
 * Builds a draft Claim from the current encounter state. This is a pure, in-memory
 * transformation: it performs no server reads or writes. Persisting the Claim
 * (create or update) is the caller's responsibility, and only happens at export or
 * submit time.
 *
 * @param args - Patient, encounter, practitioner, charge items, conditions, and insurance references.
 * @returns An unpersisted Claim resource.
 */
export function buildClaimFromEncounter(args: BuildClaimArgs): Claim {
  const { patient, encounter, practitioner, chargeItems, conditions, insurance } = args;
  return {
    resourceType: 'Claim',
    status: 'draft',
    type: { coding: [{ code: 'professional' }] },
    use: 'claim',
    created: new Date().toISOString(),
    patient: createReference(patient),
    provider: createReference(practitioner),
    careTeam: [
      {
        sequence: 1,
        provider: createReference(practitioner),
        role: {
          coding: [{ system: `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/claimcareteamrole`, code: 'primary' }],
        },
      },
    ],
    priority: { coding: [{ code: 'normal' }] },
    insurance: (insurance ?? []).map((coverage, index) => ({ sequence: index + 1, focal: index === 0, coverage })),
    ...(conditions?.length ? { diagnosis: createDiagnosisArray(conditions) } : {}),
    item: getCptChargeItems(chargeItems, createReference(encounter)),
    total: { value: calculateTotalPrice(chargeItems) },
  };
}

export function getCptChargeItems(chargeItems: ChargeItem[], encounter: Reference<Encounter>): ClaimItem[] {
  const cptChargeItems = chargeItems.filter((item) => item.code?.coding?.some((coding) => coding.system === CPT));
  return cptChargeItems.map((chargeItem: ChargeItem, index: number) => {
    const modifiers = chargeItem.extension
      ?.filter((ext) => ext.url === 'http://hl7.org/fhir/StructureDefinition/chargeitem-modifier')
      .map((ext) => {
        return ext.valueCodeableConcept;
      })
      .filter((modifier) => modifier !== undefined);

    return {
      sequence: index + 1,
      encounter: [encounter],
      productOrService: {
        coding: chargeItem.code.coding?.filter((coding) => coding.system === CPT),
        text: chargeItem.code.text,
      },
      net: chargeItem.priceOverride,
      ...(modifiers && modifiers.length > 0 ? { modifier: modifiers } : {}),
    };
  });
}

export function createDiagnosisArray(conditions: Condition[]): ClaimDiagnosis[] {
  return conditions.map((condition, index) => {
    const icd10Coding = condition.code?.coding?.find((c) => c.system === `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`);
    return {
      diagnosisCodeableConcept: {
        coding: icd10Coding
          ? [
              {
                ...icd10Coding,
                system: `${HTTP_HL7_ORG}/fhir/sid/icd-10`,
              },
            ]
          : [],
      },
      sequence: index + 1,
      type: [{ coding: [{ code: index === 0 ? 'principal' : 'secondary' }] }],
    };
  });
}
