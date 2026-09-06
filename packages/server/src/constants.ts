// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project, UserSecurityRequest } from '@medplum/fhirtypes';

/**
 * The hardcoded ID for the base FHIR R4 Project.
 *
 * This is a UUIDv5 of the string "R4" in the nil UUID namespace.
 *
 *     r4ProjectId = v5('R4', nullUuid)
 */
export const r4ProjectId = '161452d9-43b7-5c29-aa7b-c85680fa45c6';

export const syntheticR4Project: WithId<Project> = {
  resourceType: 'Project',
  id: r4ProjectId,
  name: 'FHIR R4',
  exportedResourceType: ['StructureDefinition', 'ValueSet', 'CodeSystem', 'SearchParameter', 'OperationDefinition'],
};

/**
 * The hardcoded ID used in `projectId` columns in the database for system resources,
 * that is, resources that are not associated with a specific project.
 *
 * This is a UUIDv5 of the string "systemResource" in the nil UUID namespace.
 *
 *     systemResourceProjectId = v5('systemResource', nullUuid)
 */
export const systemResourceProjectId = '65897e4f-7add-55f3-9b17-035b5a4e6d52';

export const WEBSOCKET_SUB_PUBLISH_CHANNEL = 'medplum:subscriptions:r4:websockets';

/**
 * How long a single-use email MFA code remains valid before it expires, in milliseconds.
 */
export const EMAIL_MFA_CODE_EXPIRATION_MS = 20 * 60 * 1000; // 20 minutes

/**
 * How long a UserSecurityRequest remains valid before it expires, in milliseconds, by request type.
 *
 * Password reset links get a short window because they hand over control of the account.
 * Invite and email verification links are mailed to people who may not act on them right away,
 * so they get a longer one.
 */
export const USER_SECURITY_REQUEST_EXPIRATION_MS: Record<NonNullable<UserSecurityRequest['type']>, number> = {
  reset: 60 * 60 * 1000, // 1 hour
  invite: 7 * 24 * 60 * 60 * 1000, // 7 days
  'verify-email': 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Minimum accepted password length, in bytes.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Maximum accepted password length, in bytes.
 *
 * bcrypt only consumes the first 72 bytes of its input and silently ignores the
 * rest, so anything longer provides a false sense of security (and needlessly
 * hashes/copies data). We cap at 72 bytes so the truncation is explicit rather
 * than silent, and to bound work on the hashing path.
 */
export const MAX_PASSWORD_LENGTH = 72;
