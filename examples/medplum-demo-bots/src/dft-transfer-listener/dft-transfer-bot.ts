// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

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

import { BotEvent, createReference, Hl7Message, Hl7Segment, MedplumClient } from '@medplum/core';
import { Claim, Coverage, Organization, Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Hl7Message>): Promise<Hl7Message> {
  const input = event.input;

  // Verify message type is DFT
  const messageType = input.getSegment('MSH')?.getField(9)?.getComponent(1) ?? '';
  if (messageType !== 'DFT') {
    throw new Error('Not a DFT message');
  }

  // Get patient information
  const patient = await handlePatientFromPid(medplum, input.getSegment('PID'));
  if (!patient) {
    throw new Error('Unable to find or create patient');
  }

  // Process insurance information if present
  const insuranceInfo = await handleCoverageFromIn1(medplum, input.getSegment('IN1'), patient);

  // Create claim from procedures if present
  await handleClaimFromPr1s(medplum, input.getAllSegments('PR1'), patient, insuranceInfo);

  return input.buildAck();
}

/**
 * Creates or finds a Patient resource based on PID segment information
 * @param medplum - The Medplum client
 * @param pidSegment - The PID segment from an HL7 message
 * @returns The created or found Patient resource
 */
export async function handlePatientFromPid(
  medplum: MedplumClient,
  pidSegment: Hl7Segment | undefined
): Promise<Patient | undefined> {
  if (!pidSegment) {
    return undefined;
  }

  // Get patient information
  const mrnNumber = pidSegment?.getField(3)?.getComponent(1) ?? ''; // PID.3 Patient Identifier List
  const givenName = pidSegment?.getField(5)?.getComponent(2) ?? ''; // PID.5 Patient Name (XPN.2 Given Name)
  const familyName = pidSegment?.getField(5)?.getComponent(1) ?? ''; // PID.5 Patient Name (XPN.1 Family Name)
  const addressLine = pidSegment?.getField(11)?.getComponent(1) ?? ''; // PID.11 Patient Address (XAD.1 Street Address)
  const city = pidSegment?.getField(11)?.getComponent(3) ?? ''; // PID.11 Patient Address (XAD.3 City)
  const state = pidSegment?.getField(11)?.getComponent(4) ?? ''; // PID.11 Patient Address (XAD.4 State or Province)
  const postalCode = pidSegment?.getField(11)?.getComponent(5) ?? ''; // PID.11 Patient Address (XAD.5 Zip or Postal Code)
  const country = pidSegment?.getField(11)?.getComponent(6) ?? ''; // PID.11 Patient Address (XAD.6 Country)

  // Find or create patient
  let patient = await medplum.searchOne('Patient', 'identifier=' + mrnNumber);
  if (!patient) {
    patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      identifier: [
        {
          system: 'MRN',
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
  return patient;
}

/**
 * Creates or finds insurance resources based on IN1 segment information
 * @param medplum - The Medplum client
 * @param in1Segment - The IN1 segment from an HL7 message
 * @param patient - The patient to link the coverage to
 * @returns The created insurance resources
 */
export async function handleCoverageFromIn1(
  medplum: MedplumClient,
  in1Segment: Hl7Segment | undefined,
  patient: Patient
): Promise<[Coverage, Organization] | undefined> {
  if (!in1Segment) {
    return undefined;
  }

  const insurerId = in1Segment.getField(3)?.getComponent(1) ?? ''; // IN1.3 Insurance Company ID
  const insurerName = in1Segment.getField(4)?.getComponent(1) ?? ''; // IN1.4 Insurance Company Name
  const subscriberId = in1Segment.getField(36)?.getComponent(1) ?? ''; // IN1.36 Policy Number

  // Check if insurer organization exists
  let insurerOrg = await medplum.searchOne('Organization', 'identifier=' + insurerId);
  if (!insurerOrg) {
    // Create new organization if it doesn't exist
    insurerOrg = await medplum.createResource({
      resourceType: 'Organization',
      identifier: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/insurance-plan-identifier',
          value: insurerId,
        },
      ],
      name: insurerName,
      type: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/organization-type',
              code: 'ins',
              display: 'Insurance Company',
            },
          ],
        },
      ],
    });
  }

  const coverage = await medplum.createResource<Coverage>({
    resourceType: 'Coverage',
    status: 'active',
    subscriber: createReference(patient),
    subscriberId: subscriberId,
    beneficiary: createReference(patient),
    payor: [createReference(insurerOrg)],
  });

  return [coverage, insurerOrg];
}

/**
 * Extract diagnosis information from a PR1 segment
 * @param pr1 - The PR1 segment from an HL7 message
 * @returns An object containing the diagnosis code, description, and system
 */
function extractDiagnosisFromPr1(pr1: Hl7Segment): { code: string; display: string; system: string } | undefined {
  const diagnosisCode = pr1.getField(15)?.getComponent(1) ?? ''; // PR1.15.1 Diagnosis Code
  const diagnosisDesc = pr1.getField(15)?.getComponent(2) ?? ''; // PR1.15.2 Diagnosis Description
  const diagnosisSystem = pr1.getField(15)?.getComponent(3) ?? ''; // PR1.15.3 Diagnosis Coding System

  if (!diagnosisCode) {
    return undefined;
  }

  return {
    code: diagnosisCode,
    display: diagnosisDesc,
    system: diagnosisSystem || 'ICD-10', // Default to ICD-10 if not specified
  };
}

/**
 * Creates a Claim resource based on PR1 segments and insurance information
 * @param medplum - The Medplum client
 * @param pr1Segments - Array of PR1 segments from an HL7 message
 * @param patient - The patient to link the claim to
 * @param insuranceInfo - The coverage and organization to link the claim to
 * @returns The created Claim resource
 */
export async function handleClaimFromPr1s(
  medplum: MedplumClient,
  pr1Segments: Hl7Segment[],
  patient: Patient,
  insuranceInfo: [Coverage, Organization] | undefined
): Promise<Claim | undefined> {
  // Get all procedures
  const procedures = pr1Segments.map((pr1) => ({
    code: pr1.getField(3)?.getComponent(1) ?? '', // PR1.3.1 Procedure Code
    display: pr1.getField(3)?.getComponent(2) ?? '', // PR1.3.2 Procedure Description
    diagnosis: extractDiagnosisFromPr1(pr1), // Extract diagnosis from PR1.15
  }));

  if (procedures.length === 0 || !insuranceInfo) {
    return undefined;
  }

  const [coverage] = insuranceInfo;

  // Create an array of diagnoses for the claim
  const diagnoses = procedures
    .map((proc, index) => {
      if (!proc.diagnosis) {
        return null;
      }
      return {
        sequence: index + 1,
        diagnosisCodeableConcept: {
          coding: [
            {
              system: proc.diagnosis.system === 'ICD-10' ? 'http://hl7.org/fhir/sid/icd-10-cm' : proc.diagnosis.system,
              code: proc.diagnosis.code,
              display: proc.diagnosis.display,
            },
          ],
          text: proc.diagnosis.display,
        },
      };
    })
    .filter((diagnosis) => diagnosis !== null);

  const claim = await medplum.createResource<Claim>({
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
    diagnosis: diagnoses,
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
      // Link item to diagnosis if available
      diagnosisSequence: proc.diagnosis ? [index + 1] : undefined,
    })),
  });

  return claim;
}
