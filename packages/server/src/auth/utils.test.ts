// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project, User } from '@medplum/fhirtypes';
import { isMfaRequired } from './utils';

describe('isMfaRequired', () => {
  function createMfaTestUser(mfaRequired?: boolean): User {
    return { resourceType: 'User', firstName: 'Test', lastName: 'User', mfaRequired };
  }

  function projectWithSetting(value: boolean | undefined): Project {
    if (value === undefined) {
      return { resourceType: 'Project' };
    }
    return { resourceType: 'Project', setting: [{ name: 'mfaRequired', valueBoolean: value }] };
  }

  test('Falls back to user setting when project setting is unset', () => {
    expect(isMfaRequired(createMfaTestUser(true), undefined)).toBe(true);
    expect(isMfaRequired(createMfaTestUser(false), undefined)).toBe(false);
    expect(isMfaRequired(createMfaTestUser(), undefined)).toBe(false);
    expect(isMfaRequired(createMfaTestUser(), projectWithSetting(undefined))).toBe(false);
  });

  test('Project setting requires MFA regardless of user setting', () => {
    expect(isMfaRequired(createMfaTestUser(), projectWithSetting(true))).toBe(true);
    expect(isMfaRequired(createMfaTestUser(true), projectWithSetting(true))).toBe(true);
    // Project requirement is enforced even when the user has opted out.
    expect(isMfaRequired(createMfaTestUser(false), projectWithSetting(true))).toBe(true);
  });

  test('Project setting can only tighten, never relax a user requirement', () => {
    // A project that does not require MFA must not turn off a user who
    // individually requires it.
    expect(isMfaRequired(createMfaTestUser(true), projectWithSetting(false))).toBe(true);
    // ...nor when the project setting is unset entirely.
    expect(isMfaRequired(createMfaTestUser(true), projectWithSetting(undefined))).toBe(true);
    expect(isMfaRequired(createMfaTestUser(true), undefined)).toBe(true);
    // A project that does not require MFA leaves an unset user unaffected.
    expect(isMfaRequired(createMfaTestUser(), projectWithSetting(false))).toBe(false);
  });
});
