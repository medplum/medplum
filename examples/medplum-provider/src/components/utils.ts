// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ProjectMembership } from '@medplum/fhirtypes';

/**
 * Returns true if the profile has a DoseSpot identifier.
 *
 * This is a crude approximation for demonstration purposes.
 *
 * In your application, you may want to make this distinction based on user groups, access control lists, etc.
 *
 * @param membership - The current user's project membership.
 * @returns True if the profile has a DoseSpot identifier.
 */
export function hasDoseSpotIdentifier(membership: ProjectMembership | undefined): boolean {
  return !!membership?.identifier?.some((i) => i.system?.includes('dosespot'));
}
