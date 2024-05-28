import { BotEvent, Hl7Message, MedplumClient } from '@medplum/core';
import { Encounter, Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Hl7Message>): Promise<Hl7Message> {
  const input = event.input;
  const systemString = 'www.myhospitalsystem.org/IDs';

  // Log Message Type
  const messageType = input.getSegment('MSH')?.getField(9)?.getComponent(1) as string;
  const messageSubtype = input.getSegment('MSH')?.getField(9)?.getComponent(2) as string;

  // If this is anything but ADT
  if (messageType !== 'ADT') {
    return input.buildAck();
  }

  // Only supported message types should be processed
  if (messageSubtype !== 'A01' && messageSubtype !== 'A08' && messageSubtype !== 'A30') {
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
          system: systemString,
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

  //Create Encounter for Admissions
  if (messageSubtype === 'A01') {
    const locationString = input.getSegment('PV1')?.getField(3)?.getComponent(1) as string;
    const location = await medplum.searchOne('Location', 'identifier=' + locationString);
    await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'arrived',
      subject: {
        reference: 'Patient/' + patient.id,
      },
      class: { code: 'AMB' },
      location: [{ location: { reference: 'Location/' + location } }],
    });
  } else if (messageSubtype === 'A08') {
    let encounter = await medplum.searchOne('Encounter', 'subject=Patient/' + patient.id + '&status=arrived');
    if (encounter) {
      encounter.status = 'finished';
      encounter = await medplum.updateResource<Encounter>(encounter);
    }
  }
  // Return Ack
  return input.buildAck();
}
