// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Organization, Parameters, Patient, Practitioner, ProjectMembership, Reference } from '@medplum/fhirtypes';

// start-block enroll-patient
/**
 * Enrolls a patient in an organization. This is done by adding a reference to the organization to the patient using the $set-accounts operation.
 *
 *  1. Get the patient's pre-existing accounts
 *  2. Check if already enrolled, and if so, return
 *  3. Construct the Parameters resource with the existing accounts and the new organization
 *  4. Call the $set-accounts operation with the Parameters resource. It will update the patient resource and all other resources in the patient's compartment.
 *     See docs: https://www.medplum.com/docs/api/fhir/operations/patient-set-accounts
 *
 * @param medplum - The Medplum client.
 * @param patient - The patient to enroll.
 * @param organization - The organization to enroll the patient in.
 */
export async function enrollPatient(
  medplum: MedplumClient,
  patient: Patient,
  organization: Organization
): Promise<void> {
  // 1. Get the patient's pre-existing accounts
  const accounts = patient.meta?.accounts || [];
  const orgReference = getReferenceString(organization);

  // 2. Check if already enrolled, and if so, return
  if (accounts.some((a: Reference) => a.reference === orgReference)) {
    return;
  }

  // 3. Construct the Parameters resource with the existing accounts and the new organization
  const parameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      // Include all existing accounts
      ...accounts.map((account) => ({
        name: 'accounts',
        valueReference: {
          reference: account.reference,
        },
      })),
      // Add the new organization
      {
        name: 'accounts',
        valueReference: createReference(organization),
      },
      // Propagate changes to all resources in the Patient compartment
      {
        name: 'propagate',
        valueBoolean: true,
      },
    ],
  };

  try {
    // 4. Call the $set-accounts operation with the Parameters resource. It will update the patient resource and all other resources in the patient's compartment.
    await medplum.post(`fhir/R4/Patient/${patient.id}/$set-accounts`, parameters);
  } catch (error) {
    throw new Error(normalizeErrorString(error));
  }
}
// end-block enroll-patient

// start-block set-accounts-organization
//Assigning a specific Patient to the clinic-a tenant
const medplum1: MedplumClient = {} as MedplumClient;
const patientId1 = 'patient-id';
await medplum1.post(`fhir/R4/Patient/${patientId1}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'Organization/clinic-a' },
    },
  ],
});
// end-block set-accounts-organization

// start-block set-accounts-healthcare-service
//Assigning a specific Patient to the cardiology-service tenant
const medplum2: MedplumClient = {} as MedplumClient;
const patientId2 = 'patient-id';
await medplum2.post(`fhir/R4/Patient/${patientId2}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'HealthcareService/cardiology-service' },
    },
  ],
});
// end-block set-accounts-healthcare-service

// start-block set-accounts-careteam
//Assigning a specific Patient to the diabetes-care-team tenant
const medplum3: MedplumClient = {} as MedplumClient;
const patientId3 = 'patient-id';
await medplum3.post(`fhir/R4/Patient/${patientId3}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'CareTeam/diabetes-care-team' },
    },
  ],
});
// end-block set-accounts-careteam

// start-block set-accounts-questionnaire-organization
//Assigning a specific Questionnaire to the clinic-a tenant
const medplum4: MedplumClient = {} as MedplumClient;
const questionnaireId1 = 'questionnaire-id';
await medplum4.post(`fhir/R4/Questionnaire/${questionnaireId1}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'Organization/clinic-a' },
    },
  ],
});
// end-block set-accounts-questionnaire-organization

// start-block set-accounts-questionnaire-healthcare-service
//Assigning a specific Questionnaire to the cardiology-service tenant
const medplum5: MedplumClient = {} as MedplumClient;
const questionnaireId2 = 'questionnaire-id';
await medplum5.post(`fhir/R4/Questionnaire/${questionnaireId2}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'HealthcareService/cardiology-service' },
    },
  ],
});
// end-block set-accounts-questionnaire-healthcare-service

// start-block set-accounts-questionnaire-careteam
//Assigning a specific Questionnaire to the diabetes-care-team tenant
const medplum6: MedplumClient = {} as MedplumClient;
const questionnaireId3 = 'questionnaire-id';
await medplum6.post(`fhir/R4/Questionnaire/${questionnaireId3}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'CareTeam/diabetes-care-team' },
    },
  ],
});
// end-block set-accounts-questionnaire-careteam

// start-block set-accounts-propagate-organization
//Assigning a specific Patient to the clinic-a tenant and propagating to all resources that _"belong"_ to that Patient
const medplum7: MedplumClient = {} as MedplumClient;
const patientId4 = 'patient-id';
await medplum7.post(`fhir/R4/Patient/${patientId4}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'Organization/clinic-a' },
    },
    {
      name: 'propagate',
      valueBoolean: true,
    },
  ],
});
// end-block set-accounts-propagate-organization

// start-block set-accounts-propagate-healthcare-service
//Assigning a specific Patient to the cardiology-service tenant and propagating to all resources that _"belong"_ to that Patient
const medplum8: MedplumClient = {} as MedplumClient;
const patientId5 = 'patient-id';
await medplum8.post(`fhir/R4/Patient/${patientId5}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'HealthcareService/cardiology-service' },
    },
    {
      name: 'propagate',
      valueBoolean: true,
    },
  ],
});
// end-block set-accounts-propagate-healthcare-service

// start-block set-accounts-propagate-careteam
//Assigning a specific Patient to the diabetes-care-team tenant and propagating to all resources that _"belong"_ to that Patient
const medplum9: MedplumClient = {} as MedplumClient;
const patientId6 = 'patient-id';
await medplum9.post(`fhir/R4/Patient/${patientId6}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'CareTeam/diabetes-care-team' },
    },
    {
      name: 'propagate',
      valueBoolean: true,
    },
  ],
});
// end-block set-accounts-propagate-careteam

// start-block set-accounts-multiple-organization
//Assigning a specific Patient to the clinic-a and clinic-b tenants
const medplum10: MedplumClient = {} as MedplumClient;
const patientId7 = 'patient-id';
await medplum10.post(`fhir/R4/Patient/${patientId7}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'Organization/clinic-a' },
    },
    {
      name: 'accounts',
      valueReference: { reference: 'Organization/clinic-b' },
    },
    {
      name: 'propagate',
      valueBoolean: true,
    },
  ],
});
// end-block set-accounts-multiple-organization

// start-block set-accounts-multiple-healthcare-service
//Assigning a specific Patient to the cardiology-service and neurology-service tenants
const medplum11: MedplumClient = {} as MedplumClient;
const patientId8 = 'patient-id';
await medplum11.post(`fhir/R4/Patient/${patientId8}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'HealthcareService/cardiology-service' },
    },
    {
      name: 'accounts',
      valueReference: { reference: 'HealthcareService/neurology-service' },
    },
    {
      name: 'propagate',
      valueBoolean: true,
    },
  ],
});
// end-block set-accounts-multiple-healthcare-service

// start-block set-accounts-multiple-careteam
//Assigning a specific Patient to the diabetes-care-team and hypertension-care-team tenants
const medplum12: MedplumClient = {} as MedplumClient;
const patientId9 = 'patient-id';
await medplum12.post(`fhir/R4/Patient/${patientId9}/$set-accounts`, {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: { reference: 'CareTeam/diabetes-care-team' },
    },
    {
      name: 'accounts',
      valueReference: { reference: 'CareTeam/hypertension-care-team' },
    },
    {
      name: 'propagate',
      valueBoolean: true,
    },
  ],
});
// end-block set-accounts-multiple-careteam

// start-block access-policy-organization
export const _accessPolicyOrg = {
  resourceType: 'AccessPolicy',
  name: 'Organization Based Access Policy',
  resource: [
    {
      resourceType: 'Patient',
      criteria: 'Patient?_compartment=%organization',
    },
    {
      resourceType: 'Observation',
      criteria: 'Observation?_compartment=%organization',
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?_compartment=%organization',
    },
    {
      resourceType: 'Communication',
      criteria: 'Communication?_compartment=%organization',
    },
    //...
  ],
} as const;
// end-block access-policy-organization

// start-block access-policy-healthcare-service
export const _accessPolicyHS = {
  resourceType: 'AccessPolicy',
  name: 'HealthcareService Based Access Policy',
  resource: [
    {
      resourceType: 'Patient',
      criteria: 'Patient?_compartment=%healthcare_service',
    },
    {
      resourceType: 'Observation',
      criteria: 'Observation?_compartment=%healthcare_service',
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?_compartment=%healthcare_service',
    },
    {
      resourceType: 'Communication',
      criteria: 'Communication?_compartment=%healthcare_service',
    },
    //...
  ],
} as const;
// end-block access-policy-healthcare-service

// start-block access-policy-careteam
export const _accessPolicyCT = {
  resourceType: 'AccessPolicy',
  name: 'Care Team Access Policy',
  resource: [
    {
      resourceType: 'Patient',
      criteria: 'Patient?_compartment=%care_team',
    },
    {
      resourceType: 'CarePlan',
      criteria: 'CarePlan?_compartment=%care_team',
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?_compartment=%care_team',
    },
    {
      resourceType: 'Communication',
      criteria: 'Communication?_compartment=%care_team',
    },
    //...
  ],
} as const;
// end-block access-policy-careteam

// start-block invite-practitioner
const medplum13: MedplumClient = {} as MedplumClient;
await medplum13.post('admin/projects/:projectId/invite', {
  resourceType: 'Practitioner',
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'dr.smith@example.com',
  membership: {
    access: [
      {
        policy: { reference: 'AccessPolicy/careteam-policy' },
        parameter: [
          {
            name: 'care_team',
            valueReference: { reference: 'CareTeam/hypertension-care-team' },
          },
        ],
      },
    ],
  },
});
// end-block invite-practitioner

// start-block enroll-practitioner
/**
 * Enrolls a practitioner in an organization by adding the organization to the access array of the practitioner's project membership.
 *
 *  1. Search for the practitioner's project membership, if there is no project membership, throw an error
 *  2. Check if the organization reference already exists in any access array
 *  3. If the organization reference does not exist, add the organization to the ProjectMembership.access array
 *  4. Update the ProjectMembership resource
 *
 * @param medplum - The Medplum client.
 * @param practitioner - The practitioner to enroll.
 * @param organization - The organization to enroll the practitioner in.
 * @returns The updated project membership resource
 */
export async function enrollPractitioner(
  medplum: MedplumClient,
  practitioner: Practitioner,
  organization: Organization
): Promise<ProjectMembership> {
  // 1. Search for the practitioner's project membership, if there is no project membership, throw an error
  const projectMembershipSearch = await medplum.searchOne('ProjectMembership', {
    profile: getReferenceString(practitioner),
  });

  if (projectMembershipSearch) {
    const membershipResource = projectMembershipSearch;
    const existingAccess = membershipResource.access || [];

    // 2. Check if this organization reference already exists in any access array
    const organizationExists = existingAccess.some((access) =>
      access.parameter?.some(
        (param) => param.name === 'organization' && param.valueReference?.reference === getReferenceString(organization)
      )
    );

    // 3. If the organization reference does not exist, add the organization to the ProjectMembership.access array
    if (!organizationExists) {
      const policy = await medplum.searchOne('AccessPolicy', {
        name: 'Your Access Policy Name',
      });

      if (!policy) {
        throw new Error('Access policy not found');
      }

      if (existingAccess.length > 0) {
        existingAccess.push({
          parameter: [{ name: 'organization', valueReference: createReference(organization) }],
          policy: { reference: getReferenceString(policy) },
        });
      } else {
        membershipResource.access = [
          {
            parameter: [{ name: 'organization', valueReference: createReference(organization) }],
            policy: { reference: getReferenceString(policy) },
          },
        ];
      }
    }

    // 4. Update the ProjectMembership resource
    try {
      const updatedResource = await medplum.updateResource(membershipResource);
      return updatedResource;
    } catch (error) {
      throw new Error(normalizeErrorString(error));
    }
  }
  throw new Error(`No project membership found for practitioner ${practitioner.id}`);
}
// end-block enroll-practitioner

// start-block access-policy-mixed
export const _accessPolicyMixed = {
  resourceType: 'AccessPolicy',
  name: 'Questionnaire Access Policy',
  resource: [
    //Non tenant level restricted resources
    {
      resourceType: 'Questionnaire',
    },
    {
      resourceType: 'Practitioner',
    },
    //...

    //Tenant level restricted resources
    {
      resourceType: 'Patient',
      criteria: 'Patient?_compartment=%organization',
    },
    {
      resourceType: 'Observation',
      criteria: 'Observation?_compartment=%organization',
    },
    {
      resourceType: 'Encounter',
      criteria: 'Encounter?_compartment=%organization',
    },
    {
      resourceType: 'Communication',
      criteria: 'Communication?_compartment=%organization',
    },
    //...
  ],
} as const;
// end-block access-policy-mixed
