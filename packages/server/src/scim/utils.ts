// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  badRequest,
  forbidden,
  getReferenceString,
  OperationOutcomeError,
  Operator,
  SearchRequest,
  WithId,
} from '@medplum/core';
import { Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { Operation } from 'rfc6902';
import { inviteUser } from '../admin/invite';
import { getConfig } from '../config/loader';
import { getSystemRepo } from '../fhir/repo';
import { patchObject } from '../util/patch';
import { ScimListResponse, ScimPatchRequest, ScimUser } from './types';

/**
 * Searches for users in the project.
 *
 * See SCIM 3.4.2 - Query Resources
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.2
 * @param project - The project.
 * @param params - The search parameters.
 * @returns List of SCIM users in the project.
 */
export async function searchScimUsers(
  project: WithId<Project>,
  params: Record<string, string>
): Promise<ScimListResponse<ScimUser>> {
  const searchRequest = {
    resourceType: 'ProjectMembership',
    count: 1000,
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: getReferenceString(project),
      },
      {
        code: 'profile-type',
        operator: Operator.EQUALS,
        value: 'Patient,Practitioner,RelatedPerson',
      },
    ],
  } satisfies SearchRequest<ProjectMembership>;

  const filter = params.filter;
  if (filter && typeof filter === 'string') {
    const match = filter.match(/^userName eq "([^"]+)"$/);
    if (match) {
      searchRequest.filters.push({
        code: 'user-name',
        operator: Operator.EQUALS,
        value: match[1],
      });
    }
  }

  const systemRepo = getSystemRepo();
  const memberships = await systemRepo.searchResources<ProjectMembership>(searchRequest);

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
 * @param invitedBy - The user who invited the new user.
 * @param project - The project.
 * @param scimUser - The new user definition.
 * @returns The new user.
 */
export async function createScimUser(
  invitedBy: Reference<User>,
  project: WithId<Project>,
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
      userName: scimUser.userName,
    },
  });

  return convertToScimUser(user, membership);
}

/**
 * Reads an existing user.
 *
 * See SCIM 3.4.1 - Retrieve a Known Resource
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.1
 * @param project - The project.
 * @param id - The user ID.
 * @returns The user.
 */
export async function readScimUser(project: Project, id: string): Promise<ScimUser> {
  const systemRepo = getSystemRepo();
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
 * @param project - The project.
 * @param scimUser - The updated user definition.
 * @returns The updated user.
 */
export async function updateScimUser(project: Project, scimUser: ScimUser): Promise<ScimUser> {
  const systemRepo = getSystemRepo();
  let membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', scimUser.id as string);
  if (membership.project?.reference !== getReferenceString(project)) {
    throw new OperationOutcomeError(forbidden);
  }

  let user = await systemRepo.readReference<User>(membership.user as Reference<User>);

  // Copy the updated properties from the SCIM user to the Medplum user and membership
  scimUserToUserAndMembership(scimUser, user, membership);

  // Save the updated user and membership
  user = await systemRepo.updateResource(user);
  membership = await systemRepo.updateResource(membership);

  return convertToScimUser(user, membership);
}

/**
 * Patches an existing user.
 *
 * See SCIM 3.5.2 - Modifying with PATCH
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.5.2
 *
 * @param project - The project.
 * @param id - The user ID.
 * @param request - The patch request.
 * @returns The updated user.
 */
export async function patchScimUser(project: Project, id: string, request: ScimPatchRequest): Promise<ScimUser> {
  const systemRepo = getSystemRepo();
  let membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', id);
  if (membership.project?.reference !== getReferenceString(project)) {
    throw new OperationOutcomeError(forbidden);
  }

  let user = await systemRepo.readReference<User>(membership.user as Reference<User>);

  // Convert the user and membership to a SCIM user
  const scimUser = convertToScimUser(user, membership);

  // Apply the patch operations
  patchObject(scimUser, convertScimToJsonPatch(request));

  // Copy the updated properties from the SCIM user to the Medplum user and membership
  scimUserToUserAndMembership(scimUser, user, membership);

  // Save the updated user and membership
  user = await systemRepo.updateResource(user);
  membership = await systemRepo.updateResource(membership);

  return convertToScimUser(user, membership);
}

/**
 * Deletes an existing user.
 *
 * See SCIM 3.4.1 - Retrieve a Known Resource
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.1
 * @param project - The project.
 * @param id - The user ID.
 * @returns The user.
 */
export async function deleteScimUser(project: Project, id: string): Promise<void> {
  const systemRepo = getSystemRepo();
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
 * @param scimUser - The SCIM user definition.
 * @returns The FHIR profile resource type if found; otherwise, undefined.
 */
export function getScimUserResourceType(scimUser: ScimUser): 'Patient' | 'Practitioner' | 'RelatedPerson' {
  const resourceType = scimUser.userType;
  if (resourceType === 'Patient' || resourceType === 'Practitioner' || resourceType === 'RelatedPerson') {
    return resourceType;
  }
  // Default to "Practitioner"
  return 'Practitioner';
}

/**
 * Converts a Medplum user and project membershipt into a SCIM user.
 * @param user - The Medplum user.
 * @param membership - The Medplum project membership.
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
    userName: membership.userName || id,
    externalId: membership.externalId || user.externalId,
    name: {
      givenName: user.firstName,
      familyName: user.lastName,
    },
    emails: [{ value: user.email }],
    active: membership.active ?? true, // Default to true
  };
}

/**
 * Copies the SCIM user properties to the Medplum user and project membership.
 * @param scimUser - The input SCIM user.
 * @param user - The output Medplum user.
 * @param membership - The output Medplum project membership.
 */
function scimUserToUserAndMembership(scimUser: ScimUser, user: User, membership: ProjectMembership): void {
  user.firstName = scimUser.name?.givenName as string;
  user.lastName = scimUser.name?.familyName as string;
  user.externalId = scimUser.externalId;

  if (scimUser.emails?.[0]?.value) {
    user.email = scimUser.emails[0]?.value;
  }

  if (scimUser.active !== undefined) {
    membership.active = scimUser.active;
  }

  membership.externalId = scimUser.externalId;
}

/**
 * Converts an array of resources into a SCIM ListResponse.
 * @param Resources - The list of resources.
 * @returns The SCIM ListResponse object.
 */
export function convertToScimListResponse<T>(Resources: T[]): ScimListResponse<T> {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: Resources.length,
    itemsPerPage: Resources.length,
    startIndex: 1,
    Resources,
  };
}

/**
 * Converts a SCIM patch request to a JSONPatch request.
 * SCIM PATCH operations are not the same as JSONPatch operations.
 * SCIM PATCH can omit "path" if the operation is "add" or "replace".
 * SCIM PATCH "path" values can omit the leading "/".
 *
 * See: https://www.rfc-editor.org/rfc/rfc7644#section-3.5.2
 *
 * @param scimPatch - The original SCIM patch request.
 * @returns The converted JSONPatch request.
 */
export function convertScimToJsonPatch(scimPatch: ScimPatchRequest): Operation[] {
  if (scimPatch.schemas?.[0] !== 'urn:ietf:params:scim:api:messages:2.0:PatchOp') {
    throw new Error('Invalid SCIM patch: missing required schema');
  }

  return scimPatch.Operations.flatMap((inputOperation) => {
    const { op, path, value } = inputOperation;

    if (op !== 'add' && op !== 'remove' && op !== 'replace') {
      throw new Error('Invalid SCIM patch: unsupported operation');
    }

    if (path) {
      if (path.startsWith('/')) {
        throw new Error('Invalid SCIM patch: path must not start with "/"');
      }
      return { ...inputOperation, path: `/${path}` } as Operation;
    }

    if (op !== 'add' && op !== 'replace') {
      // If "path" is missing, only "add" and "replace" operations are allowed
      throw new Error('Invalid SCIM patch: missing required path');
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      // SCIM PATCH operations do not support arrays
      throw new Error('Invalid SCIM patch: value must be an object if path is missing');
    }

    const entries = Object.entries(value);
    return entries.map(([key, val]) => ({
      op: op,
      path: `/${key}`,
      value: val,
    }));
  });
}
