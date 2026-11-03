// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block routingImports
import type { MedplumClient } from '@medplum/core';
import { getStatus, normalizeOperationOutcome } from '@medplum/core';
import type { Annotation, Bundle, CodeableConcept, Communication, Task } from '@medplum/fhirtypes';
// end-block routingImports

// start-block versionedTask
function versionHeader(resource: Task | Communication): string {
  if (!resource.id || !resource.meta?.versionId) {
    throw new Error('Read the saved resource and its version before updating it');
  }
  return `W/"${resource.meta.versionId}"`;
}
// end-block versionedTask

// start-block claimTaskTs
export async function claimTask(
  medplum: MedplumClient,
  current: Task,
  owner: NonNullable<Task['owner']>
): Promise<Task | undefined> {
  const ifMatch = versionHeader(current);
  if (current.owner || current.status !== 'ready') {
    throw new Error('This Task is no longer available in the ready, unowned pool');
  }
  try {
    return await medplum.updateResource({ ...current, owner }, { headers: { 'If-Match': ifMatch } });
  } catch (error) {
    if (getStatus(normalizeOperationOutcome(error)) === 412) {
      // Let the caller reload and show the current assignment. Do not retry the write.
      return undefined;
    }
    throw error;
  }
}
// end-block claimTaskTs

// start-block rerouteToProviderTs
export async function rerouteToProvider(
  medplum: MedplumClient,
  current: Task,
  thread: Communication,
  owner: NonNullable<Task['owner']>,
  participant: NonNullable<Communication['recipient']>[number],
  note: Annotation
): Promise<Bundle> {
  const taskVersion = versionHeader(current);
  const threadVersion = versionHeader(thread);
  // Thread headers group messages and carry no payload of their own.
  if (current.focus?.reference !== `Communication/${thread.id}` || thread.partOf?.length || thread.payload?.length) {
    throw new Error('Expected the thread header referenced by this Task');
  }
  if (!['ready', 'accepted', 'in-progress', 'on-hold'].includes(current.status)) {
    throw new Error('Only open response work can be rerouted');
  }
  if (!participant.reference) {
    throw new Error('The joining participant needs a resource reference');
  }
  const recipients = [...(thread.recipient ?? [])];
  // Retain all participants, including the creator, and avoid adding duplicates.
  for (const member of [thread.sender, participant]) {
    if (member?.reference && !recipients.some((entry) => entry.reference === member.reference)) {
      recipients.push(member);
    }
  }
  return medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: { ...current, owner, note: [...(current.note ?? []), note] },
        request: { method: 'PUT', url: `Task/${current.id}`, ifMatch: taskVersion },
      },
      {
        resource: { ...thread, recipient: recipients },
        request: { method: 'PUT', url: `Communication/${thread.id}`, ifMatch: threadVersion },
      },
    ],
  });
}
// end-block rerouteToProviderTs

// start-block rerouteToPoolTs
export async function rerouteToPool(
  medplum: MedplumClient,
  current: Task,
  role: CodeableConcept,
  note: Annotation
): Promise<Task> {
  const ifMatch = versionHeader(current);
  if (!['ready', 'accepted', 'in-progress', 'on-hold'].includes(current.status)) {
    throw new Error('Only open response work can return to the pool');
  }
  const updated: Task = {
    ...current,
    status: 'ready',
    performerType: [role],
    note: [...(current.note ?? []), note],
  };
  delete updated.owner;
  // This pool treats the transfer as ready for a new assignee to resume.
  delete updated.statusReason;
  return medplum.updateResource(updated, { headers: { 'If-Match': ifMatch } });
}
// end-block rerouteToPoolTs
