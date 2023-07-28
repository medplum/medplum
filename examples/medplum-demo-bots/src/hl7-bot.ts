import { BotEvent, Hl7Message, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Hl7Message> {
  const input = event.input as Hl7Message;
  // Log Message Type
  const messageType = input.get('MSH')?.get(8);
  console.log(messageType);

  // Get patient name
  const givenName = input.get('EVN')?.get(5).get(1) as string;
  const familyName = input.get('EVN')?.get(5).get(2) as string;

  // Get patient ID
  const mrnNumber = input.get('PID')?.get(3).get(4);

  let patient = await medplum.searchOne('Patient', 'identifier=' + mrnNumber);

  if (patient) {
    console.log('Patient already in the system');
  } else {
    patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        {
          given: [givenName],
          family: familyName,
        },
      ],
      identifier: [
        {
          system: 'www.myhospitalsystem.org/IDs',
          value: mrnNumber,
        },
      ],
    });
    console.log('Created patient', patient.id);
  }

  // Based on the messageType, you may consider making additional FHIR objects here

  // Return Ack
  return input.buildAck();
}
