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
import { calculateTotalPrice, getChargeItemModifiers, sortChargeItems } from './chargeitems';
import { applyPlaceOfService } from './placeOfService';

/** Who added a claim line, as a reference. */
export const LINE_AUTHOR_URL = 'https://medplum.com/fhir/StructureDefinition/claim-item-author';
/** When a claim line was added. */
export const LINE_ADDED_URL = 'https://medplum.com/fhir/StructureDefinition/claim-item-added';

/**
 * Who added a claim line, and when.
 * @param item - The claim line.
 * @returns The author and the time, when the line records them.
 */
export function getLineAuthor(item: ClaimItem): { author?: Reference; added?: string } {
  return {
    author: item.extension?.find((e) => e.url === LINE_AUTHOR_URL)?.valueReference,
    added: item.extension?.find((e) => e.url === LINE_ADDED_URL)?.valueDateTime,
  };
}

/**
 * Records who added a claim line, and when.
 * @param item - The claim line.
 * @param author - Who added it.
 * @param added - When; now by default.
 * @returns The line with its author.
 */
export function withLineAuthor(item: ClaimItem, author: Reference | undefined, added?: string): ClaimItem {
  if (!author?.reference) {
    return item;
  }
  const others = (item.extension ?? []).filter((e) => e.url !== LINE_AUTHOR_URL && e.url !== LINE_ADDED_URL);
  return {
    ...item,
    extension: [
      ...others,
      { url: LINE_AUTHOR_URL, valueReference: author },
      ...(added ? [{ url: LINE_ADDED_URL, valueDateTime: added }] : []),
    ],
  };
}

/** The visit's charge item a claim line bills. */
export const LINE_CHARGE_ITEM_URL = 'https://medplum.com/fhir/StructureDefinition/claim-item-charge-item';

/**
 * The ids of the visit charge items a claim bills.
 * @param claim - The claim.
 * @returns The charge item ids its lines record.
 */
export function getClaimChargeItemIds(claim: Claim): string[] {
  return (claim.item ?? [])
    .map((item) => item.extension?.find((e) => e.url === LINE_CHARGE_ITEM_URL)?.valueReference?.reference)
    .filter((ref): ref is string => !!ref?.startsWith('ChargeItem/'))
    .map((ref) => ref.slice('ChargeItem/'.length));
}

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
  const diagnosis = conditions?.length ? createDiagnosisArray(conditions) : [];
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
    ...(diagnosis.length ? { diagnosis } : {}),
    item: applyPlaceOfService(getCptChargeItems(chargeItems, createReference(encounter), diagnosis), encounter),
    total: { value: calculateTotalPrice(chargeItems) },
  };
}

/**
 * The claim's service lines from the visit's CPT charge items, in the visit's line order: each line's code, modifiers,
 * units, charge, and pointers to the diagnoses its charge item names in `reason`.
 * @param chargeItems - The visit's charge items.
 * @param encounter - The visit's encounter.
 * @param diagnoses - The claim's diagnoses, for the lines' pointers.
 * @returns The service lines.
 */
export function getCptChargeItems(
  chargeItems: ChargeItem[],
  encounter: Reference<Encounter>,
  diagnoses: ClaimDiagnosis[] = []
): ClaimItem[] {
  const cptChargeItems = sortChargeItems(chargeItems).filter((item) =>
    item.code?.coding?.some((coding) => coding.system === CPT)
  );
  return cptChargeItems.map((chargeItem: ChargeItem, index: number) => {
    const modifiers = getChargeItemModifiers(chargeItem);
    const units = chargeItem.quantity?.value ?? 1;
    const pointers = (chargeItem.reason ?? [])
      .map((r) => diagnoses.find((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code === r.coding?.[0]?.code))
      .map((d) => d?.sequence)
      .filter((s): s is number => s !== undefined);
    const net = chargeItem.priceOverride;
    const line: ClaimItem = {
      sequence: index + 1,
      encounter: [encounter],
      productOrService: {
        coding: chargeItem.code.coding?.filter((coding) => coding.system === CPT),
        text: chargeItem.code.text,
      },
      quantity: { value: units },
      net,
      ...(net?.value === undefined ? {} : { unitPrice: { ...net, value: net.value / (units || 1) } }),
      ...(modifiers ? { modifier: modifiers } : {}),
      ...(pointers.length ? { diagnosisSequence: pointers } : {}),
    };
    if (chargeItem.id) {
      line.extension = [{ url: LINE_CHARGE_ITEM_URL, valueReference: { reference: `ChargeItem/${chargeItem.id}` } }];
    }
    return withLineAuthor(line, chargeItem.enterer ?? chargeItem.meta?.author, chargeItem.enteredDate);
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
