// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Project } from '@medplum/fhirtypes';
import {
  checkDoseSpotEnrollmentLimit,
  DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING,
  getDoseSpotMaxClinicians,
  isDoseSpotEnrollmentLimitReached,
} from './enrollment-utils';

function makeProject(systemSetting: Project['systemSetting']): Pick<Project, 'systemSetting'> {
  return { systemSetting };
}

describe('DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING', () => {
  test('is the correct system setting name', () => {
    expect(DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING).toBe('dosespotMaxClinicians');
  });
});

describe('getDoseSpotMaxClinicians', () => {
  test('Returns undefined when project is undefined', () => {
    expect(getDoseSpotMaxClinicians(undefined)).toBeUndefined();
  });

  test('Returns undefined when project has no systemSetting', () => {
    expect(getDoseSpotMaxClinicians({ systemSetting: undefined })).toBeUndefined();
  });

  test('Returns undefined when project has empty systemSetting', () => {
    expect(getDoseSpotMaxClinicians(makeProject([]))).toBeUndefined();
  });

  test('Returns undefined when setting is not present', () => {
    const project = makeProject([{ name: 'someOtherSetting', valueInteger: 100 }]);
    expect(getDoseSpotMaxClinicians(project)).toBeUndefined();
  });

  test('Returns the configured limit', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 50 }]);
    expect(getDoseSpotMaxClinicians(project)).toBe(50);
  });

  test('Ignores setting when valueInteger is missing', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueString: '50' }]);
    expect(getDoseSpotMaxClinicians(project)).toBeUndefined();
  });

  test('Ignores non-integer values', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 50.5 }]);
    expect(getDoseSpotMaxClinicians(project)).toBeUndefined();
  });

  test('Ignores zero values', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 0 }]);
    expect(getDoseSpotMaxClinicians(project)).toBeUndefined();
  });

  test('Ignores negative values', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: -1 }]);
    expect(getDoseSpotMaxClinicians(project)).toBeUndefined();
  });
});

describe('isDoseSpotEnrollmentLimitReached', () => {
  test('Returns false when under the limit', () => {
    expect(isDoseSpotEnrollmentLimitReached(50, 49)).toBe(false);
  });

  test('Returns true when at the limit', () => {
    expect(isDoseSpotEnrollmentLimitReached(50, 50)).toBe(true);
  });

  test('Returns true when over the limit', () => {
    expect(isDoseSpotEnrollmentLimitReached(50, 51)).toBe(true);
  });

  test('Returns true when limit is 1 and one clinician is enrolled', () => {
    expect(isDoseSpotEnrollmentLimitReached(1, 1)).toBe(true);
  });
});

describe('checkDoseSpotEnrollmentLimit', () => {
  test('Allows enrollment when no limit is configured', () => {
    const result = checkDoseSpotEnrollmentLimit(undefined, 1000);
    expect(result.allowed).toBe(true);
    expect(result.maxClinicians).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  test('Allows enrollment when project has no setting', () => {
    const result = checkDoseSpotEnrollmentLimit(makeProject([]), 25);
    expect(result.allowed).toBe(true);
    expect(result.maxClinicians).toBeUndefined();
  });

  test('Allows enrollment when under the limit and returns the limit', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 10 }]);
    const result = checkDoseSpotEnrollmentLimit(project, 9);
    expect(result.allowed).toBe(true);
    expect(result.maxClinicians).toBe(10);
    expect(result.message).toBeUndefined();
  });

  test('Blocks enrollment when at the limit', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 10 }]);
    const result = checkDoseSpotEnrollmentLimit(project, 10);
    expect(result.allowed).toBe(false);
    expect(result.maxClinicians).toBe(10);
    expect(result.message).toContain('limit reached');
    expect(result.message).toContain('dosespotMaxClinicians');
  });

  test('Blocks enrollment when over the limit', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 10 }]);
    const result = checkDoseSpotEnrollmentLimit(project, 15);
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('10 clinicians enrolled');
  });

  test('Blocks enrollment when limit is 1 and no clinicians are excluded', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 1 }]);
    const result = checkDoseSpotEnrollmentLimit(project, 1);
    expect(result.allowed).toBe(false);
  });

  test('Allows enrollment when limit is 1 and zero clinicians enrolled', () => {
    const project = makeProject([{ name: DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING, valueInteger: 1 }]);
    const result = checkDoseSpotEnrollmentLimit(project, 0);
    expect(result.allowed).toBe(true);
  });
});