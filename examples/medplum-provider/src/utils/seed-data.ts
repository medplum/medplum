// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Bundle, Patient, ResourceType } from '@medplum/fhirtypes';

/**
 * Check if there are any resources of a given type in the database
 *
 * @param medplum - The Medplum client
 * @param resourceType - The resource type to check
 * @returns True if there are any resources of the given type, false otherwise
 */
export async function hasResources(medplum: MedplumClient, resourceType: ResourceType): Promise<boolean> {
  const result = await medplum.searchResources(resourceType, { _count: '1', _summary: 'count' });
  return (result.bundle?.total ?? 0) > 0;
}

/**
 * Check if the database has any patients
 *
 * @param medplum - The Medplum client
 * @returns True if there are any patients, false otherwise
 */
export async function hasPatients(medplum: MedplumClient): Promise<boolean> {
  return hasResources(medplum, 'Patient');
}

/**
 * Create sample patients
 *
 * @param medplum - The Medplum client
 * @returns The created patients
 */
async function createSamplePatients(medplum: MedplumClient): Promise<Patient[]> {
  const patient: Patient = {
    resourceType: 'Patient',
    name: [
      {
        given: ['John'],
        family: 'Doe',
        use: 'official',
      },
    ],
    gender: 'male',
    birthDate: '1980-05-15',
    telecom: [
      {
        system: 'phone',
        value: '555-0101',
        use: 'mobile',
      },
      {
        system: 'email',
        value: 'john.doe@example.com',
      },
    ],
    address: [
      {
        use: 'home',
        line: ['123 Main St'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'USA',
      },
    ],
  };

  const created = await medplum.createResource(patient);
  return [created];
}

/**
 * Main function to seed sample patient data into the database
 *
 * @param medplum - The Medplum client
 * @returns True if the data was seeded, false otherwise
 */
export async function seedPatientData(medplum: MedplumClient): Promise<void> {
  if (await hasPatients(medplum)) {
    return;
  }

  await createSamplePatients(medplum);
}

/**
 * Check if the database has any PlanDefinitions
 *
 * @param medplum - The Medplum client
 * @returns True if there are any PlanDefinitions, false otherwise
 */
export async function hasPlanDefinitions(medplum: MedplumClient): Promise<boolean> {
  return hasResources(medplum, 'PlanDefinition');
}

/**
 * Seed a PlanDefinition with associated Questionnaires
 *
 * @param medplum - The Medplum client
 */
export async function seedPlanDefinition(medplum: MedplumClient): Promise<void> {
  if (await hasPlanDefinitions(medplum)) {
    return;
  }

  await medplum.executeBatch(PLAN_DEFINITION_BUNDLE);
}

const PLAN_DEFINITION_BUNDLE: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:c3d4e5f6-a7b8-9012-cdef-3456789abcde',
      resource: {
        resourceType: 'PlanDefinition',
        name: 'Simple Initial Visit',
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/plan-definition-type',
              code: 'order-set',
              display: 'Order Set',
            },
          ],
        },
        status: 'active',
        title: 'Comprehensive Physical Exam for New Patient',
        action: [
          {
            id: 'id-1',
            title: 'Vital Signs Assessment',
            definitionCanonical: 'urn:uuid:f6a7b8c9-d0e1-2345-fghi-6789abcdef01',
            description: 'Record vital signs via Patient Summary and copy here.',
          },
          {
            id: 'id-2',
            title: 'Comprehensive Physical Examination',
            definitionCanonical: 'urn:uuid:d4e5f6a7-b8c9-0123-defg-456789abcdef',
          },
          {
            id: 'id-3',
            title: 'Health Maintenance Screening',
            definitionCanonical: 'urn:uuid:e5f6a7b8-c9d0-1234-efgh-56789abcdef0',
          },
        ],
      },
      request: {
        method: 'POST',
        url: 'PlanDefinition',
      },
    },
    {
      fullUrl: 'urn:uuid:d4e5f6a7-b8c9-0123-defg-456789abcdef',
      resource: {
        resourceType: 'Questionnaire',
        status: 'active',
        url: 'urn:uuid:d4e5f6a7-b8c9-0123-defg-456789abcdef',
        item: [
          {
            id: 'id-5',
            linkId: 'q5',
            type: 'text',
            required: true,
            text: 'General Appearance',
          },
          {
            id: 'id-6',
            linkId: 'q6',
            type: 'text',
            text: 'Head, Eyes, Ears, Nose & Throat ',
            repeats: false,
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/fhir-types',
                      display: 'Patient',
                      code: 'Patient',
                    },
                  ],
                },
              },
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/fhir-types',
                      display: 'Practitioner',
                      code: 'Practitioner',
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'id-56',
            linkId: 'q43',
            type: 'text',
            text: 'Cardiovascular',
          },
          {
            id: 'id-84',
            linkId: 'q44',
            type: 'text',
            text: 'Respiratory',
          },
          {
            id: 'id-85',
            linkId: 'q45',
            type: 'text',
            text: 'Abdomen',
          },
          {
            id: 'id-86',
            linkId: 'q46',
            type: 'text',
            text: 'Extremities',
          },
          {
            id: 'id-87',
            linkId: 'q47',
            type: 'text',
            text: 'Neurological',
          },
          {
            id: 'id-88',
            linkId: 'q48',
            type: 'text',
            text: 'Skin',
          },
        ],
        name: 'Comprehensive Physical Examination',
        title: 'Comprehensive Physical Examination',
        code: [
          {
            code: 'SNOMED 162673000',
            display: 'SNOMED 162673000',
          },
        ],
      },
      request: {
        method: 'POST',
        url: 'Questionnaire',
      },
    },
    {
      fullUrl: 'urn:uuid:e5f6a7b8-c9d0-1234-efgh-56789abcdef0',
      resource: {
        resourceType: 'Questionnaire',
        name: 'Health Maintenance Screening',
        status: 'active',
        url: 'urn:uuid:e5f6a7b8-c9d0-1234-efgh-56789abcdef0',
        item: [
          {
            id: 'id-1',
            linkId: 'q1',
            type: 'text',
            text: 'Immunization Status Review',
          },
          {
            id: 'id-2',
            linkId: 'q2',
            type: 'text',
            text: 'Cancer Screening Recommendations',
          },
          {
            id: 'id-3',
            linkId: 'q3',
            type: 'string',
            text: 'Cardiovascular Risk Assessment',
          },
          {
            id: 'id-4',
            linkId: 'q4',
            type: 'text',
            text: 'Age-Appropriate Counseling',
          },
        ],
        title: 'Health Maintenance Screening',
      },
      request: {
        method: 'POST',
        url: 'Questionnaire',
      },
    },
    {
      fullUrl: 'urn:uuid:f6a7b8c9-d0e1-2345-fghi-6789abcdef01',
      resource: {
        resourceType: 'Questionnaire',
        name: 'Vital Signs Assessment',
        status: 'active',
        url: 'urn:uuid:f6a7b8c9-d0e1-2345-fghi-6789abcdef01',
        item: [
          {
            id: 'id-8',
            linkId: 'q8',
            type: 'display',
            text: 'Record vital signs in the "Vitals" section of the Patient Summary sidebar and copy here.',
          },
          {
            id: 'id-2',
            linkId: 'q2',
            type: 'text',
            text: 'Blood Pressure (Systolic/Diastolic)',
          },
          {
            id: 'id-3',
            linkId: 'q3',
            type: 'text',
            text: 'Heart Rate',
          },
          {
            id: 'id-4',
            linkId: 'q4',
            type: 'text',
            text: 'Temperature',
          },
          {
            id: 'id-1',
            linkId: 'q1',
            type: 'text',
            text: 'Respiratory Rate',
          },
          {
            id: 'id-5',
            linkId: 'q5',
            type: 'text',
            text: 'Oxygen Saturation',
          },
          {
            id: 'id-6',
            linkId: 'q6',
            type: 'text',
            text: 'Weight',
          },
          {
            id: 'id-7',
            linkId: 'q7',
            type: 'text',
            text: 'Height',
          },
        ],
        title: 'Vital Signs Assessment',
      },
      request: {
        method: 'POST',
        url: 'Questionnaire',
      },
    },
  ],
};
