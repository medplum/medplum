// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Badge colors per Condition clinical status, matching the Problems section of PatientSummary.
 * @param status - The condition-clinical code.
 * @returns The Mantine color name.
 */
export function getConditionStatusColor(status: string | undefined): string {
  switch (status) {
    case 'active':
    case 'recurrence':
    case 'relapse':
      return 'green';
    case 'inactive':
      return 'orange';
    case 'remission':
      return 'blue';
    case 'resolved':
      return 'teal';
    default:
      return 'gray';
  }
}
