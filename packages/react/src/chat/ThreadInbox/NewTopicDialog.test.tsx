// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import type { Communication, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test-utils/render';
import { NewTopicDialog } from './NewTopicDialog';

const mockOnSubmit = vi.fn();
const mockOnClose = vi.fn();

describe('NewTopicDialog', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (opened = true, subject?: Patient, allowPatientSelection?: boolean): void => {
    render(
      <>
        <Notifications />
        <NewTopicDialog
          opened={opened}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          subject={subject}
          allowPatientSelection={allowPatientSelection}
        />
      </>,
      ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
    );
  };

  test('renders modal when opened', () => {
    setup(true);
    expect(screen.getByText('New Message')).toBeInTheDocument();
  });

  test('does not render modal when closed', () => {
    setup(false);
    expect(screen.queryByText('New Message')).not.toBeInTheDocument();
  });

  test('shows disabled patient field by default (allowPatientSelection=false)', () => {
    setup(true);
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.queryByText('Select a patient')).not.toBeInTheDocument();
  });

  test('shows enabled patient field with hint when allowPatientSelection is true', () => {
    setup(true, undefined, true);
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.getByText('Select a patient')).toBeInTheDocument();
  });

  test('shows disabled patient field without hint when allowPatientSelection is false', () => {
    setup(true, undefined, false);
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.queryByText('Select a patient')).not.toBeInTheDocument();
  });

  test('displays practitioner input field', () => {
    setup(true);
    expect(screen.getByText('Practitioner')).toBeInTheDocument();
  });

  test('displays topic input field', () => {
    setup(true);
    expect(screen.getByText('Topic (optional)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your topic')).toBeInTheDocument();
  });

  test('displays submit button', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  test('disables submit until a patient is selected when search is enabled', () => {
    setup(true, undefined, true);

    // With no patient chosen, the patient is required, so Next is disabled
    // and cannot be submitted.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  test('creates a communication and calls onSubmit when a patient is provided', async () => {
    const user = userEvent.setup();
    const patient: Patient = { resourceType: 'Patient', id: '123' };
    const createSpy = vi.spyOn(medplum, 'createResource');
    // Subject pre-fills the patient; the signed-in Practitioner profile defaults a practitioner,
    // so Next is enabled and submit runs the full creation path.
    setup(true, patient);

    const submitButton = screen.getByRole('button', { name: 'Next' });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const created = createSpy.mock.calls[0][0] as Communication;
    expect(created.resourceType).toBe('Communication');
    expect(created.subject).toEqual({ reference: 'Patient/123' });
    expect(created.recipient).toContainEqual({ reference: 'Patient/123' });
    expect(mockOnSubmit).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('shows an error notification when creation fails', async () => {
    const user = userEvent.setup();
    const patient: Patient = { resourceType: 'Patient', id: '123' };
    vi.spyOn(medplum, 'createResource').mockRejectedValue(new Error('Create failed'));
    setup(true, patient);

    const submitButton = screen.getByRole('button', { name: 'Next' });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await waitFor(() => expect(screen.getByText(/Create failed/i)).toBeInTheDocument());
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  test('calls onClose when modal is closed', async () => {
    const user = userEvent.setup();
    setup(true);

    const closeButton = document.querySelector('.mantine-Modal-close');
    expect(closeButton).toBeInTheDocument();

    if (closeButton) {
      await user.click(closeButton);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });
});
