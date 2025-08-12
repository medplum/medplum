// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Returns control properties for pagination controls.
 * This is specifically for the Mantine Pagination component.
 * See: https://v7.mantine.dev/core/pagination/?t=props
 * @param controlName - The name of the pagination control (e.g., 'previous', 'next').
 * @returns The properties for the pagination control.
 */
export function getPaginationControlProps(controlName: string): Record<string, string> {
  // "next" | "previous" | "first" | "last"
  switch (controlName) {
    case 'next':
      return { 'aria-label': 'Next page' };
    case 'previous':
      return { 'aria-label': 'Previous page' };
    case 'first':
      return { 'aria-label': 'First page' };
    case 'last':
      return { 'aria-label': 'Last page' };
    default:
      return {};
  }
}
