// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { OperationOutcome, Task } from '@medplum/fhirtypes';

export const HEALTH_GORILLA_HIE_P360_TASK_CODE = 'https://www.medplum.com/integrations/health-gorilla|p360-retrieve';
export const HEALTH_GORILLA_HIE_P360_OPERATION = '$health-gorilla-hie-p360';
export const HIE_TASK_POLL_INTERVAL_MS = 15_000;

const TERMINAL_TASK_STATUSES: ReadonlySet<Task['status']> = new Set([
  'rejected',
  'cancelled',
  'failed',
  'completed',
  'entered-in-error',
]);
const FAILURE_TASK_STATUSES: ReadonlySet<Task['status']> = new Set([
  'rejected',
  'cancelled',
  'failed',
  'entered-in-error',
]);

export function isTerminalTask(task: Task): boolean {
  return TERMINAL_TASK_STATUSES.has(task.status);
}

export function isImportDisabled(
  latestTask: Task | undefined,
  taskLoading: boolean,
  taskOutcome: OperationOutcome | undefined
): boolean {
  return taskLoading || !!taskOutcome || (!!latestTask && !isTerminalTask(latestTask));
}

export function getImportButtonLabel(latestTask: Task | undefined): string {
  if (latestTask?.status === 'completed') {
    return 'Import Again';
  }
  if (latestTask && FAILURE_TASK_STATUSES.has(latestTask.status)) {
    return 'Retry Import';
  }
  return 'Import from HIE';
}

export function formatTaskStatus(status: Task['status']): string {
  return status
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getTaskStatusColor(status: Task['status']): string {
  if (status === 'completed') {
    return 'green';
  }
  if (FAILURE_TASK_STATUSES.has(status)) {
    return 'red';
  }
  if (status === 'on-hold') {
    return 'yellow';
  }
  return 'blue';
}
