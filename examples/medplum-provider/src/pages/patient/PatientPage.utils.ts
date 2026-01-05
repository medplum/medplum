// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient, ProjectMembership } from '@medplum/fhirtypes';
import { hasDoseSpotIdentifier } from '../../components/utils';

export function patientPathPrefix(patientId: string): string {
  return `/Patient/${patientId}`;
}

export function prependPatientPath(patient: Patient | undefined, path: string): string {
  if (patient?.id) {
    return `${patientPathPrefix(patient.id)}${!path.startsWith('/') ? '/' : ''}${path}`;
  }

  return path;
}

export function formatPatientPageTabUrl(patientId: string, tab: PatientPageTabInfo): string {
  return `${patientPathPrefix(patientId)}/${tab.url.replace('%patient.id', patientId)}`;
}

export type PatientPageTabInfo = {
  id: string;
  url: string;
  label: string;
};

export function getPatientPageTabOrThrow(tabId: string): PatientPageTabInfo {
  const result = PatientPageTabs.find((tab) => tab.id === tabId);

  if (!result) {
    throw new Error(`Could not find patient page tab with id ${tabId}`);
  }
  return result;
}

/**
 * Returns the patient page tabs filtered based on user permissions.
 * Currently filters out the DoseSpot tab if the user doesn't have DoseSpot access.
 * @param membership - The current user's project membership.
 * @returns Filtered array of patient page tabs.
 */
export function getPatientPageTabs(membership: ProjectMembership | undefined): PatientPageTabInfo[] {
  const hasDoseSpot = hasDoseSpotIdentifier(membership);
  return PatientPageTabs.filter((tab) => tab.id !== 'dosespot' || hasDoseSpot);
}

export const PatientPageTabs: PatientPageTabInfo[] = [
  { id: 'timeline', url: '', label: 'Timeline' },
  { id: 'edit', url: 'edit', label: 'Edit' },
  {
    id: 'encounter',
    url: 'Encounter?_count=20&_fields=_lastUpdated,period,status,serviceType&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Visits',
  },
  {
    id: 'tasks',
    url: 'Task',
    label: 'Tasks',
  },
  {
    id: 'meds',
    url: 'MedicationRequest?_fields=medication[x],intent,status&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Meds',
  },
  {
    id: 'labs',
    url: 'ServiceRequest',
    label: 'Labs',
  },
  {
    id: 'devices',
    url: 'Device?_fields=manufacturer,deviceName,status,distinctIdentifier,serialNumber&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Devices',
  },
  {
    id: 'documentreference',
    url: 'DocumentReference?_fields=_lastUpdated,category,type,status,author&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Documents',
  },
  {
    id: 'careplan',
    url: 'CarePlan?_fields=_lastUpdated,status,intent,category,period&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Care Plans',
  },
  { id: 'message', url: 'Communication', label: 'Messages' },
  { id: 'dosespot', url: 'dosespot', label: 'DoseSpot' },
  { id: 'export', url: 'export', label: 'Export' },
];
