// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';

function patientPathPrefix(patientId: string): string {
  return `/Patient/${patientId}`;
}

export function prependPatientPath(patient: Patient | undefined, path: string): string {
  if (patient?.id) {
    return `${patientPathPrefix(patient.id)}${!path.startsWith('/') ? '/' : ''}${path}`;
  }

  return path;
}

export type PatientPageTabInfo = {
  id: string;
  url: string;
  label: string;
};

export const PatientPageTabs: PatientPageTabInfo[] = [
  { id: 'timeline', url: '', label: 'Timeline' },
  { id: 'edit', url: 'edit', label: 'Edit' },
];
