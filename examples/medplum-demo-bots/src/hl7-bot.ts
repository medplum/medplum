import { BotEvent, Hl7Message, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Hl7Message> {
  const input = event.input as Hl7Message;

  // Log Message Type
  const messageType = input.getSegment('MSH')?.getField(9)?.getComponent(1) as string;
  const messageSubtype = input.getSegment('MSH')?.getField(9)?.getComponent(2) as string;

  // If this is anything but ADT^A28, ADT^A08, ADT^A30 then exit
  if (messageType !== 'ADT') {
    return input.buildAck();
  }

  if (messageSubtype !== 'A28' && messageSubtype !== 'A08' && messageSubtype !== 'A30') {
    return input.buildAck();
  }

  // Get patient name
  const givenName = input.getSegment('PID')?.getField(5).getComponent(2) as string;
  const familyName = input.getSegment('PID')?.getField(5).getComponent(1) as string;

  // Get patient ID
  const mrnNumber = input.getSegment('PID')?.getField(3).getComponent(1) as string;

  // Get patient address
  const addressLine = input.getSegment('PID')?.getField(11).getComponent(1) as string;
  const city = input.getSegment('PID')?.getField(11).getComponent(3) as string;
  const state = input.getSegment('PID')?.getField(11).getComponent(4) as string;
  const postalCode = input.getSegment('PID')?.getField(11).getComponent(5) as string;
  const country = input.getSegment('PID')?.getField(11).getComponent(6) as string;

  let patient = await medplum.searchOne('Patient', 'identifier=' + mrnNumber);

  if (patient) {
    console.log('Patient already in the system');
    // Update patient information
    patient.name = [
      {
        given: [givenName],
        family: familyName,
      },
    ];
    patient.address = [
      {
        line: [addressLine],
        city: city,
        state: state,
        postalCode: postalCode,
        country: country,
      },
    ];
    patient = await medplum.updateResource<Patient>(patient);
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
      address: [
        {
          line: [addressLine],
          city: city,
          state: state,
          postalCode: postalCode,
          country: country,
        },
      ],
    });
  }

  // Return Ack
  return input.buildAck();
}
