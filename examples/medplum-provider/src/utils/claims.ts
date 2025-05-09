import { getReferenceString, MedplumClient } from '@medplum/core';
import { ChargeItem, Claim, Coverage } from '@medplum/fhirtypes';
import { calculateTotalPrice, getCptChargeItems } from './chargeitems';
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
    item: getCptChargeItems(chargeItems, { reference: `Encounter/${encounterId}` }),
    total: { value: calculateTotalPrice(chargeItems) },
  };
  return medplum.createResource(claim);
}
