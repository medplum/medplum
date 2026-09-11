// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Project, ProjectSetting } from '@medplum/fhirtypes';

/**
 * The name of the {@link Project.systemSetting} entry that caps the total number
 * of clinicians the DoseSpot enrollment bots (admin-driven and self-service) are
 * allowed to enroll in a Project.
 *
 * The value is stored as `valueInteger` and can only be set by Super Admins.
 * When the number of already-enrolled clinicians reaches this limit, the
 * enrollment bots stop enrolling new clinicians and return an error instead.
 *
 * If the setting is not present, or the value is not a positive integer,
 * enrollment is unlimited (no cap is enforced).
 */
export const DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING = 'dosespotMaxClinicians';

/**
 * Returns the maximum number of clinicians the DoseSpot enrollment bots are
 * allowed to enroll, as configured in the Project's system settings.
 *
 * @param project - The Project resource (or any subset containing `systemSetting`).
 * @returns The configured limit as a positive integer, or `undefined` if no
 * valid limit is configured (meaning enrollment is unlimited).
 */
export function getDoseSpotMaxClinicians(
  project: Pick<Project, 'systemSetting'> | undefined
): number | undefined {
  const setting: ProjectSetting | undefined = project?.systemSetting?.find(
    (s) => s.name === DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING
  );
  const value = setting?.valueInteger;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

/**
 * Returns true when the enrollment limit has been reached, meaning the
 * enrollment bots should refuse to enroll any additional clinicians.
 *
 * @param maxClinicians - The maximum number of clinicians allowed to be enrolled.
 * @param currentClinicianCount - The number of clinicians already enrolled.
 * @returns True if `currentClinicianCount` is greater than or equal to `maxClinicians`.
 */
export function isDoseSpotEnrollmentLimitReached(
  maxClinicians: number,
  currentClinicianCount: number
): boolean {
  return currentClinicianCount >= maxClinicians;
}

/**
 * Checks whether enrolling an additional clinician would exceed the Project's
 * configured DoseSpot clinician limit.
 *
 * This is the guard rail the DoseSpot auto-enrollment bots should call before
 * creating a new clinician in DoseSpot. When a limit is configured and the
 * current clinician count has reached it, the bots stop and return an error
 * instead of over-enrolling.
 *
 * @param project - The Project resource (or any subset containing `systemSetting`).
 * @param currentClinicianCount - The number of clinicians already enrolled in the Project.
 * @returns An object with `allowed` set to true when enrollment may proceed.
 * When `allowed` is false, `maxClinicians` contains the configured limit and
 * `message` contains a human-readable explanation suitable for bot error output.
 */
export function checkDoseSpotEnrollmentLimit(
  project: Pick<Project, 'systemSetting'> | undefined,
  currentClinicianCount: number
): { allowed: boolean; maxClinicians?: number; message?: string } {
  const maxClinicians = getDoseSpotMaxClinicians(project);
  if (maxClinicians === undefined) {
    return { allowed: true };
  }
  if (isDoseSpotEnrollmentLimitReached(maxClinicians, currentClinicianCount)) {
    return {
      allowed: false,
      maxClinicians,
      message:
        `DoseSpot enrollment limit reached: ${currentClinicianCount} of ${maxClinicians} clinicians enrolled. ` +
        `Increase the '${DOSESPOT_MAX_CLINICIANS_SYSTEM_SETTING}' project system setting to enroll more clinicians.`,
    };
  }
  return { allowed: true, maxClinicians };
}