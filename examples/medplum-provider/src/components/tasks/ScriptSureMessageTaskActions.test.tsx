// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { MedicationRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { ScriptSureMessageTaskActions } from './ScriptSureMessageTaskActions';

const notificationMocks = vi.hoisted(() => ({ showErrorNotification: vi.fn() }));
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

describe('ScriptSureMessageTaskActions', () => {
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
});
