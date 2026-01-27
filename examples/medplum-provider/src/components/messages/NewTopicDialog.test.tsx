// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { NewTopicDialog } from './NewTopicDialog';

const mockOnSubmit = vi.fn();
const mockOnClose = vi.fn();

describe('NewTopicDialog', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (opened = true, subject?: Patient): void => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <NewTopicDialog opened={opened} onClose={mockOnClose} onSubmit={mockOnSubmit} subject={subject} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
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

  test('displays patient input field', () => {
    setup(true);
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.getByText('Select a patient')).toBeInTheDocument();
  });

  test('displays practitioner input field', () => {
    setup(true);
    expect(screen.getByText('Practitioner (optional)')).toBeInTheDocument();
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

  test('shows error when submitting without patient', async () => {
    const user = userEvent.setup();
    setup(true);

    const submitButton = screen.getByRole('button', { name: 'Next' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Please select a patient/i)).toBeInTheDocument();
    });
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
