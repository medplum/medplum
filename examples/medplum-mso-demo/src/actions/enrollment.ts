import { Organization, Patient, Practitioner, Reference, ProjectMembership, AccessPolicy, ProjectMembershipAccessParameter } from '@medplum/fhirtypes';
import { MedplumClient } from '@medplum/core';

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
      console.log("policy", policy);
      
      if (existingAccess.length > 0) {
        existingAccess.push({
          parameter: [{ name: 'organization', valueReference: { reference: `Organization/${organization.id}` } }],
          policy: { reference: `AccessPolicy/${policy.id}` }
        });
      } else {
        membershipResource.access = [{
          parameter: [{ name: 'organization', valueReference: { reference: `Organization/${organization.id}` } }],
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

  // Add organization to patient's accounts
  patient.meta = patient.meta || {};
  patient.meta.accounts = [
    ...accounts,
    { reference: orgReference }
  ];
  
  await medplum.updateResource(patient);
  
  // TODO: Trigger bot to update compartments for all patient resources
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
  // TODO: Implement unenroll logic
  // Check if enrolled
  const accounts = patient.meta?.accounts || [];
  const orgReference = `Organization/${organization.id}`;
  if (!accounts.some((a: Reference) => a.reference === orgReference)) {
    return;
  }

  // Remove organization from patient's accounts
  patient.meta = patient.meta || {};
  patient.meta.accounts = accounts.filter((a: Reference) => a.reference !== orgReference);

  await medplum.updateResource(patient);

  // TODO: Trigger bot to update compartments for all patient resources

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
