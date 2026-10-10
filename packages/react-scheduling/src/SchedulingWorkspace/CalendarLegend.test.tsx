// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, ServiceTypeReferenceURI } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { renderWithMedplum, screen, userEvent, within } from '../test-utils/render';
import { CalendarLegend } from './CalendarLegend';

describe('CalendarLegend', () => {
  test('opens on hover, focus or a tap, and keys the service types apart from the calendars', async () => {
    const medplum = new MockClient();
    const service = await medplum.createResource({ resourceType: 'HealthcareService', name: 'Ultrasound Imaging' });
    const reference = getReferenceString(service);
    const appointment: Appointment = { resourceType: 'Appointment', status: 'booked', participant: [] };
    renderWithMedplum(
      <CalendarLegend
        serviceTypes={[
          {
            id: reference,
            appointment: {
              ...appointment,
              // Stale: the legend names the service type as its HealthcareService is named now.
              serviceType: [
                { text: 'Imaging', extension: [{ url: ServiceTypeReferenceURI, valueReference: { reference } }] },
              ],
            },
            color: 'teal',
          },
          { id: 'none', appointment, color: 'gray' },
        ]}
      />,
      medplum
    );
    const trigger = screen.getByRole('button', { name: 'Legend' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.hover(trigger);
    const legend = within(await screen.findByRole('dialog'));
    expect(await legend.findByText('Ultrasound Imaging')).toBeInTheDocument();
    expect(legend.getByText('No service type')).toBeInTheDocument();
    // Blocked time is keyed beside them, in the gray every calendar's is drawn in.
    expect(legend.getByText('Blocked time')).toBeInTheDocument();
    await userEvent.unhover(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // A keyboard reaches it by focus, and Escape puts it away.
    await userEvent.tab();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // A tap lands as a click, with no hover to leave.
    await userEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
