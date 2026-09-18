// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { MedicationRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_POLL_MS } from '../../hooks/useMedicationRequestSyncPolling';
import { ScriptSureMessageTaskActions } from './ScriptSureMessageTaskActions';
import {
  SCRIPTSURE_REPLACEMENT_OUTPUT_CODE,
  SCRIPTSURE_REPLACEMENT_OUTPUT_SYSTEM,
} from './ScriptSureMessageTaskActions.utils';

const notificationMocks = vi.hoisted(() => ({ showErrorNotification: vi.fn() }));
const { showErrorNotification } = notificationMocks;
vi.mock('../../utils/notifications', () => notificationMocks);
vi.mock('../../pages/meds/OrderMedicationPage', () => ({
  OrderMedicationPage: (props: {
    replacementMedicationRequest: MedicationRequest;
    onOrderComplete: (result: { launchUrl: string; medicationRequestId?: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onOrderComplete({
          launchUrl: 'https://scriptsure.example/widgets/prescription/replacement',
          medicationRequestId: props.replacementMedicationRequest.id,
        })
      }
    >
      Submit replacement form for {props.replacementMedicationRequest.medicationCodeableConcept?.text}
    </button>
  ),
}));

const scriptSureTask: Task = {
  resourceType: 'Task',
  id: 'task-1',
  status: 'requested',
  intent: 'order',
  code: {
    coding: [{ system: 'https://scriptsure.com/message-type', code: 'NewRx' }],
    text: 'Prescription Transmission Error',
  },
  businessStatus: {
    coding: [{ system: 'https://scriptsure.com/message-status', code: 'Error', display: 'Transmission Error' }],
    text: 'Prescription transmission error',
  },
  for: { reference: 'Patient/patient-1' },
  focus: { reference: 'MedicationRequest/rx-1' },
  input: [
    { type: { text: 'pharmacy' }, valueString: 'Rapid-Rx Online Pharmacy' },
    { type: { text: 'messageResponse' }, valueString: '601 Receiver Unable To Process' },
    { type: { text: 'drugName' }, valueString: 'Alinia 500 mg tablet' },
  ],
};

function setup(
  task: Task,
  onTaskChange = vi.fn(),
  medplum = new MockClient()
): { medplum: MockClient; onTaskChange: Mock; unmount: () => void } {
  const result = render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ScriptSureMessageTaskActions task={task} onTaskChange={onTaskChange} />
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );
  return { medplum, onTaskChange, unmount: result.unmount };
}

async function setupWithReplacement(
  status: MedicationRequest['status']
): Promise<{ medplum: MockClient; replacement: WithId<MedicationRequest>; task: Task; onTaskChange: Mock }> {
  const medplum = new MockClient();
  const replacement = await medplum.createResource<MedicationRequest>({
    resourceType: 'MedicationRequest',
    status,
    intent: 'order',
    subject: { reference: 'Patient/patient-1' },
    medicationCodeableConcept: { text: 'Alinia 500 mg tablet' },
  });
  const task: Task = {
    ...scriptSureTask,
    id: 'task-with-replacement',
    output: [
      {
        type: { coding: [{ system: SCRIPTSURE_REPLACEMENT_OUTPUT_SYSTEM, code: SCRIPTSURE_REPLACEMENT_OUTPUT_CODE }] },
        valueReference: { reference: `MedicationRequest/${replacement.id}` },
      },
    ],
  };
  const { onTaskChange } = setup(task, vi.fn(), medplum);
  return { medplum, replacement, task, onTaskChange };
}

describe('ScriptSureMessageTaskActions', () => {
  beforeEach(() => showErrorNotification.mockClear());
  afterEach(() => vi.useRealTimers());

  test('does not render for a generic Task', () => {
    setup({
      resourceType: 'Task',
      id: 'generic-task',
      status: 'requested',
      intent: 'order',
      code: { coding: [{ system: 'https://example.com/task-type', code: 'follow-up' }] },
    });

    expect(screen.queryByText('Pharmacy message')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('renders structured ScriptSure pharmacy context and focused prescription link', () => {
    setup(scriptSureTask);

    expect(screen.getByText('Pharmacy message')).toBeInTheDocument();
    expect(screen.getByText('Rapid-Rx Online Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('601 Receiver Unable To Process')).toBeInTheDocument();
    expect(screen.getByText('Alinia 500 mg tablet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View affected MedicationRequest' })).toHaveAttribute(
      'href',
      '/Patient/patient-1/MedicationRequest/rx-1'
    );
    expect(screen.getByRole('button', { name: 'Acknowledge error' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-prescribe' })).toBeInTheDocument();
  });

  test('allows unmatched errors to be acknowledged but not re-prescribed', () => {
    setup({ ...scriptSureTask, focus: undefined });

    expect(screen.getByRole('button', { name: 'Acknowledge error' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-prescribe' })).not.toBeInTheDocument();
  });

  test('does not offer remediation actions for a terminal Task', () => {
    setup({ ...scriptSureTask, status: 'completed' });

    expect(screen.queryByRole('button', { name: 'Acknowledge error' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-prescribe' })).not.toBeInTheDocument();
  });

  test('launches a fresh Messages widget and reconciles when it closes', async () => {
    const user = userEvent.setup();
    const { medplum, onTaskChange } = setup(scriptSureTask);
    const launchedTask = { ...scriptSureTask, status: 'in-progress' as const };
    const reconciledTask = { ...launchedTask, businessStatus: { text: 'Error' } };
    const executeBot = vi.spyOn(medplum, 'executeBot').mockImplementation(async (_identifier, request) => {
      if (request.action === 'launch') {
        return { task: launchedTask, launchUrl: 'https://scriptsure.example/widgets/message/patient-1' };
      }
      if (request.patientId) {
        return { scriptSurePatientId: 999 };
      }
      return { task: reconciledTask, vendorStatus: 'Error' };
    });

    await user.click(screen.getByRole('button', { name: 'Open ScriptSure patient Messages' }));

    expect(await screen.findByTitle('ScriptSure patient Messages')).toHaveAttribute(
      'src',
      expect.stringContaining('https://scriptsure.example/widgets/message/patient-1')
    );
    expect(executeBot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: 'task-1', action: 'launch' })
    );

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(executeBot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ patientId: 'patient-1' }));
      expect(executeBot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ taskId: 'task-1', action: 'reconcile' })
      );
    });
    expect(onTaskChange).toHaveBeenCalledWith(reconciledTask);
  });

  test('acknowledges only the NewRx error action', async () => {
    const user = userEvent.setup();
    const { medplum, onTaskChange, unmount } = setup(scriptSureTask);
    const acknowledgedTask = { ...scriptSureTask, status: 'completed' as const };
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({
      task: acknowledgedTask,
      vendorStatus: 'Error Reviewed',
    });

    await user.click(screen.getByRole('button', { name: 'Acknowledge error' }));

    await waitFor(() => {
      expect(executeBot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ taskId: 'task-1', action: 'acknowledge' })
      );
    });
    expect(onTaskChange).toHaveBeenCalledWith(acknowledgedTask);

    unmount();
    const renewalTask: Task = {
      ...scriptSureTask,
      code: { coding: [{ system: 'https://scriptsure.com/message-type', code: 'RxRenewalRequest' }] },
    };
    setup(renewalTask);
    expect(screen.queryByRole('button', { name: 'Acknowledge error' })).not.toBeInTheDocument();
  });

  test('creates a clean replacement and opens the pre-filled editor before ScriptSure', async () => {
    const user = userEvent.setup();
    const medplum = new MockClient();
    const oldRx = await medplum.createResource<MedicationRequest>({
      resourceType: 'MedicationRequest',
      status: 'on-hold',
      statusReason: { text: '601 Receiver Unable To Process' },
      intent: 'order',
      subject: { reference: 'Patient/patient-1' },
      medicationCodeableConcept: { text: 'Alinia 500 mg tablet' },
      identifier: [{ system: 'https://scriptsure.com/message-id', value: 'old-message' }],
      extension: [{ url: 'https://scriptsure.com/iframe-url', valueUrl: 'https://expired.example/' }],
      eventHistory: [{ reference: 'Provenance/old-event' }],
    });
    const task = await medplum.createResource<Task>({
      ...scriptSureTask,
      id: undefined,
      focus: { reference: `MedicationRequest/${oldRx.id}` },
    });
    const onTaskChange = vi.fn();
    setup(task, onTaskChange, medplum);

    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));

    expect(await screen.findByText('Edit replacement prescription')).toBeInTheDocument();
    const submitReplacement = await screen.findByRole('button', {
      name: 'Submit replacement form for Alinia 500 mg tablet',
    });
    expect(screen.queryByTitle('Review replacement prescription')).not.toBeInTheDocument();

    await user.click(submitReplacement);

    expect(await screen.findByTitle('Review replacement prescription')).toHaveAttribute(
      'src',
      expect.stringContaining('https://scriptsure.example/widgets/prescription/replacement')
    );
    expect(notificationMocks.showErrorNotification).not.toHaveBeenCalled();
    const medicationRequests = await medplum.searchResources('MedicationRequest');
    expect(medicationRequests).toHaveLength(2);
    const replacement = medicationRequests.find((medicationRequest) => medicationRequest.id !== oldRx.id);
    expect(replacement).toMatchObject({
      status: 'draft',
      priorPrescription: { reference: `MedicationRequest/${oldRx.id}` },
      medicationCodeableConcept: oldRx.medicationCodeableConcept,
    });
    expect(replacement?.identifier).toBeUndefined();
    expect(replacement?.extension).toBeUndefined();
    expect(replacement?.eventHistory).toBeUndefined();
    const updatedTask = await medplum.readResource('Task', task.id);
    expect(updatedTask).toMatchObject({
      status: 'in-progress',
      output: [
        expect.objectContaining({
          valueReference: { reference: `MedicationRequest/${replacement?.id}`, display: 'Alinia 500 mg tablet' },
        }),
      ],
    });
    expect(onTaskChange).not.toHaveBeenCalled();
  });

  test('reopens an uncertain replacement draft without clearing its status before submission', async () => {
    const user = userEvent.setup();
    const medplum = new MockClient();
    const replacement = await medplum.createResource<MedicationRequest>({
      resourceType: 'MedicationRequest',
      status: 'unknown',
      statusReason: { text: 'ScriptSure response not received' },
      intent: 'order',
      subject: { reference: 'Patient/patient-1' },
      medicationCodeableConcept: { text: 'Alinia 500 mg tablet' },
    });
    const task = await medplum.createResource<Task>({
      ...scriptSureTask,
      id: undefined,
      output: [
        {
          type: {
            coding: [
              {
                system: SCRIPTSURE_REPLACEMENT_OUTPUT_SYSTEM,
                code: SCRIPTSURE_REPLACEMENT_OUTPUT_CODE,
              },
            ],
          },
          valueReference: { reference: `MedicationRequest/${replacement.id}` },
        },
      ],
    });
    const updateResource = vi.spyOn(medplum, 'updateResource');
    setup(task, vi.fn(), medplum);

    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));

    expect(await screen.findByText('Edit replacement prescription')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Submit replacement form for Alinia 500 mg tablet' })
    ).toBeInTheDocument();
    expect(updateResource).not.toHaveBeenCalled();
    expect(notificationMocks.showErrorNotification).not.toHaveBeenCalled();
  });

  test.each([
    ['Open ScriptSure patient Messages', { ...scriptSureTask, id: undefined }, 'Task must be saved'],
    ['Open ScriptSure patient Messages', scriptSureTask, 'did not return a Messages widget URL'],
    ['Acknowledge error', scriptSureTask, 'Acknowledge failed'],
  ])('reports a failed "%s" action instead of changing the Task', async (buttonName, task, message) => {
    const { medplum, onTaskChange } = setup(task);
    vi.spyOn(medplum, 'executeBot').mockImplementation(async (_identifier, request) =>
      request.action === 'acknowledge' ? Promise.reject(new Error('Acknowledge failed')) : { task: scriptSureTask }
    );

    await userEvent.setup().click(screen.getByRole('button', { name: buttonName }));

    await waitFor(() => expect(showErrorNotification).toHaveBeenCalled());
    expect(showErrorNotification.mock.calls[0][0].message).toContain(message);
    expect(onTaskChange).not.toHaveBeenCalled();
    expect(screen.queryByTitle('ScriptSure patient Messages')).not.toBeInTheDocument();
  });

  test('links to the bare MedicationRequest route and reports a failed reconcile after the Messages widget closes', async () => {
    const user = userEvent.setup();
    const { medplum } = setup({ ...scriptSureTask, for: undefined });
    const executeBot = vi
      .spyOn(medplum, 'executeBot')
      .mockImplementation(async (_identifier, request) =>
        request.action === 'launch'
          ? { task: scriptSureTask, launchUrl: 'https://scriptsure.example/widgets/message/patient-1' }
          : Promise.reject(new Error('Reconcile failed'))
      );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/MedicationRequest/rx-1');
    await user.click(screen.getByRole('button', { name: 'Open ScriptSure patient Messages' }));
    expect(await screen.findByTitle('ScriptSure patient Messages')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(showErrorNotification).toHaveBeenCalled());
    expect(showErrorNotification.mock.calls[0][0].message).toBe('Reconcile failed');
    expect(executeBot.mock.calls.map(([, request]) => request.action)).toEqual(['launch', 'reconcile']);
  });

  test('reconciles immediately when the recorded replacement is already active', async () => {
    const { medplum, task, onTaskChange } = await setupWithReplacement('active');
    const reconciledTask = { ...task, status: 'completed' as const };
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({ task: reconciledTask });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Re-prescribe' }));

    await waitFor(() => expect(onTaskChange).toHaveBeenCalledWith(reconciledTask));
    expect(executeBot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'reconcile' }));
    expect(screen.queryByText('Edit replacement prescription')).not.toBeInTheDocument();
    expect(showErrorNotification).not.toHaveBeenCalled();
  });

  test('refuses to edit a replacement that is no longer a draft', async () => {
    const { medplum, onTaskChange } = await setupWithReplacement('on-hold');
    const executeBot = vi.spyOn(medplum, 'executeBot');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Re-prescribe' }));

    await waitFor(() => expect(showErrorNotification).toHaveBeenCalled());
    expect(showErrorNotification.mock.calls[0][0].message).toBe(
      'Replacement MedicationRequest is not editable in status on-hold'
    );
    expect(executeBot).not.toHaveBeenCalled();
    expect(onTaskChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Edit replacement prescription')).not.toBeInTheDocument();
  });

  test('reconciles the Task once the replacement prescription syncs back from ScriptSure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { medplum, replacement, task, onTaskChange } = await setupWithReplacement('draft');
    const reconciledTask = { ...task, status: 'completed' as const };
    const executeBot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({ task: reconciledTask });
    const readResource = vi.spyOn(medplum, 'readResource');

    await user.click(screen.getByRole('button', { name: 'Re-prescribe' }));
    await user.click(await screen.findByRole('button', { name: 'Submit replacement form for Alinia 500 mg tablet' }));
    expect(await screen.findByTitle('Review replacement prescription')).toBeInTheDocument();

    await waitFor(() =>
      expect(readResource).toHaveBeenCalledWith('MedicationRequest', replacement.id, expect.anything())
    );
    await medplum.updateResource<MedicationRequest>({ ...replacement, status: 'active' });
    await act(async () => vi.advanceTimersByTime(DEFAULT_POLL_MS + 100));

    await waitFor(() => expect(onTaskChange).toHaveBeenCalledWith(reconciledTask));
    expect(executeBot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'reconcile' }));
    await waitFor(() => expect(screen.queryByTitle('Review replacement prescription')).not.toBeInTheDocument());
    expect(showErrorNotification).not.toHaveBeenCalled();
  });
});
