import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const firstName = patient.name?.[0]?.given?.[0];
  const lastName = patient.name?.[0]?.family;
  console.log(`Hello ${firstName} ${lastName}!`);
  return true;
}
