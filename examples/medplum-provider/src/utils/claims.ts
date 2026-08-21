// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, createReference, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  ClaimItem,
  Coding,
  Condition,
  Coverage,
  Encounter,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { calculateTotalPrice } from './chargeitems';

const ICD10_CM = `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`;

/** CMS-1500 Box 21 holds diagnoses A-L. */
export const MAX_CLAIM_DIAGNOSES = 12;

/** CMS-1500 Box 24E allows up to 4 diagnosis pointers per service line. */
export const MAX_DIAGNOSIS_POINTERS = 4;

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
    item: getCptChargeItems(chargeItems, createReference(encounter), conditions),
    total: { value: calculateTotalPrice(chargeItems) },
  };
}

export function getCptChargeItems(
  chargeItems: ChargeItem[],
  encounter: Reference<Encounter>,
  conditions?: Condition[]
): ClaimItem[] {
  const diagnosisCodes = getClaimDiagnosisCodings(conditions ?? []).map((coding) => coding.code);
  const cptChargeItems = chargeItems.filter((item) => item.code?.coding?.some((coding) => coding.system === CPT));
  return cptChargeItems.map((chargeItem: ChargeItem, index: number) => {
    const modifiers = chargeItem.extension
      ?.filter((ext) => ext.url === 'http://hl7.org/fhir/StructureDefinition/chargeitem-modifier')
      .map((ext) => {
        return ext.valueCodeableConcept;
      })
      .filter((modifier) => modifier !== undefined);

    const diagnosisSequence = getDiagnosisPointers(chargeItem, diagnosisCodes);

    return {
      sequence: index + 1,
      encounter: [encounter],
      productOrService: {
        coding: chargeItem.code.coding?.filter((coding) => coding.system === CPT),
        text: chargeItem.code.text,
      },
      net: chargeItem.priceOverride,
      ...(modifiers && modifiers.length > 0 ? { modifier: modifiers } : {}),
      ...(diagnosisSequence.length > 0 ? { diagnosisSequence } : {}),
    };
  });
}

/**
 * Maps a charge item's `reason` diagnoses (ICD-10-CM codings) to 1-based positions in the
 * claim's diagnosis list, i.e. `Claim.item.diagnosisSequence` (CMS-1500 Box 24E pointers).
 * A line with no matching diagnosis gets no pointer: only the charge item related to the
 * order that carries a diagnosis should point at it, and the coder fills in the rest.
 *
 * @param chargeItem - The charge item, whose `reason` may carry ICD-10-CM codings.
 * @param diagnosisCodes - Ordered ICD-10-CM codes defining the claim's diagnosis sequence.
 * @returns 1-based diagnosis pointers for the claim line; empty when none match.
 */
function getDiagnosisPointers(chargeItem: ChargeItem, diagnosisCodes: (string | undefined)[]): number[] {
  const pointers: number[] = [];
  for (const reason of chargeItem.reason ?? []) {
    for (const coding of reason.coding ?? []) {
      if (coding.system !== ICD10_CM || !coding.code) {
        continue;
      }
      const index = diagnosisCodes.indexOf(coding.code);
      if (index >= 0 && !pointers.includes(index + 1)) {
        pointers.push(index + 1);
      }
    }
  }
  return pointers.slice(0, MAX_DIAGNOSIS_POINTERS);
}

/**
 * The ordered, deduplicated ICD-10-CM codings that define the claim's diagnosis sequence:
 * one per unique code, in condition (rank) order, capped at {@link MAX_CLAIM_DIAGNOSES}.
 * Conditions without an ICD-10-CM coding are skipped so they cannot occupy a Box 21 slot
 * with an empty code or shift the pointers of the diagnoses after them.
 *
 * @param conditions - Conditions in `Encounter.diagnosis` rank order.
 * @returns ICD-10-CM codings in claim sequence order (sequence = index + 1).
 */
function getClaimDiagnosisCodings(conditions: Condition[]): Coding[] {
  const codings: Coding[] = [];
  for (const condition of conditions) {
    const coding = condition.code?.coding?.find((c) => c.system === ICD10_CM);
    if (coding?.code && !codings.some((existing) => existing.code === coding.code)) {
      codings.push(coding);
    }
  }
  return codings.slice(0, MAX_CLAIM_DIAGNOSES);
}

export function createDiagnosisArray(conditions: Condition[]): ClaimDiagnosis[] {
  return getClaimDiagnosisCodings(conditions).map((icd10Coding, index) => ({
    diagnosisCodeableConcept: {
      // The CMS-1500 renderer matches on the icd-10 system URI; the codes are ICD-10-CM
      coding: [{ ...icd10Coding, system: `${HTTP_HL7_ORG}/fhir/sid/icd-10` }],
    },
    sequence: index + 1,
    type: [{ coding: [{ code: index === 0 ? 'principal' : 'secondary' }] }],
  }));
}
