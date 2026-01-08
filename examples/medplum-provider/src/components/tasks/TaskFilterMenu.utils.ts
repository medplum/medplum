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

export const TASK_PRIORITIES: Task['priority'][] = ['routine', 'urgent', 'asap', 'stat'];
