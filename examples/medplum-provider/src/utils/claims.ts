// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { CPT, createReference } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimItem,
  Coverage,
  Encounter,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { calculateTotalPrice } from './chargeitems';
import { createSelfPayCoverage } from './coverage';

export async function createClaimFromEncounter(
  medplum: MedplumClient,
  patient: WithId<Patient>,
  encounter: WithId<Encounter>,
  practitioner: WithId<Practitioner>,
  chargeItems: WithId<ChargeItem>[]
): Promise<WithId<Claim> | undefined> {
  const coverageResults = await medplum.searchResources('Coverage', `patient=Patient/${patient.id}&status=active`);
  let coverage: Coverage = coverageResults[0];
  if (!coverage) {
    coverage = await createSelfPayCoverage(medplum, patient);
  }

  const claim: Claim = {
    resourceType: 'Claim',
    status: 'draft',
    type: { coding: [{ code: 'professional' }] },
    use: 'claim',
    created: new Date().toISOString(),
    patient: createReference(patient),
    provider: createReference(practitioner),
    priority: { coding: [{ code: 'normal' }] },
    insurance: [
      {
        sequence: 1,
        focal: true,
        coverage: createReference(coverage),
      },
    ],
    item: getCptChargeItems(chargeItems, createReference(encounter)),
    total: { value: calculateTotalPrice(chargeItems) },
  };
  return medplum.createResource(claim);
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
