// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { List, OperationOutcome, Task } from '@medplum/fhirtypes';

export const P360_IMPORT_ALL_OPERATION = '$health-gorilla-hie-p360-import-all';
export const P360_IMPORT_SELECTIVE_OPERATION = '$health-gorilla-hie-p360-import-selective';
export const P360_INGEST_SELECTED_OPERATION = '$health-gorilla-hie-p360-ingest-selected';

export type P360Mode = 'all' | 'selective';
export type P360Phase = 'retrieving' | 'awaiting-selection' | 'importing-selection';

export const P360_CODE_SYSTEM = 'https://www.medplum.com/integrations/health-gorilla';
export const P360_TASK_CODE = `${P360_CODE_SYSTEM}|p360-retrieve`;
export const P360_SOURCE_REFERENCE_SYSTEM = `${P360_CODE_SYSTEM}/source-reference`;
export const HIE_TASK_POLL_INTERVAL_MS = 15_000;

const P360_MODE_CODE = 'p360-mode';
const P360_MANIFEST_CODE = 'p360-selection-manifest';
const P360_SELECTION_COUNT_CODE = 'p360-selection-count';
const P360_IMPORTED_COUNT_CODE = 'p360-imported-count';
const P360_IGNORED_COUNT_CODE = 'p360-ignored-count';
const P360_UNSUPPORTED_COUNT_CODE = 'p360-unsupported-count';
const P360_PHASES: ReadonlySet<string> = new Set(['retrieving', 'awaiting-selection', 'importing-selection']);
const LOCAL_LIST_REFERENCE = /^List\/([A-Za-z0-9._-]{1,64})$/;
const SOURCE_REFERENCE = /^([A-Z][A-Za-z]+)\/([A-Za-z0-9._-]{1,64})$/;

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

export interface P360InventoryItem {
  identifier: string;
  resourceType: string;
  label: string;
  clinicalDate?: string;
}

export function getP360Mode(task: Task): P360Mode | undefined {
  const inputs = task.input?.filter((input) => hasP360Coding(input.type, P360_MODE_CODE)) ?? [];
  const value = inputs[0]?.valueCode;
  return inputs.length === 1 && (value === 'all' || value === 'selective') ? value : undefined;
}

export function getP360Phase(task: Task): P360Phase | undefined {
  const phases = task.businessStatus?.coding?.filter((coding) => coding.system === P360_CODE_SYSTEM) ?? [];
  const value = phases[0]?.code;
  return phases.length === 1 && value && P360_PHASES.has(value) ? (value as P360Phase) : undefined;
}

export function isSelectiveTaskAwaitingSelection(task: Task | undefined): boolean {
  return (
    !!task &&
    task.status === 'ready' &&
    getP360Mode(task) === 'selective' &&
    getP360Phase(task) === 'awaiting-selection'
  );
}

export function isTaskActivelyProcessing(task: Task | undefined): boolean {
  return task?.status === 'in-progress';
}

export function getP360ManifestListIds(task: Task): string[] {
  const outputs = task.output?.filter((output) => hasP360Coding(output.type, P360_MANIFEST_CODE)) ?? [];
  if (outputs.length === 0) {
    throw new Error('The selective Patient360 Task has no selection manifest.');
  }
  const seen = new Set<string>();
  return outputs.map((output) => {
    const reference = output.valueReference?.reference;
    const match = reference ? LOCAL_LIST_REFERENCE.exec(reference) : undefined;
    if (!match) {
      throw new Error(
        `The selective Patient360 Task contains an invalid manifest reference: ${reference ?? 'missing'}.`
      );
    }
    const listId = match[1];
    if (seen.has(listId)) {
      throw new Error(`The selective Patient360 Task contains duplicate manifest List/${listId}.`);
    }
    seen.add(listId);
    return listId;
  });
}

export function getP360ManifestRevisionKey(task: Task): string {
  const references =
    task.output
      ?.filter((output) => hasP360Coding(output.type, P360_MANIFEST_CODE))
      .map((output) => output.valueReference?.reference ?? 'missing') ?? [];
  return `${task.id ?? ''}|${task.meta?.versionId ?? ''}|${references.join('|')}`;
}

export function parseP360InventoryLists(lists: readonly List[], patientId: string): P360InventoryItem[] {
  const seen = new Set<string>();
  const items: P360InventoryItem[] = [];
  for (const list of lists) {
    if (
      list.status !== 'current' ||
      list.mode !== 'snapshot' ||
      !hasP360Coding(list.code, P360_MANIFEST_CODE) ||
      list.subject?.reference !== `Patient/${patientId}`
    ) {
      throw new Error(`List/${list.id ?? 'unknown'} is not a valid Patient360 selection manifest for this patient.`);
    }
    for (const entry of list.entry ?? []) {
      const identifier = entry.item.identifier;
      const value = identifier?.value?.trim();
      const match = value ? SOURCE_REFERENCE.exec(value) : undefined;
      const label = entry.item.display?.trim();
      if (identifier?.system !== P360_SOURCE_REFERENCE_SYSTEM || !value || !match || !label) {
        throw new Error(`List/${list.id ?? 'unknown'} contains a malformed Patient360 inventory entry.`);
      }
      const resourceType = entry.item.type ?? match[1];
      if (resourceType !== match[1]) {
        throw new Error(`Patient360 inventory identifier ${value} does not match its resource type.`);
      }
      if (seen.has(value)) {
        throw new Error(`Patient360 inventory contains duplicate identifier ${value}.`);
      }
      seen.add(value);
      items.push({ identifier: value, resourceType, label, clinicalDate: entry.date });
    }
  }
  return items;
}

export function getP360IgnoredCount(task: Task): number | undefined {
  return getP360OutputCount(task, P360_IGNORED_COUNT_CODE);
}

export function getP360UnsupportedCount(task: Task): number | undefined {
  return getP360OutputCount(task, P360_UNSUPPORTED_COUNT_CODE);
}

export function getP360SelectedCount(task: Task): number | undefined {
  return getP360OutputCount(task, P360_SELECTION_COUNT_CODE);
}

export function getP360ImportedCount(task: Task): number | undefined {
  return getP360OutputCount(task, P360_IMPORTED_COUNT_CODE);
}

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

export function formatP360Phase(phase: P360Phase): string {
  switch (phase) {
    case 'retrieving':
      return 'Retrieving records';
    case 'awaiting-selection':
      return 'Awaiting selection';
    case 'importing-selection':
      return 'Importing selected records';
  }
  return phase;
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
  if (status === 'on-hold' || status === 'ready') {
    return 'yellow';
  }
  return 'blue';
}

function getP360OutputCount(task: Task, code: string): number | undefined {
  const outputs = task.output?.filter((output) => hasP360Coding(output.type, code)) ?? [];
  return outputs.length === 1 ? outputs[0].valueUnsignedInt : undefined;
}

function hasP360Coding(concept: { coding?: { system?: string; code?: string }[] } | undefined, code: string): boolean {
  return concept?.coding?.some((coding) => coding.system === P360_CODE_SYSTEM && coding.code === code) === true;
}
