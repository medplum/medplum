// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Login } from '@medplum/fhirtypes';
import { hasSmartResourceScopes } from '../auth/utils';

/**
 * Returns true if AI features support the caller's account type.
 * @param profileReference - The caller's profile reference.
 * @param login - The caller's login.
 * @returns True if the account type is supported.
 */
export function isSupportedAiCaller(profileReference: string | undefined, login: Login): boolean {
  const profileType = profileReference?.split('/')[0];
  if (profileType === 'Patient' || profileType === 'RelatedPerson') {
    return false;
  }
  return !hasSmartResourceScopes(login);
}
