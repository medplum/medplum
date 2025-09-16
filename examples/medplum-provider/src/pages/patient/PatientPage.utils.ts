// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Patient } from '@medplum/fhirtypes';

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
    url: 'Task?_fields=_lastUpdated,code,status,focus&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Tasks',
  },
  {
    id: 'meds',
    url: 'MedicationRequest?_fields=medication[x],intent,status&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Meds',
  },
  {
    id: 'labs',
    url: 'ServiceRequest?_fields=_lastUpdated,code,status,orderDetail,category&_offset=0&_sort=-_lastUpdated&category=108252007&patient=%patient.id',
    label: 'Labs',
  },
  {
    id: 'devices',
    url: 'Device?_fields=manufacturer,deviceName,status,distinctIdentifier,serialNumber&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Devices',
  },
  {
    id: 'diagnosticreports',
    url: 'DiagnosticReport?_fields=_lastUpdated,category,code,status&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Reports',
  },
  {
    id: 'documentreference',
    url: 'DocumentReference?_fields=_lastUpdated,category,type,status,author&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Documents',
  },
  {
    id: 'appointments',
    url: 'Appointment?_fields=_lastUpdated,category,type,status,author&_offset=0&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Appointments',
  },
  {
    id: 'careplan',
    url: 'CarePlan?_fields=_lastUpdated,status,intent,category,period&_sort=-_lastUpdated&patient=%patient.id',
    label: 'Care Plans',
  },
  { id: 'message', url: 'Message', label: 'Messages' },
  { id: 'dosespot', url: 'dosespot', label: 'DoseSpot' },
  { id: 'export', url: 'export', label: 'Export' },
];
