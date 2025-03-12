/**
 * This example shows how you might listen for DFT (Detailed Financial Transaction) HL7
 * messages. DFT messages are commonly used to transmit services rendered and patient insurance
 * information for the purpose of claim generation.
 *
 * This bot listens for DFT messages and finds/creates a FHIR Patient from PID, adds
 * a FHIR Coverage attached to that patient from IN1, and a FHIR Claim from PR1.
 *
 * More information about the sections of DFT messages can be found here: https://rhapsody.health/resources/hl7-dft-message/
 */
import { BotEvent, createReference, Hl7Message, MedplumClient } from '@medplum/core';
import { Claim, Coverage, Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Hl7Message>): Promise<Hl7Message> {
  const input = event.input;
  const systemString = 'MRN';

  // Verify message type is DFT
  const messageType = input.getSegment('MSH')?.getField(9)?.getComponent(1) ?? '';
  if (messageType !== 'DFT') {
    throw new Error('Not a DFT message');
  }

  // Get patient information
  const mrnNumber = input.getSegment('PID')?.getField(3)?.getComponent(1) ?? ''; // PID.3 Patient Identifier List
  const givenName = input.getSegment('PID')?.getField(5)?.getComponent(2) ?? ''; // PID.5 Patient Name (XPN.2 Given Name)
  const familyName = input.getSegment('PID')?.getField(5)?.getComponent(1) ?? ''; // PID.5 Patient Name (XPN.1 Family Name)
  const addressLine = input.getSegment('PID')?.getField(11)?.getComponent(1) ?? ''; // PID.11 Patient Address (XAD.1 Street Address)
  const city = input.getSegment('PID')?.getField(11)?.getComponent(3) ?? ''; // PID.11 Patient Address (XAD.3 City)
  const state = input.getSegment('PID')?.getField(11)?.getComponent(4) ?? ''; // PID.11 Patient Address (XAD.4 State or Province)
  const postalCode = input.getSegment('PID')?.getField(11)?.getComponent(5) ?? ''; // PID.11 Patient Address (XAD.5 Zip or Postal Code)
  const country = input.getSegment('PID')?.getField(11)?.getComponent(6) ?? ''; // PID.11 Patient Address (XAD.6 Country)

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
    const insurerId = in1Segment.getField(3)?.getComponent(1) ?? ''; // IN1.3 Insurance Company ID
    const insurerName = in1Segment.getField(4)?.getComponent(1) ?? ''; // IN1.4 Insurance Company Name
    const subscriberId = in1Segment.getField(36)?.getComponent(1) ?? ''; // IN1.36 Policy Number

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
  const procedures = input.getAllSegments('PR1').map((pr1) => ({
    code: pr1.getField(3)?.getComponent(1) ?? '', // PR1.3.1 Procedure Code
    display: pr1.getField(3)?.getComponent(2) ?? '', // PR1.3.2 Procedure Description
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
      insurance: [
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
