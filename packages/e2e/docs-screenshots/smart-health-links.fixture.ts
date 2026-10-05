// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import type { Bundle, Parameters } from '@medplum/fhirtypes';

const PATIENT_URN = 'urn:uuid:7b0c3a4e-1d2f-4c5b-9a8e-0f1e2d3c4b5a';

/**
 * Seeds a sample patient chart in the source project and returns a SMART Health Link for it.
 * The source project plays the role of the patient-facing app that shares the link.
 * @param baseUrl - Medplum server base URL.
 * @param email - Source project user email.
 * @param password - Source project user password.
 * @returns The `shlink:/` URL.
 */
export async function generateSampleSmartHealthLink(baseUrl: string, email: string, password: string): Promise<string> {
  const medplum = new MedplumClient({ baseUrl });
  await medplum.startLogin({ email, password }).then((res) => medplum.processCode(res.code as string));

  const result = await medplum.executeBatch(buildSampleChart());
  const patientId = result.entry?.[0]?.response?.location?.split('/')[1];
  if (!patientId) {
    throw new Error('Failed to create sample patient');
  }

  const params = await medplum.post<Parameters>(medplum.fhirUrl('Patient', patientId, '$generate-smart-health-link'), {
    resourceType: 'Parameters',
    parameter: [{ name: 'label', valueString: 'Maria Garcia health summary' }],
  });
  const shlink = params.parameter?.find((p) => p.name === 'shlink')?.valueString;
  if (!shlink) {
    throw new Error('Failed to generate SMART Health Link');
  }
  return shlink;
}

function buildSampleChart(): Bundle {
  const subject = { reference: PATIENT_URN };
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        fullUrl: PATIENT_URN,
        request: { method: 'POST', url: 'Patient' },
        resource: {
          resourceType: 'Patient',
          name: [{ given: ['Maria'], family: 'Garcia' }],
          gender: 'female',
          birthDate: '1984-03-12',
          telecom: [
            { system: 'phone', value: '555-201-7788', use: 'mobile' },
            { system: 'email', value: 'maria.garcia@example.com' },
          ],
          address: [{ line: ['742 Evergreen Terrace'], city: 'Springfield', state: 'IL', postalCode: '62704' }],
        },
      },
      {
        request: { method: 'POST', url: 'AllergyIntolerance' },
        resource: {
          resourceType: 'AllergyIntolerance',
          patient: subject,
          clinicalStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
          },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Allergy to penicillin' }] },
        },
      },
      {
        request: { method: 'POST', url: 'Condition' },
        resource: {
          resourceType: 'Condition',
          subject,
          category: [
            {
              coding: [
                { system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' },
              ],
            },
          ],
          clinicalStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
          },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '195967001', display: 'Asthma' }] },
          onsetDateTime: '2012-05-01',
        },
      },
      {
        request: { method: 'POST', url: 'Condition' },
        resource: {
          resourceType: 'Condition',
          subject,
          category: [
            {
              coding: [
                { system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' },
              ],
            },
          ],
          clinicalStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
          },
          code: { coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertension' }] },
          onsetDateTime: '2019-09-15',
        },
      },
      {
        request: { method: 'POST', url: 'MedicationStatement' },
        resource: {
          resourceType: 'MedicationStatement',
          subject,
          status: 'active',
          medicationCodeableConcept: {
            coding: [
              {
                system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
                code: '314076',
                display: 'lisinopril 10 MG Oral Tablet',
              },
            ],
          },
        },
      },
      {
        request: { method: 'POST', url: 'Immunization' },
        resource: {
          resourceType: 'Immunization',
          patient: subject,
          status: 'completed',
          vaccineCode: {
            coding: [
              { system: 'http://hl7.org/fhir/sid/cvx', code: '140', display: 'Influenza, seasonal, injectable' },
            ],
          },
          occurrenceDateTime: '2025-10-02',
        },
      },
      {
        request: { method: 'POST', url: 'Observation' },
        resource: {
          resourceType: 'Observation',
          subject,
          status: 'final',
          category: [
            {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }],
            },
          ],
          code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
          valueQuantity: { value: 72, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
          effectiveDateTime: '2026-08-20',
        },
      },
    ],
  };
}
