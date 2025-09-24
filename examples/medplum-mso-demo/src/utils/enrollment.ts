// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, getReferenceString, MedplumClient, normalizeErrorString, resolveId } from '@medplum/core';
import {
  AccessPolicy,
  Organization,
  Parameters,
  ParametersParameter,
  Patient,
  Practitioner,
  ProjectMembership,
  ProjectMembershipAccessParameter,
  Reference,
} from '@medplum/fhirtypes';

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
      const policy = await getAccessPolicyByName(medplum, 'Managed Service Organization Access Policy');

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

/**
 * Enrolls a patient in an organization. This is done by adding a reference to the organization the patient with the $set-accounts operation.
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

/**
 * Unenrolls a patient from an organization.
 *
 *  1. Get the patient's pre-existing accounts
 *  2. Construct the Parameters resource with the existing accounts except the one to remove
 *  3. Call the $set-accounts operation with the Parameters resource. It will update the patient resource and all other resources in the patient's compartment.
 *     See docs: https://www.medplum.com/docs/api/fhir/operations/patient-set-accounts
 *
 * @param medplum - The Medplum client.
 * @param patient - The patient to unenroll.
 * @param organization - The organization to unenroll the patient from.
 */
export async function unEnrollPatient(
  medplum: MedplumClient,
  patient: Patient,
  organization: Organization
): Promise<void> {
  // 1. Get the patient's pre-existing accounts
  const accounts = patient.meta?.accounts || [];
  const orgReference = getReferenceString(organization);

  // 2. Construct the Parameters resource with the existing accounts except the one to remove
  const parameter: ParametersParameter[] = accounts
    .filter((a: Reference) => a.reference !== orgReference)
    .map((account) => ({
      name: 'accounts',
      valueReference: {
        reference: account.reference,
      },
    }));
  parameter.push({ name: 'propagate', valueBoolean: true });
  const parameters: Parameters = { resourceType: 'Parameters', parameter };

  try {
    // 3. Call the $set-accounts operation with the Parameters resource. It will update the patient resource and all other resources in the patient's compartment.
    await medplum.post(`fhir/R4/Patient/${patient.id}/$set-accounts`, parameters);
  } catch (error) {
    throw new Error(normalizeErrorString(error));
  }
}

/**
 * Unenrolls a practitioner from an organization.
 *
 *  1. Search for the practitioner's project membership
 *  2. Remove the organization from the access array of the practitioner's project membership
 *  3. Update the ProjectMembership resource
 *
 * @param medplum - The Medplum client.
 * @param practitioner - The practitioner to unenroll.
 * @param organization - The organization to unenroll the practitioner from.
 */
export async function unEnrollPractitioner(
  medplum: MedplumClient,
  practitioner: Practitioner,
  organization: Organization
): Promise<void> {
  // 1. Search for the practitioner's project membership
  const membershipResource = await medplum.searchOne('ProjectMembership', {
    profile: getReferenceString(practitioner),
  });

  if (membershipResource) {
    // 2. Remove the organization from the access array of the practitioner's project membership
    membershipResource.access = membershipResource.access?.filter((access) =>
      access.parameter?.some(
        (param: ProjectMembershipAccessParameter) =>
          param.valueReference?.reference !== getReferenceString(organization)
      )
    );

    // 3. Update the ProjectMembership resource
    try {
      await medplum.updateResource(membershipResource);
    } catch (error) {
      throw new Error(normalizeErrorString(error));
    }
  }
}

/**
 * Gets practitioners enrolled in a specific organization.
 *
 *  1. Search for all ProjectMembership resources
 *  2. Filter the memberships to only include those with access to the organization
 *  3. Search for the Practitioner resources that have ProjectMembership resources with access to this organization
 *  4. Return the Practitioners
 *
 * @param medplum - The Medplum client.
 * @param organization - The organization to get enrolled practitioners for.
 * @returns Array of practitioners enrolled in the organization.
 */
export async function getEnrolledPractitioners(
  medplum: MedplumClient,
  organization: Organization
): Promise<Practitioner[]> {
  // 1. Search for all ProjectMembership resources
  const memberships = await medplum.searchResources('ProjectMembership');

  // 2. Filter ProjectMembership resources to only the practitioners with access to this organization
  const practitionerRefs = memberships
    .filter((membership) =>
      membership.access?.some((a) =>
        a.parameter?.some(
          (p) => p.name === 'organization' && p.valueReference?.reference === getReferenceString(organization)
        )
      )
    )
    .map((membership) => membership.profile)
    .filter(Boolean);

  if (practitionerRefs.length > 0) {
    // 3. Search for the Practitioner resources that have ProjectMembership resources with access to this organization
    const practitioners = await medplum.searchResources('Practitioner', {
      _id: practitionerRefs.map((ref) => resolveId(ref)).join(','),
      _fields: 'name',
    });

    // 4. Return the Practitioners
    return practitioners;
  }

  return [];
}

/**
 * Gets patients enrolled in a specific organization.
 *
 *  1. Invalidate the Patient search cache first
 *  2. Search for all patients with this organization in their compartment
 *  3. Return the patients
 *
 * @param medplum - The Medplum client.
 * @param organization - The organization to get enrolled patients for.
 * @returns Array of patients enrolled in the organization.
 */
export async function getEnrolledPatients(medplum: MedplumClient, organization: Organization): Promise<Patient[]> {
  // 1. Invalidate the Patient search cache first
  medplum.invalidateSearches('Patient');

  // 2. Search for all patients with this organization in their compartment
  const patients = await medplum.searchResources('Patient', {
    _compartment: getReferenceString(organization),
    _fields: 'name',
  });

  // 3. Return the patients
  return patients;
}

/**
 * Helper function to get an AccessPolicy by name.
 * @param medplum - The Medplum client.
 * @param name - The name of the AccessPolicy to retrieve.
 * @returns The AccessPolicy.
 */
async function getAccessPolicyByName(medplum: MedplumClient, name: string): Promise<AccessPolicy> {
  const policy = await medplum.searchOne('AccessPolicy', {
    name: name,
  });

  if (!policy) {
    throw new Error(`AccessPolicy with name "${name}" not found`);
  }

  return policy;
}
