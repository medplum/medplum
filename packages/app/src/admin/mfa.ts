// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProjectSetting, User } from '@medplum/fhirtypes';

export type MfaMethod = 'totp' | 'email';

export const MFA_METHOD_LABELS: Record<MfaMethod, string> = {
  totp: 'Authenticator app (TOTP)',
  email: 'Email',
};

/**
 * Returns the MFA methods a user is enrolled in. Users enrolled before `User.mfaMethod`
 * existed are treated as TOTP-only, mirroring the server's `getEnrolledMfaMethods`.
 * @param user - The user to inspect, if loaded.
 * @returns The enrolled MFA methods, or an empty array.
 */
export function getEnrolledMfaMethods(user: User | undefined): MfaMethod[] {
  if (!user) {
    return [];
  }
  if (user.mfaMethod && user.mfaMethod.length > 0) {
    return user.mfaMethod;
  }
  return user.mfaEnrolled ? ['totp'] : [];
}

/**
 * Returns the MFA methods the project allows users to enroll in, read from the
 * `allowedMfaMethods` project setting (a comma-delimited string, e.g. "totp",
 * "email", or "totp,email"). Mirrors the server's `getAllowedMfaMethods`: when
 * unset, only TOTP authenticator enrollment is offered.
 * @param setting - The project's settings, if loaded.
 * @returns The allowed MFA methods.
 */
export function getAllowedMfaMethods(setting: ProjectSetting[] | undefined): MfaMethod[] {
  const value = setting?.find((s) => s.name === 'allowedMfaMethods')?.valueString;
  if (!value) {
    return ['totp'];
  }
  const methods = value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is MfaMethod => s === 'totp' || s === 'email');
  return methods.length > 0 ? methods : ['totp'];
}
