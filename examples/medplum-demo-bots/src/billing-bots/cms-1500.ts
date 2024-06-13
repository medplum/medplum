import { BotEvent, MedplumClient } from '@medplum/core';
import { Address, Claim } from '@medplum/fhirtypes';

interface CMS1500Output {
  insuranceProgramName: string;
  insuredIdNumber: string;
  patientName: string;
  patientDob: string;
  patientGender: string;
  insuredName: string;
  patientAddress: Address;
  patientRelation: string;
  insuredAddress: Address;
  // otherInsured: string;
  // patientConditionRelationData: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<Claim>) {
  const claim = event.input;
  const coverage = await medplum.readReference(claim.insurance[0].coverage);
  const patient = await medplum.readReference(claim.patient);
  const provider = await medplum.readReference(claim.provider);
  const insurer = claim.insurer ? await medplum.readReference(claim.insurer) : undefined;
}
