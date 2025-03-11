import { Organization, Patient, Practitioner, Reference, ProjectMembership, AccessPolicy, ProjectMembershipAccessParameter } from '@medplum/fhirtypes';
import { createReference, MedplumClient } from '@medplum/core';


/**
 * Enrolls a practitioner in an organization.
 * @param medplum - The Medplum client.
 * @param practitioner - The practitioner to enroll.
 * @param organization - The organization to enroll the practitioner in.
 * @returns The updated project membership.
 */
export async function enrollPractitioner(
  medplum: MedplumClient,
  practitioner: Practitioner,
  organization: Organization
): Promise<ProjectMembership> {
  const projectMembershipSearch = await medplum.search('ProjectMembership', {
    profile: `Practitioner/${practitioner.id}`
  });

  if (projectMembershipSearch.entry?.[0]?.resource) {
    const membershipResource = projectMembershipSearch.entry[0].resource;
    const existingAccess = membershipResource.access || [];
    
    // Check if organization reference already exists in any access array
    const organizationExists = existingAccess.some(access => 
      access.parameter?.some(param => 
        param.name === 'organization' && 
        param.valueReference?.reference === `Organization/${organization.id}`
      )
    );


    if (!organizationExists) {
      const policy = await getAccessPolicyByName(medplum, 'Managed Service Organization Access Policy');
      
      if (existingAccess.length > 0) {
        existingAccess.push({
          parameter: [{ name: 'organization', valueReference: createReference(organization) }],
          policy: { reference: `AccessPolicy/${policy.id}` }
        });
      } else {
        membershipResource.access = [{
          parameter: [{ name: 'organization', valueReference: createReference(organization) }],
          policy: { reference: `AccessPolicy/${policy.id}` }
        }];
      }
    }

    try {
      const updatedResource = await medplum.updateResource(membershipResource);
      return updatedResource;
    } catch (error) {
      throw new Error(`Failed to enroll practitioner: ${error}`);
    }
  }
  throw new Error('No project membership found for practitioner');
}

/**
 * Enrolls a patient in an organization.
 * @param medplum - The Medplum client.
 * @param patient - The patient to enroll.
 * @param organization - The organization to enroll the patient in.
 */
export async function enrollPatient(
  medplum: MedplumClient,
  patient: Patient,
  organization: Organization
): Promise<void> {
  // Check if already enrolled
  const accounts = patient.meta?.accounts || [];
  const orgReference = `Organization/${organization.id}`;
  if (accounts.some((a: Reference) => a.reference === orgReference)) {
    return;
  }

  // Create parameters with all existing accounts plus the new one
  const parameters = {
    resourceType: 'Parameters',
    parameter: [
      // Include all existing accounts
      ...accounts.map(account => ({
        name: "accounts",
        valueReference: {
          reference: account.reference
        }
      })),
      // Add the new organization
      {
        name: "accounts",
        valueReference: createReference(organization)
      }
    ]
  };

  try {
    // Use the medplum client's post method which handles auth and CORS headers
    await medplum.post(`fhir/R4/Patient/${patient.id}/$set-accounts`, parameters);
  } catch (error) {
    console.error("Error enrolling patient:", error);
    throw new Error(`Failed to enroll patient: ${error}`);
  }
}

/**
 * Unenrolls a patient from an organization.
 * @param medplum - The Medplum client.
 * @param patient - The patient to unenroll.
 * @param organization - The organization to unenroll the patient from.
 */
export async function unEnrollPatient(
  medplum: MedplumClient,
  patient: Patient,
  organization: Organization
): Promise<void> {
  const accounts = patient.meta?.accounts || [];
  const orgReference = `Organization/${organization.id}`;

  // Create parameters with all accounts except the one to remove
  const parameters = {
    resourceType: 'Parameters',
    parameter: accounts
      .filter((a: Reference) => a.reference !== orgReference)
      .map(account => ({
        name: 'accounts',
        valueReference: {
          reference: account.reference
        }
      }))
  };

  //NOTE: If the patient has ben unenrolled from all organizations, this is a workaround to conform to the FHIR spec's
  //inability to handle empty arrays. Instead of sending an empty array, we send the patient's own reference.
  if (parameters.parameter.length === 0) {
    parameters.parameter = [{
      name: 'accounts',
      valueReference: createReference(patient)
    }];
  }

  try {
    await medplum.post(`fhir/R4/Patient/${patient.id}/$set-accounts`, parameters);
  } catch (error) {
    throw new Error(`Failed to unenroll patient: ${error}`);
  }
}

/**
 * Unenrolls a practitioner from an organization.
 * @param medplum - The Medplum client.
 * @param practitioner - The practitioner to unenroll.
 * @param organization - The organization to unenroll the practitioner from.
 */
export async function unEnrollPractitioner(
  medplum: MedplumClient,
  practitioner: Practitioner,
  organization: Organization
): Promise<void> {

  const projectMembershipSearch = await medplum.search('ProjectMembership', {
    profile: `Practitioner/${practitioner.id}`
  });

  const membershipResource = projectMembershipSearch.entry?.[0]?.resource;

  if (membershipResource) {
    //remove organization from access
    membershipResource.access = membershipResource.access?.filter((access) => 
      access.parameter?.some((param: ProjectMembershipAccessParameter) => 
        param.valueReference?.reference !== `Organization/${organization.id}`
      )
    );

    try {
      await medplum.updateResource(membershipResource);
    } catch (error) {
      throw new Error(`Failed to unenroll practitioner: ${error}`);
    }
  }
}

/**
 * Gets practitioners enrolled in a specific organization.
 * @param medplum - The Medplum client.
 * @param organization - The organization to get enrolled practitioners for.
 * @returns Array of practitioners enrolled in the organization.
 */
export async function getEnrolledPractitioners(
  medplum: MedplumClient,
  organization: Organization
): Promise<Practitioner[]> {
  // Search ProjectMemberships first
  const membershipSearch = await medplum.search('ProjectMembership', {
    _include: 'ProjectMembership:profile'
  });

  // Get practitioners with access to this organization
  const practitioners = membershipSearch.entry
    ?.filter(e => e.resource?.access?.some(a => 
      a.parameter?.some(p => 
        p.name === 'organization' && 
        p.valueReference?.reference === `Organization/${organization.id}`
      )
    ))
    .map(e => e.resource?.profile)
    .filter(Boolean);

  if (practitioners && practitioners.length > 0) {
    // Get the actual Practitioner resources
    const practitionerSearch = await medplum.search('Practitioner', {
      _id: practitioners.map(p => p?.reference?.split('/')[1] as string).join(','),
      _fields: 'name'
    });
    return practitionerSearch.entry?.map(e => e.resource as Practitioner) ?? [];
  }
  
  return [];
}

export async function getEnrolledPatients(
  medplum: MedplumClient,
  organization: Organization
): Promise<Patient[]> {
  // Invalidate the Patient search cache first
  medplum.invalidateSearches('Patient');

  const searchResult = await medplum.search('Patient', {
    _compartment: `Organization/${organization.id}`,
    _fields: 'name',
  });
  const patients = searchResult.entry?.map(e => e.resource as Patient) ?? [];

  return patients;
}


/**
 * Helper function to get an AccessPolicy by name.
 * @param medplum - The Medplum client.
 * @param name - The name of the AccessPolicy to retrieve.
 * @returns The AccessPolicy.
 */
async function getAccessPolicyByName(medplum: MedplumClient, name: string): Promise<AccessPolicy> {
  const searchResult = await medplum.search('AccessPolicy', {
    name: name
  });
  
  const policy = searchResult.entry?.[0]?.resource as AccessPolicy;
  if (!policy) {
    throw new Error(`AccessPolicy with name "${name}" not found`);
  }
  
  return policy;
}