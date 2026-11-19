// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CodeableConcept, Patient, Reference, Task } from '@medplum/fhirtypes';

export type TaskFilterValue = Reference<Patient> | Reference | CodeableConcept | string;

export enum TaskFilterType {
  STATUS = 'status',
  OWNER = 'owner',
  PERFORMER_TYPE = 'performerType',
  PRIORITY = 'priority',
  PATIENT = 'patient',
}

/** Resource types allowed by `Task.owner`, derived from its `Reference<...>` type. */
export type TaskOwnerType = NonNullable<NonNullable<Task['owner']>['resource']>['resourceType'];

/** Keyed by `TaskOwnerType` so the compiler flags any type missing from or invalid for `Task.owner`. */
const TASK_OWNER_TYPE_MAP: Record<TaskOwnerType, true> = {
  Practitioner: true,
  PractitionerRole: true,
  Organization: true,
  CareTeam: true,
  HealthcareService: true,
  Patient: true,
  Device: true,
  RelatedPerson: true,
};

/** Resource types that can be assigned as the Task owner. */
export const TASK_OWNER_TYPES = Object.keys(TASK_OWNER_TYPE_MAP) as TaskOwnerType[];

export const TASK_STATUSES: Task['status'][] = [
  'draft',
  'requested',
  'received',
  'accepted',
  'rejected',
  'ready',
  'in-progress',
  'on-hold',
  'failed',
  'completed',
];

export const TASK_STATUS_LABELS: Partial<Record<Task['status'], string>> = {
  draft: 'Draft',
  requested: 'Requested',
  received: 'Received',
  accepted: 'Accepted',
  rejected: 'Rejected',
  ready: 'Ready',
  'in-progress': 'In Progress',
  'on-hold': 'On Hold',
  failed: 'Failed',
  completed: 'Completed',
};

export const TASK_PRIORITIES: Task['priority'][] = ['routine', 'urgent', 'asap', 'stat'];

export const TASK_PRIORITY_LABELS: Record<NonNullable<Task['priority']>, string> = {
  routine: 'Routine',
  urgent: 'Urgent',
  asap: 'ASAP',
  stat: 'Stat',
};
