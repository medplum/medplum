// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { Communication } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { render, screen, waitFor } from '../../test-utils/render';
import { EditTopicDialog } from './EditTopicDialog';

const mockOnClose = vi.fn();
const mockOnSaved = vi.fn();

const baseThread: Communication = {
  resourceType: 'Communication',
  id: 'thread-1',
  status: 'in-progress',
  subject: { reference: 'Patient/123' },
  recipient: [{ reference: 'Patient/123' }, { reference: 'Practitioner/123' }],
  topic: { text: 'Original topic' },
};

describe('EditTopicDialog', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (thread: Communication = baseThread): void => {
    render(
      <>
        <Notifications />
        <EditTopicDialog thread={thread} opened={true} onClose={mockOnClose} onSaved={mockOnSaved} />
      </>,
      ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      )
    );
  };

  test('renders all fields once references resolve', async () => {
    setup();
    expect(screen.getByText('Message Settings')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Practitioner')).toBeInTheDocument());
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.getByText('Topic (optional)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Original topic')).toBeInTheDocument();
  });

  test('omits the patient field for a practitioner-only thread', async () => {
    setup({ ...baseThread, subject: undefined, recipient: [{ reference: 'Practitioner/123' }] });
    await waitFor(() => expect(screen.getByText('Practitioner')).toBeInTheDocument());
    expect(screen.queryByText('Patient')).not.toBeInTheDocument();
  });

  test('saves the edited topic while preserving the patient recipient', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    setup();

    await waitFor(() => expect(screen.getByText('Practitioner')).toBeInTheDocument());

    const topicInput = screen.getByDisplayValue('Original topic');
    await user.clear(topicInput);
    await user.type(topicInput, 'Updated topic');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const saved = updateSpy.mock.calls[0][0] as Communication;
    expect(saved.topic?.text).toBe('Updated topic');
    // The patient subject recipient is preserved alongside the practitioner.
    expect(saved.recipient).toContainEqual({ reference: 'Patient/123' });
    expect(saved.recipient).toContainEqual({ reference: 'Practitioner/123' });
    expect(mockOnSaved).toHaveBeenCalled();
  });

  test('disables save when there are no practitioners', async () => {
    setup({ ...baseThread, recipient: [{ reference: 'Patient/123' }], sender: undefined });
    await waitFor(() => expect(screen.getByText('Practitioner')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('falls back to the sender practitioner when no practitioner recipient exists', async () => {
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    setup({
      ...baseThread,
      recipient: [{ reference: 'Patient/123' }],
      sender: { reference: 'Practitioner/123' },
    });

    // The sender practitioner is surfaced, so the field is populated and Save is enabled.
    await waitFor(() => expect(screen.getByText('Practitioner')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const saved = updateSpy.mock.calls[0][0] as Communication;
    // Saving migrates the sender practitioner into the recipient list.
    expect(saved.recipient).toContainEqual({ reference: 'Practitioner/123' });
  });

  test('shows an error notification when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Save failed'));
    setup();

    await waitFor(() => expect(screen.getByText('Practitioner')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/Save failed/i)).toBeInTheDocument());
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  test('omits the patient field when the patient reference fails to resolve', async () => {
    // The patient read rejects, but practitioner reads still succeed — the form renders
    // without the patient field rather than blanking entirely.
    vi.spyOn(medplum, 'readReference').mockImplementation(async (ref) => {
      if (ref.reference?.startsWith('Patient/')) {
        throw new Error('not found');
      }
      return DrAliceSmith;
    });
    setup();

    await waitFor(() => expect(screen.getByText('Practitioner')).toBeInTheDocument());
    expect(screen.queryByText('Patient')).not.toBeInTheDocument();
  });
});
