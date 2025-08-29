// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CodeableConcept, Patient, Reference, Task } from '@medplum/fhirtypes';

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
  'cancelled',
  'in-progress',
  'on-hold',
  'failed',
  'completed',
];
