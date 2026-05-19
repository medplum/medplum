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
