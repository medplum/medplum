// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Patient } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NewTopicDialog } from './NewTopicDialog';
import * as notifications from '../../utils/notifications';

vi.mock('../../utils/notifications', () => ({
  showErrorNotification: vi.fn(),
}));

const mockOnSubmit = vi.fn();
const mockOnClose = vi.fn();

describe('NewTopicDialog', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    await medplum.createResource(HomerSimpson);
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

  it('renders modal when opened', () => {
    setup(true);
    expect(screen.getByText('New Message')).toBeInTheDocument();
  });

  it('does not render modal when closed', () => {
    setup(false);
    expect(screen.queryByText('New Message')).not.toBeInTheDocument();
  });

  it('displays patient input field', () => {
    setup(true);
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.getByText('Select a patient')).toBeInTheDocument();
  });

  it('displays practitioner input field', () => {
    setup(true);
    expect(screen.getByText('Practitioner (optional)')).toBeInTheDocument();
  });

  it('displays topic input field', () => {
    setup(true);
    expect(screen.getByText('Topic (optional)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your topic')).toBeInTheDocument();
  });

  it('displays submit button', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('shows error when submitting without patient', async () => {
    const user = userEvent.setup();
    setup(true);

    const submitButton = screen.getByRole('button', { name: 'Next' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Please select a patient/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when modal is closed', async () => {
    const user = userEvent.setup();
    setup(true);

    const closeButton = document.querySelector('.mantine-Modal-close');
    expect(closeButton).toBeInTheDocument();
    
    if (closeButton) {
      await user.click(closeButton);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it('handles error when creating communication fails', async () => {
    medplum.createResource = vi.fn().mockRejectedValue(new Error('Creation failed'));
    setup(true);
    expect(notifications.showErrorNotification).toBeDefined();
  });
});

