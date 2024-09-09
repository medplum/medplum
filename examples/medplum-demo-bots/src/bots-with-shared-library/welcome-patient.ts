import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { getPatientName } from './helpers';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const patientName = getPatientName(patient);
  return `Welcome ${patientName}`;
}
