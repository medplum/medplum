import { BotEvent, Hl7Message, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Hl7Message> {
  const input = event.input as Hl7Message;
  // Log Message Type
  const messageType = input.getSegment('MSH')?.getField(9)?.getComponent(1) as string;
  console.log(messageType);

  // Get patient name
  const givenName = input.getSegment('EVN')?.getField(5).getComponent(1) as string;
  const familyName = input.getSegment('EVN')?.getField(5).getComponent(2) as string;

  // Get patient ID
  const mrnNumber = input.getSegment('PID')?.getField(3).getComponent(4);

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
