// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { resolveId } from '@medplum/core';
import type { Extension, MedicationRequest, Reference, Task, TaskOutput } from '@medplum/fhirtypes';
import { SCRIPTSURE_IFRAME_URL_EXTENSION, SCRIPTSURE_PENDING_ORDER_STATUS_EXTENSION } from '@medplum/scriptsure-react';

export const SCRIPTSURE_MESSAGE_TYPE_SYSTEM = 'https://scriptsure.com/message-type';
export const SCRIPTSURE_REPLACEMENT_OUTPUT_SYSTEM = 'https://scriptsure.com/task-output';
export const SCRIPTSURE_REPLACEMENT_OUTPUT_CODE = 'replacement-medication-request';

/**
 * Returns true only for vendor message Tasks owned by this integration.
 *
 * @param task - Task to inspect.
 * @returns True for a ScriptSure message Task.
 */
export function isScriptSureMessageTask(task: Task): boolean {
  return task.code?.coding?.some((coding) => coding.system === SCRIPTSURE_MESSAGE_TYPE_SYSTEM) ?? false;
}

/**
 * Returns true for the NewRx transmission-error workflow that supports local remediation.
 *
 * @param task - Task to inspect.
 * @returns True for a NewRx Task in Error business status.
 */
export function isScriptSureNewRxErrorTask(task: Task): boolean {
  const messageType = task.code?.coding?.find((coding) => coding.system === SCRIPTSURE_MESSAGE_TYPE_SYSTEM)?.code;
  const vendorStatus = task.businessStatus?.coding?.find(
    (coding) => coding.system === 'https://scriptsure.com/message-status'
  )?.code;
  return messageType === 'NewRx' && vendorStatus === 'Error';
}

function isOrderLifecycleExtension(extension: Extension): boolean {
  const url = extension.url.toLowerCase();
  return (
    extension.url === SCRIPTSURE_IFRAME_URL_EXTENSION ||
    extension.url === SCRIPTSURE_PENDING_ORDER_STATUS_EXTENSION ||
    url.includes('scriptsure.com') ||
    url.includes('iframe') ||
    url.includes('pending-order') ||
    url.includes('med-cart') ||
    url.includes('/cart')
  );
}

/**
 * Clones an existing prescription into a clean draft for clinician review.
 *
 * Clinical fields are retained, while resource identity, vendor correlation,
 * transport state, and prior event history are deliberately removed.
 *
 * @param source - Existing MedicationRequest being replaced.
 * @param authoredOn - Date for the new prescription draft.
 * @returns A clean, unsaved replacement MedicationRequest.
 */
export function createReplacementMedicationRequest(
  source: WithId<MedicationRequest>,
  authoredOn = new Date().toISOString().slice(0, 10)
): MedicationRequest {
  const replacement: MedicationRequest = {
    ...source,
    status: 'draft',
    intent: 'order',
    authoredOn,
    priorPrescription: { reference: `MedicationRequest/${source.id}` },
    extension: source.extension?.filter((extension) => !isOrderLifecycleExtension(extension)),
    dispenseRequest: source.dispenseRequest
      ? {
          ...source.dispenseRequest,
          validityPeriod: { start: authoredOn },
        }
      : undefined,
  };

  delete replacement.id;
  delete replacement.meta;
  delete replacement.identifier;
  delete replacement.groupIdentifier;
  delete replacement.statusReason;
  delete replacement.eventHistory;
  delete replacement.recorder;

  if (replacement.extension?.length === 0) {
    delete replacement.extension;
  }

  return replacement;
}

function isReplacementOutput(output: TaskOutput): boolean {
  return (
    output.type?.coding?.some(
      (coding) =>
        coding.system === SCRIPTSURE_REPLACEMENT_OUTPUT_SYSTEM && coding.code === SCRIPTSURE_REPLACEMENT_OUTPUT_CODE
    ) ?? false
  );
}

/**
 * Returns the replacement MedicationRequest reference already recorded on a Task.
 *
 * @param task - Task whose outputs should be inspected.
 * @returns The coded replacement reference, if one exists.
 */
export function getReplacementMedicationRequestReference(task: Task): Reference<MedicationRequest> | undefined {
  return task.output?.find(isReplacementOutput)?.valueReference as Reference<MedicationRequest> | undefined;
}

function createReplacementOutput(medicationRequest: WithId<MedicationRequest>): TaskOutput {
  return {
    type: {
      coding: [
        {
          system: SCRIPTSURE_REPLACEMENT_OUTPUT_SYSTEM,
          code: SCRIPTSURE_REPLACEMENT_OUTPUT_CODE,
          display: 'Replacement MedicationRequest',
        },
      ],
      text: 'Replacement prescription',
    },
    valueReference: {
      reference: `MedicationRequest/${medicationRequest.id}`,
      display: medicationRequest.medicationCodeableConcept?.text,
    },
  };
}

export interface EnsureReplacementResult {
  medicationRequest: WithId<MedicationRequest>;
  task: Task;
  created: boolean;
}

/**
 * Reuses a Task's existing replacement output or creates and records one.
 *
 * Recording the output before launching ScriptSure makes the workflow
 * resumable: closing the widget leaves one discoverable draft rather than
 * creating another replacement on the next click.
 *
 * @param medplum - Authenticated Medplum client.
 * @param task - ScriptSure message Task being remediated.
 * @returns The existing or newly created replacement and current Task.
 */
export async function ensureReplacementMedicationRequest(
  medplum: MedplumClient,
  task: Task
): Promise<EnsureReplacementResult> {
  const existingReference = getReplacementMedicationRequestReference(task);
  const existingId = resolveId(existingReference);
  if (existingId) {
    return {
      medicationRequest: await medplum.readResource('MedicationRequest', existingId),
      task,
      created: false,
    };
  }

  const focusedId = resolveId(task.focus);
  if (!focusedId || !task.focus?.reference?.startsWith('MedicationRequest/')) {
    throw new Error('This Task does not reference a MedicationRequest to replace');
  }

  const source = await medplum.readResource('MedicationRequest', focusedId);
  const created = await medplum.createResource(createReplacementMedicationRequest(source));
  let updatedTask: Task;
  try {
    updatedTask = await medplum.updateResource<Task>({
      ...task,
      status: 'in-progress',
      output: [...(task.output ?? []), createReplacementOutput(created)],
    });
  } catch (err) {
    // No vendor action has happened yet, so a draft that cannot be attached to
    // the Task is safe to remove. This prevents an orphan and makes retry
    // idempotent after optimistic-lock failures.
    try {
      await medplum.deleteResource('MedicationRequest', created.id);
    } catch {
      // Preserve the original Task update error.
    }
    throw err;
  }

  return { medicationRequest: created, task: updatedTask, created: true };
}
