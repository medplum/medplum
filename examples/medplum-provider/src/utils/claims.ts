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
  Organization,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { calculateTotalPrice } from './chargeitems';

const ICD10_CM = `${HTTP_HL7_ORG}/fhir/sid/icd-10-cm`;

/** A claim line can point at no more than four diagnoses (CMS-1500 Box 24E). */
const MAX_DIAGNOSIS_POINTERS = 4;

export interface BuildClaimArgs {
  patient: WithId<Patient>;
  encounter: WithId<Encounter>;
  practitioner: WithId<Practitioner>;
  chargeItems: ChargeItem[];
  conditions?: Condition[];
  insurance?: Reference<Coverage>[];
  /** Billing Organization for `Claim.provider`; omit for individual billing under the practitioner. */
  billingOrganization?: Reference<Organization>;
}

/**
 * Builds a draft Claim from the current encounter state. This is a pure, in-memory
 * transformation: it performs no server reads or writes. Persisting the Claim
 * (create or update) is the caller's responsibility, and only happens at export or
 * submit time.
 *
 * The billing provider (`Claim.provider`) is the given billing Organization when
 * provided (organization billing), falling back to the practitioner (individual
 * billing). The practitioner is always the rendering provider on `Claim.careTeam`.
 * The encounter's first location, when set, is the claim's service facility.
 *
 * @param args - Patient, encounter, practitioner, charge items, conditions, insurance, and billing organization.
 * @returns An unpersisted Claim resource.
 */
export function buildClaimFromEncounter(args: BuildClaimArgs): Claim {
  const { patient, encounter, practitioner, chargeItems, conditions, insurance, billingOrganization } = args;
  return {
    resourceType: 'Claim',
    status: 'draft',
    type: { coding: [{ code: 'professional' }] },
    use: 'claim',
    created: new Date().toISOString(),
    patient: createReference(patient),
    provider: billingOrganization ?? createReference(practitioner),
    // Always present so a stale facility on a stored claim is overridden when the claim is regenerated
    // by spreading this over it; JSON serialization drops the undefined key.
    facility: encounter.location?.[0]?.location,
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

/**
 * Builds one claim line per CPT-coded charge item, pointing each at the diagnoses in its `reason`.
 *
 * @param chargeItems - The encounter's charge items.
 * @param encounter - The encounter the lines belong to.
 * @param conditions - The claim's diagnosis Conditions, in the order passed to {@link createDiagnosisArray}.
 * @returns One claim line per CPT-coded charge item.
 */
export function getCptChargeItems(
  chargeItems: ChargeItem[],
  encounter: Reference<Encounter>,
  conditions?: Condition[]
): ClaimItem[] {
  const diagnosisCodes = (conditions ?? []).map(
    (condition) => condition.code?.coding?.find((c) => c.system === ICD10_CM)?.code
  );
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
 * Maps a charge item's ICD-10-CM `reason` codings to `Claim.item.diagnosisSequence` values.
 *
 * @param chargeItem - The charge item, whose `reason` may carry ICD-10-CM codings.
 * @param diagnosisCodes - ICD-10-CM codes in claim diagnosis order (sequence = index + 1).
 * @returns 1-based diagnosis pointers for the claim line; empty when none match.
 */
function getDiagnosisPointers(chargeItem: ChargeItem, diagnosisCodes: (string | undefined)[]): number[] {
  const pointers = (chargeItem.reason ?? [])
    .flatMap((reason) => reason.coding ?? [])
    .filter((coding) => coding.system === ICD10_CM && coding.code)
    .map((coding) => diagnosisCodes.indexOf(coding.code) + 1)
    .filter((pointer) => pointer > 0);
  return [...new Set(pointers)].slice(0, MAX_DIAGNOSIS_POINTERS);
}

export function createDiagnosisArray(conditions: Condition[]): ClaimDiagnosis[] {
  return conditions.map((condition, index) => {
    const icd10Coding = condition.code?.coding?.find((c) => c.system === ICD10_CM);
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
