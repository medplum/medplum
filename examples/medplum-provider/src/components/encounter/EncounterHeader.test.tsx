// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Encounter, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ChartNoteStatus } from '../../types/encounter';
import { EncounterHeader } from './EncounterHeader';

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
  period: {
    start: '2024-01-01T10:00:00Z',
  },
  subject: { reference: 'Patient/patient-123' },
};

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr.'], family: 'Test' }],
};

describe('EncounterHeader', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
  });

  const setup = (props: Partial<Parameters<typeof EncounterHeader>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <EncounterHeader encounter={mockEncounter} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders encounter title and details', () => {
    setup({ practitioner: mockPractitioner });

    expect(screen.getByText('Visit')).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Test/)).toBeInTheDocument();
  });

  test('displays status button', () => {
    setup();

    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  test('shows status menu for active encounters', async () => {
    const user = userEvent.setup();
    setup();

    const statusButton = screen.getByText('In Progress');
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByText('Finished')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  test('calls onStatusChange when status is changed', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    setup({ onStatusChange });

    const statusButton = screen.getByText('In Progress');
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByText('Finished')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Finished'));

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('finished');
    });
  });

  test('shows confirmation modal when cancelling encounter', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    setup({ onStatusChange });

    const statusButton = screen.getByText('In Progress');
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancelled'));

    await waitFor(() => {
      expect(screen.getByText('Are you sure you want to cancel this encounter?')).toBeInTheDocument();
    });
  });

  test('confirms cancellation when user clicks yes', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    setup({ onStatusChange });

    const statusButton = screen.getByText('In Progress');
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancelled'));

    await waitFor(() => {
      expect(screen.getByText('Yes, cancel it')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Yes, cancel it'));

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('cancelled');
    });
  });

  test('cancels cancellation when user clicks no', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    setup({ onStatusChange });

    const statusButton = screen.getByText('In Progress');
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancelled'));

    await waitFor(() => {
      expect(screen.getByText('No, keep it')).toBeInTheDocument();
    });

    await user.click(screen.getByText('No, keep it'));

    await waitFor(() => {
      expect(screen.queryByText('Are you sure you want to cancel this encounter?')).not.toBeInTheDocument();
    });

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  test('calls onTabChange when tab is changed', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    setup({ onTabChange });

    const detailsTab = screen.getByText('Details & Billing');
    await user.click(detailsTab);

    await waitFor(() => {
      expect(onTabChange).toHaveBeenCalledWith('details');
    });
  });

  test('shows sign button for finished unsigned encounters', () => {
    const finishedEncounter: Encounter = {
      ...mockEncounter,
      status: 'finished',
    };
    const { container } = setup({ encounter: finishedEncounter, chartNoteStatus: ChartNoteStatus.Unsigned });

    const signButtons = container.querySelectorAll('button');
    expect(signButtons.length).toBeGreaterThan(0);
  });

  test('opens sign dialog when sign button is clicked', async () => {
    const user = userEvent.setup();
    const finishedEncounter: Encounter = {
      ...mockEncounter,
      status: 'finished',
    };
    setup({ encounter: finishedEncounter, chartNoteStatus: ChartNoteStatus.Unsigned });

    const signButtons = screen.getAllByRole('button');
    const signButton = signButtons.find((btn) => btn.querySelector('svg'));
    if (signButton) {
      await user.click(signButton);
    }

    await waitFor(() => {
      expect(screen.getByText('Signing As')).toBeInTheDocument();
    });
  });

  test('calls onSign when signing', async () => {
    const user = userEvent.setup();
    const onSign = vi.fn();
    const finishedEncounter: Encounter = {
      ...mockEncounter,
      status: 'finished',
    };
    setup({ encounter: finishedEncounter, chartNoteStatus: ChartNoteStatus.Unsigned, onSign });

    const signButtons = screen.getAllByRole('button');
    const signButton = signButtons.find((btn) => btn.querySelector('svg'));
    if (signButton) {
      await user.click(signButton);
    }

    await waitFor(() => {
      expect(screen.getByText('Just Sign')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Just Sign'));

    await waitFor(() => {
      expect(onSign).toHaveBeenCalled();
    });
  });

  test('does not show sign button for cancelled encounters', () => {
    const cancelledEncounter: Encounter = {
      ...mockEncounter,
      status: 'cancelled',
    };
    setup({ encounter: cancelledEncounter });

    const signButtons = screen.queryAllByRole('button');
    const hasSignIcon = signButtons.some((btn) => btn.querySelector('svg[data-icon="lock"]'));
    expect(hasSignIcon).toBe(false);
  });

  test('displays correct status for finished encounters', () => {
    setup({ encounter: { ...mockEncounter, status: 'finished' } });
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  test('displays correct status for cancelled encounters', () => {
    setup({ encounter: { ...mockEncounter, status: 'cancelled' } });
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  test('renders with practitioner name', () => {
    setup({ practitioner: mockPractitioner });

    expect(screen.getByText(/Dr\. Test/)).toBeInTheDocument();
  });

  test('renders with unknown provider when practitioner is not provided', () => {
    setup({ practitioner: undefined });

    expect(screen.getByText(/Unknown Provider/)).toBeInTheDocument();
  });
});
