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

  test('Handles history sync error', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const error = new Error('History sync failed');
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(error);

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Sync History')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync History');
    await user.click(syncButton);

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalled();
      expect(screen.getByText(/History sync failed/i)).toBeInTheDocument();
    });
  });

  test('Handles patient sync error', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const error = new Error('Patient sync failed');
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(error);

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Sync Patient')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Patient');
    await user.click(syncButton);

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalled();
    });

    // Error notification should appear - use getAllByText for multiple matches
    await waitFor(() => {
      const errorTexts = screen.getAllByText(/error/i);
      expect(errorTexts.length).toBeGreaterThan(0);
    });
  });

  test('Can change prescription start date', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Prescriptions Sync')).toBeInTheDocument();
    });

    const startDateInputs = screen.getAllByLabelText('Start Date');
    const prescriptionStartInput = startDateInputs[0];

    await user.clear(prescriptionStartInput);
    await user.type(prescriptionStartInput, '2024-01-01');

    expect(prescriptionStartInput).toHaveValue('2024-01-01');
  });

  test('Can change prescription end date', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Prescriptions Sync')).toBeInTheDocument();
    });

    const endDateInputs = screen.getAllByLabelText('End Date');
    const prescriptionEndInput = endDateInputs[0];

    await user.clear(prescriptionEndInput);
    await user.type(prescriptionEndInput, '2024-12-31');

    expect(prescriptionEndInput).toHaveValue('2024-12-31');
  });

  test('Can change history start date', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Medication History Sync')).toBeInTheDocument();
    });

    const startDateInputs = screen.getAllByLabelText('Start Date');
    const historyStartInput = startDateInputs[1];

    await user.clear(historyStartInput);
    await user.type(historyStartInput, '2023-06-01');

    expect(historyStartInput).toHaveValue('2023-06-01');
  });

  test('Can change history end date', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Medication History Sync')).toBeInTheDocument();
    });

    const endDateInputs = screen.getAllByLabelText('End Date');
    const historyEndInput = endDateInputs[1];

    await user.clear(historyEndInput);
    await user.type(historyEndInput, '2023-12-31');

    expect(historyEndInput).toHaveValue('2023-12-31');
  });

  test('Modal can be opened and viewed', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Advanced DoseSpot Options')).toBeInTheDocument();
    });

    // Verify modal content
    expect(screen.getByText('Prescriptions Sync')).toBeInTheDocument();
    expect(screen.getByText('Medication History Sync')).toBeInTheDocument();
    expect(screen.getByText('Patient Information Sync')).toBeInTheDocument();
  });

  test('Prescription sync has date inputs', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Prescriptions Sync')).toBeInTheDocument();
    });

    // Verify date inputs exist for prescriptions sync
    const startDateInputs = screen.getAllByLabelText('Start Date');
    const endDateInputs = screen.getAllByLabelText('End Date');

    expect(startDateInputs.length).toBeGreaterThan(0);
    expect(endDateInputs.length).toBeGreaterThan(0);
  });

  test('Renders description texts for each sync section', async () => {
    const user = userEvent.setup();
    setup('patient-123');

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Fetches recently completed and active prescriptions/i)).toBeInTheDocument();
      expect(screen.getByText(/Retrieves medication history from DoseSpot/i)).toBeInTheDocument();
      expect(screen.getByText(/Syncs patient between Medplum and DoseSpot/i)).toBeInTheDocument();
    });
  });

  test('Sync buttons call executeBot with correct parameters', async () => {
    const user = userEvent.setup();
    setup('test-patient-id');

    vi.spyOn(medplum, 'executeBot').mockResolvedValue({} as any);

    const button = screen.getByText('Advanced Options');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Sync Patient')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Patient');
    await user.click(syncButton);

    await waitFor(() => {
      expect(medplum.executeBot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          patientId: 'test-patient-id',
        })
      );
    });
  });
});
