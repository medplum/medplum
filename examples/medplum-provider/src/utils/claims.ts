import { Claim, ChargeItem, Coverage } from '@medplum/fhirtypes';
import { getReferenceString, MedplumClient } from '@medplum/core';
import { calculateTotalPrice } from './chargeitems';
import { createSelfPayCoverage } from './coverage';

export async function createClaimFromEncounter(
  medplum: MedplumClient,
  patientId: string,
  encounterId: string,
  practitionerId: string,
  chargeItems: ChargeItem[]
): Promise<Claim | undefined> {

  const coverageResults = await medplum.searchResources('Coverage', `patient=Patient/${patientId}&status=active`);
  let coverage: Coverage = coverageResults[0];
  if (!coverage) {
    coverage = await createSelfPayCoverage(medplum, patientId);
  }

  const claim: Claim = {
    resourceType: 'Claim',
    status: 'draft',
    type: { coding: [{ code: 'professional' }] },
    use: 'claim',
    created: new Date().toISOString(),
    patient: { reference: `Patient/${patientId}` },
    provider: { reference: `Practitioner/${practitionerId}`, type: 'Practitioner' },
    priority: { coding: [{ code: 'normal' }] },
    insurance: [
      {
        sequence: 1,
        focal: true,
        coverage: { reference: getReferenceString(coverage) },
      },
    ],
    item: chargeItems.map((chargeItem, index) => ({
      sequence: index + 1,
      encounter: [{ reference: `Encounter/${encounterId}` }],
      productOrService: chargeItem.code,
      net: chargeItem.priceOverride,
    })),
    total: { value: calculateTotalPrice(chargeItems) },
  };
  return medplum.createResource(claim);
}