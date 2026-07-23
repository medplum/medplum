// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import type { Project, User } from '@medplum/fhirtypes';
import { MAX_PASSWORD_LENGTH } from '../constants';
import { bcryptHashPassword, isMfaRequired } from './utils';

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

describe('bcryptHashPassword', () => {
  // The guard runs before bcrypt.hash (and before getConfig), so these cases
  // do not require server config to be loaded.
  test('Rejects a password longer than the maximum byte length', () => {
    const tooLong = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);
    expect(() => bcryptHashPassword(tooLong)).toThrow(OperationOutcomeError);
    expect(() => bcryptHashPassword(tooLong)).toThrow(
      `Password must be no more than ${MAX_PASSWORD_LENGTH} characters`
    );
  });

  test('Measures length in bytes, not code points', () => {
    // Each '😀' is 4 UTF-8 bytes, so 19 of them (76 bytes) exceeds the 72-byte
    // limit despite being only 19 code points long.
    const multibyte = '😀'.repeat(19);
    expect(multibyte.length).toBeLessThanOrEqual(MAX_PASSWORD_LENGTH);
    expect(Buffer.byteLength(multibyte, 'utf8')).toBeGreaterThan(MAX_PASSWORD_LENGTH);
    expect(() => bcryptHashPassword(multibyte)).toThrow(OperationOutcomeError);
  });
});
