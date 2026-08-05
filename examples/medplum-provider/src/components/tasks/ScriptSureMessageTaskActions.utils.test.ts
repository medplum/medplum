// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { MedicationRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import {
  createReplacementMedicationRequest,
  ensureReplacementMedicationRequest,
  getReplacementMedicationRequestReference,
  isScriptSureMessageTask,
} from './ScriptSureMessageTaskActions.utils';

const oldMedicationRequest: WithId<MedicationRequest> = {
  resourceType: 'MedicationRequest',
  id: 'old-rx',
  meta: { versionId: '3' },
  status: 'on-hold',
  statusReason: { text: '601 Receiver Unable To Process' },
  intent: 'order',
  authoredOn: '2025-01-01',
  subject: { reference: 'Patient/patient-1' },
  requester: { reference: 'Practitioner/practitioner-1' },
  recorder: { identifier: { value: 'scriptsure' } },
  medicationCodeableConcept: { text: 'Alinia 500 mg tablet' },
  dosageInstruction: [{ text: 'Take one tablet twice daily' }],
  dispenseRequest: {
    quantity: { value: 20, unit: 'tablet' },
    validityPeriod: { start: '2025-01-01', end: '2025-02-01' },
  },
  identifier: [
    { system: 'https://scriptsure.com/message-id', value: 'vendor-message' },
    { system: 'https://example.com/local', value: 'old-local-id' },
  ],
  groupIdentifier: { system: 'https://scriptsure.com/order-group', value: 'group-1' },
  extension: [
    { url: 'https://scriptsure.com/iframe-url', valueUrl: 'https://example.com/secret-session' },
    { url: 'https://scriptsure.com/pending-order-status', valueCode: 'in-cart' },
    { url: 'https://transport.scriptsure.com/session-state', valueString: 'vendor-state' },
    { url: 'https://scriptsure.com.example.com/clinical-review', valueBoolean: true },
    { url: 'https://example.com/clinical-review', valueBoolean: true },
  ],
  eventHistory: [{ reference: 'Provenance/prior-event' }],
};

describe('ScriptSureMessageTaskActions utilities', () => {
  test('recognizes only ScriptSure message Tasks', () => {
    expect(
      isScriptSureMessageTask({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: { coding: [{ system: 'https://scriptsure.com/message-type', code: 'NewRx' }] },
      })
    ).toBe(true);
    expect(
      isScriptSureMessageTask({
        resourceType: 'Task',
        status: 'requested',
        intent: 'order',
        code: { coding: [{ system: 'https://example.com/tasks', code: 'NewRx' }] },
      })
    ).toBe(false);
  });

  test('creates a clean replacement draft while preserving clinical fields', () => {
    const replacement = createReplacementMedicationRequest(oldMedicationRequest, '2026-07-15');

    expect(replacement).toMatchObject({
      resourceType: 'MedicationRequest',
      status: 'draft',
      intent: 'order',
      authoredOn: '2026-07-15',
      subject: oldMedicationRequest.subject,
      requester: oldMedicationRequest.requester,
      medicationCodeableConcept: oldMedicationRequest.medicationCodeableConcept,
      dosageInstruction: oldMedicationRequest.dosageInstruction,
      dispenseRequest: {
        quantity: oldMedicationRequest.dispenseRequest?.quantity,
        validityPeriod: { start: '2026-07-15' },
      },
      priorPrescription: { reference: 'MedicationRequest/old-rx' },
      extension: [
        { url: 'https://scriptsure.com.example.com/clinical-review', valueBoolean: true },
        { url: 'https://example.com/clinical-review', valueBoolean: true },
      ],
    });
    expect(replacement.id).toBeUndefined();
    expect(replacement.meta).toBeUndefined();
    expect(replacement.identifier).toBeUndefined();
    expect(replacement.groupIdentifier).toBeUndefined();
    expect(replacement.statusReason).toBeUndefined();
    expect(replacement.eventHistory).toBeUndefined();
    expect(replacement.recorder).toBeUndefined();
  });

  test('records one replacement output and reuses it on later attempts', async () => {
    const medplum = new MockClient();
    const oldRx = await medplum.createResource<MedicationRequest>({
      ...oldMedicationRequest,
      id: undefined,
      meta: undefined,
    });
    const task = await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      focus: { reference: `MedicationRequest/${oldRx.id}` },
    });

    const first = await ensureReplacementMedicationRequest(medplum, task);
    const second = await ensureReplacementMedicationRequest(medplum, first.task);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.medicationRequest.id).toBe(first.medicationRequest.id);
    expect(first.task.status).toBe('in-progress');
    expect(first.task.output).toHaveLength(1);
    expect(getReplacementMedicationRequestReference(first.task)?.reference).toBe(
      `MedicationRequest/${first.medicationRequest.id}`
    );
    expect(await medplum.searchResources('MedicationRequest')).toHaveLength(2);
  });

  test('removes an unattached replacement draft when the Task update fails', async () => {
    const medplum = new MockClient();
    const oldRx = await medplum.createResource<MedicationRequest>({
      ...oldMedicationRequest,
      id: undefined,
      meta: undefined,
    });
    const task = await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      focus: { reference: `MedicationRequest/${oldRx.id}` },
    });
    const updateResource = medplum.updateResource.bind(medplum);
    vi.spyOn(medplum, 'updateResource').mockImplementation(async (resource) => {
      if (resource.resourceType === 'Task') {
        throw new Error('Task version conflict');
      }
      return updateResource(resource);
    });

    await expect(ensureReplacementMedicationRequest(medplum, task)).rejects.toThrow('Task version conflict');

    expect(await medplum.searchResources('MedicationRequest')).toHaveLength(1);
  });
});
