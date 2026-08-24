// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Appointment, Slot } from '@medplum/fhirtypes';
import { DrAliceSmith, DrAliceSmithSchedule } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { render, screen } from '../test-utils/render';
import type { MultiCalendarSource } from './MultiCalendar';
import { MultiCalendar } from './MultiCalendar';

describe('MultiCalendar', () => {
  // Use today's date to ensure appointments show in visible range
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);

  // This is a thin wrapper around CalendarBase, so we just test the happy path here.
  test('rendering', () => {
    const appointments: Appointment[] = [
      {
        resourceType: 'Appointment',
        id: 'test-appointment-1',
        status: 'booked',
        start: new Date(baseDate.getTime()).toISOString(),
        end: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
        participant: [
          {
            actor: {
              reference: 'Patient/123',
              display: 'John Doe',
            },
            status: 'accepted',
          },
          {
            actor: createReference(DrAliceSmith),
            status: 'accepted',
          },
        ],
      },
      {
        resourceType: 'Appointment',
        id: 'test-appointment-2',
        status: 'checked-in',
        start: new Date(baseDate.getTime() + 90 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 120 * 60 * 1000).toISOString(),
        participant: [
          {
            actor: {
              reference: 'Patient/124',
              display: 'Jane Williams',
            },
            status: 'accepted',
          },
          {
            actor: createReference(DrAliceSmith),
            status: 'accepted',
          },
        ],
      },
    ];

    const slots: Slot[] = [
      {
        resourceType: 'Slot',
        id: 'test-slot-1',
        status: 'free',
        schedule: createReference(DrAliceSmithSchedule),
        start: new Date(baseDate.getTime() - 90 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime()).toISOString(),
      },
      {
        resourceType: 'Slot',
        id: 'test-slot-2',
        status: 'busy-unavailable',
        schedule: createReference(DrAliceSmithSchedule),
        start: new Date(baseDate.getTime() + 30 * 60 * 1000).toISOString(),
        end: new Date(baseDate.getTime() + 40 * 60 * 1000).toISOString(),
      },
    ];

    const sources: MultiCalendarSource[] = [{ appointments, slots }];
    render(<MultiCalendar sources={sources} />);
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Williams/)).toBeInTheDocument();
    expect(screen.getByText(/Available/)).toBeInTheDocument();
    expect(screen.getByText(/Blocked/)).toBeInTheDocument();
  });
});
