// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Reference, Practitioner, User, CareTeam, Organization, Group, Patient, Task, CodeableConcept } from '@medplum/fhirtypes';

export interface FilterState {
  // Existing
  showMyTasks: boolean;
  status?: Task['status'];
  performerType?: CodeableConcept;

  // New - Assignment filters
  owners?: Reference<Practitioner | User>[];
  requestedPerformers?: Reference<Practitioner | CareTeam | Organization | Group>[];

  // New - Priority and status (multi-select)
  priorities?: Task['priority'][];
  statuses?: Task['status'][];

  // New - Patient filter
  patient?: Reference<Patient>;

  // New - Date range filters
  createdDateRange?: { start?: string; end?: string };
  dueDateRange?: { start?: string; end?: string };
  modifiedDateRange?: { start?: string; end?: string };

  // Quick filters
  showOpenOnly: boolean;
  showHighPriorityOnly: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  showMyTasks: false,
  showOpenOnly: false,
  showHighPriorityOnly: false,
  owners: [],
  requestedPerformers: [],
  priorities: [],
  statuses: [],
  patient: undefined,
  createdDateRange: undefined,
  dueDateRange: undefined,
  modifiedDateRange: undefined,
};

/**
 * All available task statuses for filtering
 */
export const TASK_STATUSES: Task['status'][] = [
  'draft',
  'requested',
  'received',
  'accepted',
  'rejected',
  'ready',
  'cancelled',
  'in-progress',
  'on-hold',
  'failed',
  'completed',
  'entered-in-error',
];

/**
 * Serialize filters to URL search parameters
 * @param filters - The filter state to serialize
 * @returns URL search parameters representing the filters
 */
export function serializeFilters(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  // Boolean flags
  if (filters.showMyTasks) {
    params.set('myTasks', 'true');
  }
  if (filters.showOpenOnly) {
    params.set('openOnly', 'true');
  }
  if (filters.showHighPriorityOnly) {
    params.set('highPriority', 'true');
  }

  // Multi-select arrays
  if (filters.owners && filters.owners.length > 0) {
    params.set('owners', filters.owners.map(o => o.reference).filter(Boolean).join(','));
  }
  if (filters.requestedPerformers && filters.requestedPerformers.length > 0) {
    params.set('performers', filters.requestedPerformers.map(p => p.reference).filter(Boolean).join(','));
  }
  if (filters.priorities && filters.priorities.length > 0) {
    params.set('priorities', filters.priorities.filter(p => p).join(','));
  }
  if (filters.statuses && filters.statuses.length > 0) {
    params.set('statuses', filters.statuses.join(','));
  }

  // Patient reference
  if (filters.patient?.reference) {
    params.set('patient', filters.patient.reference);
  }

  // Date ranges
  if (filters.createdDateRange?.start) {
    params.set('createdFrom', filters.createdDateRange.start);
  }
  if (filters.createdDateRange?.end) {
    params.set('createdTo', filters.createdDateRange.end);
  }
  if (filters.dueDateRange?.start) {
    params.set('dueFrom', filters.dueDateRange.start);
  }
  if (filters.dueDateRange?.end) {
    params.set('dueTo', filters.dueDateRange.end);
  }
  if (filters.modifiedDateRange?.start) {
    params.set('modifiedFrom', filters.modifiedDateRange.start);
  }
  if (filters.modifiedDateRange?.end) {
    params.set('modifiedTo', filters.modifiedDateRange.end);
  }

  // Legacy single-select filters
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.performerType?.text) {
    params.set('performerType', filters.performerType.text);
  }

  return params;
}

/**
 * Deserialize URL search parameters to filters
 * @param searchParams - The URL search parameters to deserialize
 * @returns The filter state reconstructed from the URL parameters
 */
export function deserializeFilters(searchParams: URLSearchParams): FilterState {
  const filters: FilterState = { ...DEFAULT_FILTERS };

  // Boolean flags
  filters.showMyTasks = searchParams.get('myTasks') === 'true';
  filters.showOpenOnly = searchParams.get('openOnly') === 'true';
  filters.showHighPriorityOnly = searchParams.get('highPriority') === 'true';

  // Multi-select arrays
  const ownersStr = searchParams.get('owners');
  if (ownersStr) {
    filters.owners = ownersStr.split(',').map(ref => ({ reference: ref }));
  }

  const performersStr = searchParams.get('performers');
  if (performersStr) {
    filters.requestedPerformers = performersStr.split(',').map(ref => ({ reference: ref }));
  }

  const prioritiesStr = searchParams.get('priorities');
  if (prioritiesStr) {
    filters.priorities = prioritiesStr.split(',') as Task['priority'][];
  }

  const statusesStr = searchParams.get('statuses');
  if (statusesStr) {
    filters.statuses = statusesStr.split(',') as Task['status'][];
  }

  // Patient reference
  const patientRef = searchParams.get('patient');
  if (patientRef) {
    filters.patient = { reference: patientRef };
  }

  // Date ranges
  const createdFrom = searchParams.get('createdFrom');
  const createdTo = searchParams.get('createdTo');
  if (createdFrom || createdTo) {
    filters.createdDateRange = { start: createdFrom || undefined, end: createdTo || undefined };
  }

  const dueFrom = searchParams.get('dueFrom');
  const dueTo = searchParams.get('dueTo');
  if (dueFrom || dueTo) {
    filters.dueDateRange = { start: dueFrom || undefined, end: dueTo || undefined };
  }

  const modifiedFrom = searchParams.get('modifiedFrom');
  const modifiedTo = searchParams.get('modifiedTo');
  if (modifiedFrom || modifiedTo) {
    filters.modifiedDateRange = { start: modifiedFrom || undefined, end: modifiedTo || undefined };
  }

  // Legacy single-select filters
  const status = searchParams.get('status');
  if (status) {
    filters.status = status as Task['status'];
  }

  const performerType = searchParams.get('performerType');
  if (performerType) {
    filters.performerType = { text: performerType };
  }

  return filters;
}
