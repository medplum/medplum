import { BotEvent, createReference, Hl7Message, MedplumClient } from '@medplum/core';
import { Claim, Coverage, Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Hl7Message>): Promise<Hl7Message> {
  const input = event.input;
  const systemString = 'MRN';

  // Verify message type is DFT
  const messageType = input.getSegment('MSH')?.getField(9)?.getComponent(1) as string;
  if (messageType !== 'DFT') {
    throw new Error('Not a DFT message');
  }

  // Get patient information
  const mrnNumber = input.getSegment('PID')?.getField(3)?.getComponent(1) as string;
  const givenName = input.getSegment('PID')?.getField(5)?.getComponent(2) as string;
  const familyName = input.getSegment('PID')?.getField(5)?.getComponent(1) as string;
  const addressLine = input.getSegment('PID')?.getField(11)?.getComponent(1) as string;
  const city = input.getSegment('PID')?.getField(11)?.getComponent(3) as string;
  const state = input.getSegment('PID')?.getField(11)?.getComponent(4) as string;
  const postalCode = input.getSegment('PID')?.getField(11)?.getComponent(5) as string;
  const country = input.getSegment('PID')?.getField(11)?.getComponent(6) as string;

  // Find or create patient
  let patient = await medplum.searchOne('Patient', 'identifier=' + mrnNumber);
  if (!patient) {
    patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      identifier: [
        {
          system: systemString,
          value: mrnNumber,
        },
      ],
      name: [
        {
          given: [givenName],
          family: familyName,
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

  // Process insurance information if present
  const in1Segment = input.getSegment('IN1');
  let coverage: Coverage | undefined;
  
  if (in1Segment) {
    const insurerId = in1Segment.getField(3) as string;
    const insurerName = in1Segment.getField(4) as string;
    const subscriberId = in1Segment.getField(36) as string;

    coverage = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      subscriber: createReference(patient),
      subscriberId: subscriberId,
      beneficiary: createReference(patient),
      payor: [
        {
          display: insurerName,
          identifier: {
            value: insurerId,
          },
        },
      ],
    });
  }

  // Get all procedures
  const procedures = input.getSegments('PR1').map(pr1 => ({
    code: pr1.getField(3)?.getComponent(1) as string,
    display: pr1.getField(3)?.getComponent(2) as string,
  }));

  if (procedures.length !== 0 && coverage) {
    // Create claim
    await medplum.createResource<Claim>({
      resourceType: 'Claim',
      status: 'active',
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'professional',
          },
        ],
      },
      use: 'claim',
      patient: createReference(patient),
      created: new Date().toISOString(),
      provider: {
        display: 'Unknown',
      },
      priority: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/processpriority',
            code: 'normal',
          },
        ],
      },
      insurance:[
        {
          sequence: 1,
          focal: true,
          coverage: createReference(coverage),
        },
      ],
      item: procedures.map((proc, index) => ({
        sequence: index + 1,
        productOrService: {
          coding: [
            {
              system: 'CPT',
              code: proc.code,
              display: proc.display,
            },
          ],
        },
      })),
    });
  }

  return input.buildAck();
} 