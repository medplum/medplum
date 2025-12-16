// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { DoseSpotAdvancedOptions } from './DoseSpotAdvancedOptions';

describe('DoseSpotAdvancedOptions', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (patientId: string): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Notifications />
          <DoseSpotAdvancedOptions patientId={patientId} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('Renders Advanced Options button', async () => {
    setup('patient-123');

    await waitFor(() => {
      expect(screen.getByText('Advanced Options')).toBeInTheDocument();
    });
  });

  test('Opens modal when Advanced Options button is clicked', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    await waitFor(() => {
      expect(screen.getByText('Advanced Options')).toBeInTheDocument();
    });

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Advanced DoseSpot Options')).toBeInTheDocument();
    });
  });

  test('Renders all sync sections in modal', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Prescriptions Sync')).toBeInTheDocument();
      expect(screen.getByText('Medication History Sync')).toBeInTheDocument();
      expect(screen.getByText('Patient Information Sync')).toBeInTheDocument();
    });
  });

  test('Sync Prescriptions button calls executeBot', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    vi.spyOn(medplum, 'executeBot').mockResolvedValue({} as any);

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Sync Prescriptions')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Prescriptions');
    await user.click(syncButton);

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalled();
      expect(screen.getByText('Prescriptions synced successfully')).toBeInTheDocument();
    });
  });

  test('Sync History button calls executeBot', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    vi.spyOn(medplum, 'executeBot').mockResolvedValue({} as any);

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Sync History')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync History');
    await user.click(syncButton);

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalled();
      expect(screen.getByText('History synced successfully')).toBeInTheDocument();
    });
  });

  test('Sync Patient button calls executeBot', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    vi.spyOn(medplum, 'executeBot').mockResolvedValue({} as any);

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Sync Patient')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Patient');
    await user.click(syncButton);

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalled();
      expect(screen.getByText('Patient sync success')).toBeInTheDocument();
    });
  });

  test('Handles sync error', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const error = new Error('Sync failed');
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(error);

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Sync Prescriptions')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Prescriptions');
    await user.click(syncButton);

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalled();
      expect(screen.getByText(/sync failed/i)).toBeInTheDocument();
    });
  });

});

