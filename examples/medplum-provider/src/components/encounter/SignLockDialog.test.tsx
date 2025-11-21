// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SignLockDialog } from './SignLockDialog';
import { showErrorNotification } from '../../utils/notifications';

vi.mock('../../utils/notifications');

describe('SignLockDialog', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    await medplum.createResource(DrAliceSmith);
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof SignLockDialog>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <SignLockDialog onSign={vi.fn()} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  it('renders sign and lock button', () => {
    setup();

    expect(screen.getByText('Sign & Lock Note')).toBeInTheDocument();
  });

  it('renders just sign button', () => {
    setup();

    expect(screen.getByText('Just Sign')).toBeInTheDocument();
  });

  it('displays practitioner information', async () => {
    await act(async () => {
      setup();
    });

    await waitFor(() => {
      expect(screen.getByText(/Alice Smith/i)).toBeInTheDocument();
    });
  });

  it('calls onSign with lock=true when sign and lock is clicked', async () => {
    const user = userEvent.setup();
    const onSign = vi.fn();
    await act(async () => {
      setup({ onSign });
    });

    await waitFor(() => {
      expect(screen.getByText('Sign & Lock Note')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sign & Lock Note'));

    await waitFor(() => {
      expect(onSign).toHaveBeenCalled();
      const call = onSign.mock.calls[0];
      expect(call[1]).toBe(true);
    });
  });

  it('calls onSign with lock=false when just sign is clicked', async () => {
    const user = userEvent.setup();
    const onSign = vi.fn();
    await act(async () => {
      setup({ onSign });
    });

    await waitFor(() => {
      expect(screen.getByText('Just Sign')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Just Sign'));

    await waitFor(() => {
      expect(onSign).toHaveBeenCalled();
      const call = onSign.mock.calls[0];
      expect(call[1]).toBe(false);
    });
  });

  it('shows error notification when no author is found', async () => {
    const user = userEvent.setup();
    const onSign = vi.fn();
    const medplumWithoutProfile = new MockClient({ profile: null });

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplumWithoutProfile}>
          <MantineProvider>
            <SignLockDialog onSign={onSign} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Sign & Lock Note')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sign & Lock Note'));

    await waitFor(() => {
      expect(showErrorNotification).toHaveBeenCalledWith('No author information found');
    });

    expect(onSign).not.toHaveBeenCalled();
  });
});

