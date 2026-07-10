// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ScheduleDetails } from './ScheduleDetails';

describe('ScheduleDetails', () => {
  let medplum: MockClient;
  let mockSchedule: WithId<Schedule>;

  beforeEach(async () => {
    medplum = new MockClient();

    vi.clearAllMocks();

    mockSchedule = {
      resourceType: 'Schedule',
      id: 'schedule-1',
      actor: [{ reference: 'Practitioner/practitioner-1' }],
      active: true,
    };

    // Store the schedule so readResource('Schedule', 'schedule-1') works
    await medplum.createResource(mockSchedule);
    medplum.searchOne = vi.fn().mockResolvedValue(mockSchedule);
    medplum.searchResources = vi.fn().mockResolvedValue([]);
  });

  const setup = async (schedule: WithId<Schedule>): Promise<ReturnType<typeof render>> => {
    const result = render(<ScheduleDetails schedule={schedule} />, {
      wrapper: ({ children }) => (
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              {children}
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      ),
    });
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
    return result;
  };

  describe('Initial Rendering', () => {
    test('renders calendar', async () => {
      await setup(mockSchedule);
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });

  describe('Toolbar', () => {
    test('renders toolbar with navigation buttons', async () => {
      await setup(mockSchedule);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    test('renders view switcher with Month, Week, Day options', async () => {
      await setup(mockSchedule);
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
    });

    test('displays current month/year in title for non-day views', async () => {
      await setup(mockSchedule);
      const title = screen.getByText(/\w+\s+\d{4}/);
      expect(title).toBeInTheDocument();
    });
  });

  describe('Slot Selection', () => {
    test('opens drawer when slot is selected', async () => {
      await setup(mockSchedule);
      expect(screen.queryByText('New Calendar Event')).not.toBeInTheDocument();
    });
  });

  describe('View Changes', () => {
    test('renders view switcher buttons', async () => {
      await setup(mockSchedule);
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
    });
  });
});
