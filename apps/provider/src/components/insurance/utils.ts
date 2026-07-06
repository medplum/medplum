// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export function formatPurpose(purpose: string): string {
  switch (purpose) {
    case 'auth-requirements':
      return 'Auth Requirements';
    case 'benefits':
      return 'Benefits';
    case 'discovery':
      return 'Discovery';
    case 'validation':
      return 'Validation';
    default:
      return purpose;
  }
}
