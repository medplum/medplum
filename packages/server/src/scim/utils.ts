import { badRequest, forbidden, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import { Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { inviteUser } from '../admin/invite';
import { getConfig } from '../config';
import { systemRepo } from '../fhir/repo';
import { ScimListResponse, ScimUser } from './types';

/**
 * Searches for users in the project.
 *
 * See SCIM 3.4.2 - Query Resources
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.2
 * @param project The project.
 * @returns List of SCIM users in the project.
 */
export async function searchScimUsers(project: Project): Promise<ScimListResponse<ScimUser>> {
  const memberships = await systemRepo.searchResources<ProjectMembership>({
    resourceType: 'ProjectMembership',
    count: 1000,
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: getReferenceString(project),
      },
    ],
  });

  const users = await systemRepo.readReferences(memberships.map((m) => m.user as Reference<User>));
  const result = [];

  for (let i = 0; i < memberships.length; i++) {
    result.push(convertToScimUser(users[i] as User, memberships[i]));
  }

  return convertToScimListResponse(result);
}

/**
 * Creates a user in the project.
 *
 * See SCIM 3.3 - Creating Resources
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.3
 * @param invitedBy The user who invited the new user.
 * @param project The project.
 * @param scimUser The new user definition.
 * @returns The new user.
 */
export async function createScimUser(
  invitedBy: Reference<User>,
  project: Project,
  scimUser: ScimUser
): Promise<ScimUser> {
  const resourceType = getScimUserResourceType(scimUser);
  if (!resourceType) {
    throw new OperationOutcomeError(badRequest('Missing Medplum user type'));
  }

  const accessPolicy = project.defaultPatientAccessPolicy;
  if (!accessPolicy) {
    throw new OperationOutcomeError(badRequest('Missing defaultPatientAccessPolicy'));
  }

  const { user, membership } = await inviteUser({
    project,
    resourceType,
    firstName: scimUser.name?.givenName as string,
    lastName: scimUser.name?.familyName as string,
    email: scimUser.emails?.[0]?.value,
    externalId: scimUser.externalId,
    sendEmail: false,
    membership: {
      accessPolicy,
      invitedBy,
    },
  });

  return convertToScimUser(user, membership);
}

/**
 * Reads an existing user.
 *
 * See SCIM 3.4.1 - Retrieve a Known Resource
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.1
 * @param project The project.
 * @param id The user ID.
 * @returns The user.
 */
export async function readScimUser(project: Project, id: string): Promise<ScimUser> {
  const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', id);
  if (membership.project?.reference !== getReferenceString(project)) {
    throw new OperationOutcomeError(forbidden);
  }

  const user = await systemRepo.readReference<User>(membership.user as Reference<User>);
  return convertToScimUser(user, membership);
}

/**
 * Updates an existing user.
 *
 * See SCIM 3.5.1 - Replace a Resource
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.5.1
 * @param project The project.
 * @param scimUser The updated user definition.
 * @returns The updated user.
 */
export async function updateScimUser(project: Project, scimUser: ScimUser): Promise<ScimUser> {
  let membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', scimUser.id as string);
  if (membership.project?.reference !== getReferenceString(project)) {
    throw new OperationOutcomeError(forbidden);
  }

  let user = await systemRepo.readReference<User>(membership.user as Reference<User>);
  user.firstName = scimUser.name?.givenName as string;
  user.lastName = scimUser.name?.familyName as string;
  user.externalId = scimUser.externalId;

  if (scimUser.emails?.[0]?.value) {
    user.email = scimUser.emails[0]?.value;
  }

  user = await systemRepo.updateResource(user);

  membership.externalId = scimUser.externalId;
  membership = await systemRepo.updateResource(membership);

  return convertToScimUser(user, membership);
}

/**
 * Deletes an existing user.
 *
 * See SCIM 3.4.1 - Retrieve a Known Resource
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.1
 * @param project The project.
 * @param id The user ID.
 * @returns The user.
 */
export async function deleteScimUser(project: Project, id: string): Promise<void> {
  const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', id);
  if (membership.project?.reference !== getReferenceString(project)) {
    throw new OperationOutcomeError(forbidden);
  }

  return systemRepo.deleteResource('ProjectMembership', id);
}

/**
 * Returns the Medplum profile resource type from the SCIM definition.
 *
 * By default, a SCIM User does not have the equivalent of a FHIR resource type.
 *
 * This function looks for the Medplum extension, which contains the resource type.
 * @param scimUser The SCIM user definition.
 * @returns The FHIR profile resource type if found; otherwise, undefined.
 */
export function getScimUserResourceType(scimUser: ScimUser): 'Patient' | 'Practitioner' | 'RelatedPerson' | undefined {
  const resourceType = scimUser.userType;
  if (resourceType === 'Patient' || resourceType === 'Practitioner' || resourceType === 'RelatedPerson') {
    return resourceType;
  }
  return undefined;
}

/**
 * Converts a Medplum user and project membershipt into a SCIM user.
 * @param user The Medplum user.
 * @param membership The Medplum project membership.
 * @returns The SCIM user.
 */
export function convertToScimUser(user: User, membership: ProjectMembership): ScimUser {
  const config = getConfig();
  const [resourceType, id] = (membership.profile?.reference as string).split('/');
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: membership.id,
    meta: {
      resourceType: 'User',
      version: membership.meta?.lastUpdated,
      lastModified: membership.meta?.lastUpdated,
      location: config.baseUrl + 'scim/2.0/Users/' + membership.id,
    },
    userType: resourceType,
    userName: id,
    externalId: membership.externalId || user.externalId,
    name: {
      givenName: user.firstName,
      familyName: user.lastName,
    },
    emails: [{ value: user.email }],
  };
}

/**
 * Converts an array of resources into a SCIM ListResponse.
 * @param Resources The list of resources.
 * @returns The SCIM ListResponse object.
 */
export function convertToScimListResponse<T>(Resources: T[]): ScimListResponse<T> {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: Resources.length,
    Resources,
  };
}
