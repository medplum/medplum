// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import { badRequest, createReference, forbidden, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import type { AccessPolicy, Group, GroupMember, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import type { Operation } from 'rfc6902';
import { inviteUser } from '../admin/invite';
import { getConfig } from '../config/loader';
import { getSystemRepo } from '../fhir/repo';
import { patchObject } from '../util/patch';
import type { ScimGroup, ScimGroupMember, ScimListResponse, ScimPatchRequest, ScimUser } from './types';

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
    const match = /^userName eq "([^"]+)"$/.exec(filter);
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

  let accessPolicy: Reference<AccessPolicy> | undefined = undefined;
  if (resourceType === 'Patient') {
    accessPolicy = project.defaultPatientAccessPolicy;
    if (!accessPolicy) {
      throw new OperationOutcomeError(badRequest('Missing defaultPatientAccessPolicy'));
    }
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

/** System URI for SCIM group identifiers stored in FHIR Group.identifier. */
const SCIM_GROUP_SYSTEM = 'https://medplum.com/scim/group';

/**
 * Searches for groups in the project.
 *
 * See SCIM 3.4.2 - Query Resources
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.2
 * @param project - The project.
 * @param _params - The search parameters (reserved for future filtering).
 * @returns List of SCIM groups in the project.
 */
export async function searchScimGroups(
  project: WithId<Project>,
  _params: Record<string, string>
): Promise<ScimListResponse<ScimGroup>> {
  const systemRepo = getSystemRepo();
  const groups = await systemRepo.searchResources<Group>({
    resourceType: 'Group',
    count: 1000,
    filters: [{ code: 'project', operator: Operator.EQUALS, value: getReferenceString(project) }],
  });

  // Only surface groups that were created via SCIM (have SCIM_GROUP_SYSTEM identifier)
  const scimGroups = groups.filter((g) =>
    g.identifier?.some((i) => i.system === SCIM_GROUP_SYSTEM)
  );

  const result = await Promise.all(scimGroups.map((g) => buildScimGroup(g as WithId<Group>, project)));
  return convertToScimListResponse(result);
}

/**
 * Creates a new SCIM group in the project.
 *
 * See SCIM 3.3 - Creating Resources
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.3
 * @param project - The project.
 * @param scimGroup - The SCIM group definition.
 * @returns The new SCIM group.
 */
export async function createScimGroup(project: WithId<Project>, scimGroup: ScimGroup): Promise<ScimGroup> {
  const systemRepo = getSystemRepo();

  const group = await systemRepo.createResource<Group>({
    resourceType: 'Group',
    type: 'person',
    actual: true,
    name: scimGroup.displayName,
    identifier: scimGroup.externalId
      ? [{ system: SCIM_GROUP_SYSTEM, value: scimGroup.externalId }]
      : [],
    member: [],
  });

  // Add initial members if provided
  const accessPolicy = scimGroup.externalId
    ? await findAccessPolicyForGroup(project, scimGroup.externalId)
    : undefined;

  let updatedGroup = group as WithId<Group>;
  if (scimGroup.members && scimGroup.members.length > 0) {
    for (const member of scimGroup.members) {
      if (member.value) {
        updatedGroup = await addMemberToGroup(updatedGroup, member.value, accessPolicy);
      }
    }
  }

  return buildScimGroup(updatedGroup, project);
}

/**
 * Reads an existing SCIM group by ID.
 *
 * See SCIM 3.4.1 - Retrieve a Known Resource
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.1
 * @param project - The project.
 * @param id - The group ID (FHIR Group resource ID).
 * @returns The SCIM group.
 */
export async function readScimGroup(project: WithId<Project>, id: string): Promise<ScimGroup> {
  const group = await readAndValidateGroup(project, id);
  return buildScimGroup(group, project);
}

/**
 * Replaces a SCIM group (full update).
 *
 * See SCIM 3.5.1 - Replace a Resource
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.5.1
 * @param project - The project.
 * @param scimGroup - The updated SCIM group definition.
 * @returns The updated SCIM group.
 */
export async function updateScimGroup(project: WithId<Project>, scimGroup: ScimGroup): Promise<ScimGroup> {
  const systemRepo = getSystemRepo();
  const existing = await readAndValidateGroup(project, scimGroup.id as string);

  const externalId = scimGroup.externalId ?? existing.identifier?.find((i) => i.system === SCIM_GROUP_SYSTEM)?.value;
  const accessPolicy = externalId ? await findAccessPolicyForGroup(project, externalId) : undefined;

  // Build new member list from SCIM input
  const newMembershipIds = (scimGroup.members ?? []).map((m) => m.value).filter(Boolean) as string[];
  const oldMembershipIds = await Promise.all(
    (existing.member ?? []).map((m) => profileRefToMembershipId(project, m.entity.reference as string))
  ).then((ids) => ids.filter(Boolean) as string[]);

  // Compute diff
  const toAdd = newMembershipIds.filter((id) => !oldMembershipIds.includes(id));
  const toRemove = oldMembershipIds.filter((id) => !newMembershipIds.includes(id));

  // Apply access policy changes
  if (accessPolicy) {
    for (const id of toAdd) {
      await applyGroupAccess(id, accessPolicy);
    }
    for (const id of toRemove) {
      await removeGroupAccess(id, accessPolicy);
    }
  }

  // Build updated FHIR Group
  const newMembers = await Promise.all(newMembershipIds.map((id) => membershipIdToProfileRef(id)));
  const updatedGroup = await systemRepo.updateResource<Group>({
    ...existing,
    name: scimGroup.displayName ?? existing.name,
    identifier: externalId ? [{ system: SCIM_GROUP_SYSTEM, value: externalId }] : existing.identifier ?? [],
    member: newMembers.map((ref) => ({ entity: ref })),
  });

  return buildScimGroup(updatedGroup as WithId<Group>, project);
}

/**
 * Patches an existing SCIM group.
 *
 * See SCIM 3.5.2 - Modifying with PATCH
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.5.2
 * @param project - The project.
 * @param id - The group ID.
 * @param request - The SCIM patch request.
 * @returns The updated SCIM group.
 */
export async function patchScimGroup(project: WithId<Project>, id: string, request: ScimPatchRequest): Promise<ScimGroup> {
  let group = await readAndValidateGroup(project, id);
  const externalId = group.identifier?.find((i) => i.system === SCIM_GROUP_SYSTEM)?.value;
  const accessPolicy = externalId ? await findAccessPolicyForGroup(project, externalId) : undefined;

  for (const op of request.Operations) {
    const { op: verb, path, value } = op;

    if (path === 'members' || path === 'members.value') {
      const newMembers = (value as ScimGroupMember[]) ?? [];
      if (verb === 'add') {
        for (const member of newMembers) {
          if (member.value) {
            group = await addMemberToGroup(group, member.value, accessPolicy);
          }
        }
      } else if (verb === 'replace') {
        group = await replaceGroupMembers(group, project, newMembers, accessPolicy);
      }
    } else if (path && /^members\[value eq "(.+)"\]$/.test(path)) {
      const match = /^members\[value eq "(.+)"\]$/.exec(path);
      if (match) {
        group = await removeMemberFromGroup(group, match[1], accessPolicy);
      }
    } else if (path === 'displayName' && verb === 'replace') {
      const systemRepo = getSystemRepo();
      group = (await systemRepo.updateResource<Group>({ ...group, name: value as string })) as WithId<Group>;
    }
  }

  return buildScimGroup(group, project);
}

/**
 * Deletes an existing SCIM group and removes all access policy assignments from its members.
 *
 * See SCIM 3.6 - Deleting Resources
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.6
 * @param project - The project.
 * @param id - The group ID.
 */
export async function deleteScimGroup(project: WithId<Project>, id: string): Promise<void> {
  const systemRepo = getSystemRepo();
  const group = await readAndValidateGroup(project, id);
  const externalId = group.identifier?.find((i) => i.system === SCIM_GROUP_SYSTEM)?.value;
  const accessPolicy = externalId ? await findAccessPolicyForGroup(project, externalId) : undefined;

  if (accessPolicy) {
    // Remove access policy from all members
    const membershipIds = await Promise.all(
      (group.member ?? []).map((m) => profileRefToMembershipId(project, m.entity.reference as string))
    ).then((ids) => ids.filter(Boolean) as string[]);

    for (const membershipId of membershipIds) {
      await removeGroupAccess(membershipId, accessPolicy);
    }
  }

  await systemRepo.deleteResource('Group', id);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads a Group resource and verifies it belongs to the given project.
 */
async function readAndValidateGroup(project: WithId<Project>, id: string): Promise<WithId<Group>> {
  const systemRepo = getSystemRepo();
  const group = await systemRepo.readResource<Group>('Group', id);
  // meta.project is a Medplum extension - verify this group belongs to the given project
  if ((group.meta as Record<string, string | undefined>)?.project !== 'Project/' + project.id) {
    throw new OperationOutcomeError(forbidden);
  }
  return group as WithId<Group>;
}

/**
 * Converts a FHIR Group to a SCIM Group, resolving member profile refs to ProjectMembership IDs.
 */
async function buildScimGroup(group: WithId<Group>, project: WithId<Project>): Promise<ScimGroup> {
  const config = getConfig();
  const memberEntries = group.member ?? [];
  const members: ScimGroupMember[] = [];
  for (const m of memberEntries) {
    const membershipId = await profileRefToMembershipId(project, m.entity.reference as string);
    if (membershipId) {
      members.push({ value: membershipId });
    }
  }
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: group.id,
    externalId: group.identifier?.find((i) => i.system === SCIM_GROUP_SYSTEM)?.value,
    displayName: group.name,
    members,
    meta: {
      resourceType: 'Group',
      lastModified: group.meta?.lastUpdated,
      location: config.baseUrl + 'scim/2.0/Groups/' + group.id,
    },
  };
}

/**
 * Searches for an AccessPolicy by externalId (matched against identifier.value).
 */
async function findAccessPolicyForGroup(
  project: WithId<Project>,
  externalId: string
): Promise<WithId<AccessPolicy> | undefined> {
  if (!externalId) {
    return undefined;
  }
  const systemRepo = getSystemRepo();
  const policies = await systemRepo.searchResources<AccessPolicy>({
    resourceType: 'AccessPolicy',
    count: 1000,
    filters: [{ code: 'project', operator: Operator.EQUALS, value: getReferenceString(project) }],
  });
  return policies.find((p) => p.identifier?.some((i) => i.value === externalId)) as
    | WithId<AccessPolicy>
    | undefined;
}

/**
 * Adds an AccessPolicy reference to a ProjectMembership.access[] if not already present.
 */
async function applyGroupAccess(membershipId: string, accessPolicy: WithId<AccessPolicy>): Promise<void> {
  const systemRepo = getSystemRepo();
  const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
  const policyRef = getReferenceString(accessPolicy);
  if (membership.access?.some((a) => a.policy?.reference === policyRef)) {
    return;
  }
  await systemRepo.updateResource<ProjectMembership>({
    ...membership,
    access: [...(membership.access ?? []), { policy: createReference(accessPolicy) }],
  });
}

/**
 * Removes an AccessPolicy reference from a ProjectMembership.access[].
 */
async function removeGroupAccess(membershipId: string, accessPolicy: WithId<AccessPolicy>): Promise<void> {
  const systemRepo = getSystemRepo();
  const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
  const policyRef = getReferenceString(accessPolicy);
  await systemRepo.updateResource<ProjectMembership>({
    ...membership,
    access: (membership.access ?? []).filter((a) => a.policy?.reference !== policyRef),
  });
}

/**
 * Resolves a ProjectMembership ID to its profile reference (for storing in Group.member).
 */
async function membershipIdToProfileRef(membershipId: string): Promise<GroupMember['entity']> {
  const systemRepo = getSystemRepo();
  const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
  return membership.profile as GroupMember['entity'];
}

/**
 * Resolves a profile reference string to a ProjectMembership ID.
 */
async function profileRefToMembershipId(
  project: WithId<Project>,
  profileRef: string
): Promise<string | undefined> {
  const systemRepo = getSystemRepo();
  const memberships = await systemRepo.searchResources<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [
      { code: 'project', operator: Operator.EQUALS, value: getReferenceString(project) },
      { code: 'profile', operator: Operator.EQUALS, value: profileRef },
    ],
  });
  return memberships[0]?.id;
}

/**
 * Adds a member to a FHIR Group and optionally applies an AccessPolicy to their membership.
 * Returns the updated Group.
 */
async function addMemberToGroup(
  group: WithId<Group>,
  membershipId: string,
  accessPolicy: WithId<AccessPolicy> | undefined
): Promise<WithId<Group>> {
  const systemRepo = getSystemRepo();
  const profileRef = await membershipIdToProfileRef(membershipId);
  const alreadyMember = (group.member ?? []).some((m) => m.entity.reference === profileRef.reference);
  if (!alreadyMember) {
    group = (await systemRepo.updateResource<Group>({
      ...group,
      member: [...(group.member ?? []), { entity: profileRef }],
    })) as WithId<Group>;
  }
  if (accessPolicy) {
    await applyGroupAccess(membershipId, accessPolicy);
  }
  return group;
}

/**
 * Removes a member from a FHIR Group and optionally removes an AccessPolicy from their membership.
 * Returns the updated Group.
 */
async function removeMemberFromGroup(
  group: WithId<Group>,
  membershipId: string,
  accessPolicy: WithId<AccessPolicy> | undefined
): Promise<WithId<Group>> {
  const systemRepo = getSystemRepo();
  const profileRef = await membershipIdToProfileRef(membershipId);
  group = (await systemRepo.updateResource<Group>({
    ...group,
    member: (group.member ?? []).filter((m) => m.entity.reference !== profileRef.reference),
  })) as WithId<Group>;
  if (accessPolicy) {
    await removeGroupAccess(membershipId, accessPolicy);
  }
  return group;
}

/**
 * Replaces the full member list of a group, computing and applying diffs.
 * Returns the updated Group.
 */
async function replaceGroupMembers(
  group: WithId<Group>,
  project: WithId<Project>,
  newMembers: ScimGroupMember[],
  accessPolicy: WithId<AccessPolicy> | undefined
): Promise<WithId<Group>> {
  const systemRepo = getSystemRepo();
  const newMembershipIds = newMembers.map((m) => m.value).filter(Boolean) as string[];
  const oldMembershipIds = await Promise.all(
    (group.member ?? []).map((m) => profileRefToMembershipId(project, m.entity.reference as string))
  ).then((ids) => ids.filter(Boolean) as string[]);

  const toAdd = newMembershipIds.filter((id) => !oldMembershipIds.includes(id));
  const toRemove = oldMembershipIds.filter((id) => !newMembershipIds.includes(id));

  if (accessPolicy) {
    for (const id of toAdd) {
      await applyGroupAccess(id, accessPolicy);
    }
    for (const id of toRemove) {
      await removeGroupAccess(id, accessPolicy);
    }
  }

  const newProfileRefs = await Promise.all(newMembershipIds.map((id) => membershipIdToProfileRef(id)));
  return (await systemRepo.updateResource<Group>({
    ...group,
    member: newProfileRefs.map((ref) => ({ entity: ref })),
  })) as WithId<Group>;
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
