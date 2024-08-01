import { BotEvent, MedplumClient } from '@medplum/core';
import { Appointment } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Appointment>): Promise<void> {
  console.log('Appointment bot handler', event.input);
}
