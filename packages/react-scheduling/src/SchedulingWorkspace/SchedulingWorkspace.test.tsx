// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { SchedulingParametersURI, ServiceTypeReferenceURI } from '@medplum/core';
import type { HealthcareService, Location, Resource, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { SinonFakeTimers } from 'sinon';
import { useFakeTimers } from 'sinon';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CalendarWeekFixtures, SchedulingFixtures } from '../stories/scheduling';
import { renderWithMedplum, screen, userEvent, waitFor, within } from '../test-utils/render';
import { SchedulingWorkspace } from './SchedulingWorkspace';

async function setupClient(resources: readonly Resource[] = SchedulingFixtures): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of resources) {
    await medplum.createResource(resource);
  }
  return medplum;
}

describe('SchedulingWorkspace', () => {
  test('deselecting a provider marks its row inactive', async () => {
    const medplum = await setupClient();
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
    const providerRow = screen.getByText('Dr. Maya Rivera').closest('button') as HTMLElement;
    expect(providerRow).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(providerRow);

    expect(providerRow).toHaveAttribute('aria-pressed', 'false');
  });

  test('deselecting a device marks its row inactive', async () => {
    const medplum = await setupClient();
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument());
    const deviceRow = screen.getByText('Ultrasound 1 (Main Campus)').closest('button') as HTMLElement;
    expect(deviceRow).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(deviceRow);

    expect(deviceRow).toHaveAttribute('aria-pressed', 'false');
  });

  test('deselecting a room marks its row inactive', async () => {
    const medplum = await setupClient();
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('Exam Room A')).toBeInTheDocument());
    const roomRow = screen.getByText('Exam Room A').closest('button') as HTMLElement;
    expect(roomRow).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(roomRow);

    expect(roomRow).toHaveAttribute('aria-pressed', 'false');
  });

  test('shows the empty state for sections with no schedules', async () => {
    // A fresh MockClient always seeds its own default provider (Dr. Alice Smith)
    // and its Schedule, but no devices or rooms, so those two sections stay empty
    // without needing any scheduling fixtures.
    const medplum = await setupClient([]);
    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => expect(screen.getByText('No devices found')).toBeInTheDocument());
    expect(screen.getByText('No rooms found')).toBeInTheDocument();
  });

  test('shows an alert when the candidate search fails', async () => {
    const medplum = await setupClient();
    vi.spyOn(medplum, 'search').mockRejectedValue(new Error('Schedule search failed'));

    renderWithMedplum(<SchedulingWorkspace />, medplum);

    await waitFor(() => {
      expect(within(screen.getByRole('alert')).getByText('Schedule search failed')).toBeInTheDocument();
    });
  });

  describe('with CalendarWeekFixtures', () => {
    let clock: SinonFakeTimers | undefined;

    afterEach(() => {
      clock?.restore();
      clock = undefined;
    });

    test(`shows the fixtures' booked appointments and free/blocked slots on the pinned "today"`, async () => {
      // The same frozen "today" Storybook's `MockDateWrapper` uses, so `timeGridWeek`
      // renders the same Sun May 3 – Sat May 9 2020 week the fixtures are dated within.
      clock = useFakeTimers({ now: new Date(2020, 4, 4, 12, 5), shouldAdvanceTime: false, toFake: ['Date'] });

      const medplum = await setupClient([...SchedulingFixtures, ...CalendarWeekFixtures]);
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());

      // The calendar's own Slot/Appointment fetch only starts once it reports its visible
      // range and the selected providers/devices/rooms resolve to Schedules, so this
      // settles a little after the sidebar's provider list does. FullCalendar renders
      // each event's title more than once internally, so these use `getAllByText`
      // rather than asserting on a single match.
      await waitFor(() => expect(screen.getAllByText('Miles Cooper').length).toBeGreaterThan(0));
      expect(screen.getAllByText('Renee Alvarez').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Available').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    });

    test('a source only shows appointments booked on its own schedule', async () => {
      clock = useFakeTimers({ now: new Date(2020, 4, 4, 12, 5), shouldAdvanceTime: false, toFake: ['Date'] });

      const medplum = await setupClient([...SchedulingFixtures, ...CalendarWeekFixtures]);
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getAllByText('Miles Cooper').length).toBeGreaterThan(0));
      const milesCountBefore = screen.getAllByText('Miles Cooper').length;

      // Dr. Okafor's schedule is not one of Miles Cooper's participants (that
      // appointment is Dr. Rivera's), so deselecting it must leave the Miles Cooper
      // count exactly unchanged. If sources ever stopped filtering by their own
      // schedule's actor — e.g. handing every source every appointment — removing
      // Okafor's source would *also* drop a Miles Cooper copy, since that source
      // would incorrectly be carrying one. An unrelated toggle changing an
      // unrelated appointment's count is exactly the bug this guards against.
      await userEvent.click(screen.getByText('Dr. Tunde Okafor').closest('button') as HTMLElement);
      await waitFor(() => expect(screen.getAllByText('Renee Alvarez').length).toBeGreaterThan(0));
      expect(screen.getAllByText('Miles Cooper').length).toBe(milesCountBefore);

      // Deselecting every schedule actually tied to Miles Cooper's appointment
      // (provider, device, and room) must clear it entirely, while the still
      // partly-selected Okafor/Renee appointment (device + room still selected)
      // stays visible.
      for (const label of ['Dr. Maya Rivera', 'Ultrasound 1 (Main Campus)', 'Exam Room A']) {
        await userEvent.click(screen.getByText(label).closest('button') as HTMLElement);
      }

      await waitFor(() => expect(screen.queryByText('Miles Cooper')).not.toBeInTheDocument());
      expect(screen.getAllByText('Renee Alvarez').length).toBeGreaterThan(0);
    });
  });

  describe('saying which clock the calendar is drawn on', () => {
    test('warns when a calendar is scheduled somewhere other than the viewer', async () => {
      // The fixtures' providers are scheduled in Eastern and Central time and the runner is not,
      // which is the situation the notice exists for: the grid above it is drawn on the runner's clock.
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      const notice = await screen.findByTestId('calendar-timezone-notice');
      expect(notice).toHaveTextContent('Calendar shown in your local time');
    });

    test('stops warning once every calendar kept elsewhere is deselected', async () => {
      const medplum = await setupClient();
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await screen.findByTestId('calendar-timezone-notice');
      await waitFor(() => expect(screen.getByText('Dr. Maya Rivera')).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText('Dr. Tunde Okafor')).toBeInTheDocument());

      // Deselecting just the two providers isn't enough: every device and room schedule
      // also names exactly one service (ultrasound-imaging), so each resolves that
      // service's Eastern timezone even though its actor (a Device or Location) carries
      // none of its own.
      for (const label of ['Dr. Maya Rivera', 'Dr. Tunde Okafor']) {
        await userEvent.click(screen.getByText(label).closest('button') as HTMLElement);
      }
      await waitFor(() => expect(screen.getByTestId('calendar-timezone-notice')).toBeInTheDocument());

      for (const label of [
        'Ultrasound 1 (Main Campus)',
        'Ultrasound 2 (Main Campus)',
        'Exam Room A',
        'Exam Room B',
        'Satellite Exam Room',
      ]) {
        await userEvent.click(screen.getByText(label).closest('button') as HTMLElement);
      }

      // Nothing left on the grid is drawn on another clock, so there is nothing to warn about.
      await waitFor(() => expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull());
    });

    function buildTimezoneService(id: string, timezone: string): WithId<HealthcareService> {
      return {
        resourceType: 'HealthcareService',
        id,
        name: id,
        extension: [{ url: SchedulingParametersURI, extension: [{ url: 'timezone', valueCode: timezone }] }],
      };
    }

    // A Location actor carrying no timezone extension of its own, on a Schedule naming the
    // given services through `serviceType`.
    function buildRoomWithServices(services: readonly WithId<HealthcareService>[]): {
      room: WithId<Location>;
      schedule: WithId<Schedule>;
    } {
      const room: WithId<Location> = { resourceType: 'Location', id: 'test-room', name: 'Test Room' };
      const schedule: WithId<Schedule> = {
        resourceType: 'Schedule',
        id: 'test-room-schedule',
        active: true,
        actor: [{ reference: 'Location/test-room', display: 'Test Room' }],
        serviceType: services.map((service) => ({
          coding: [{ system: 'http://example.org/appointment-types', code: service.id }],
          extension: [
            { url: ServiceTypeReferenceURI, valueReference: { reference: `HealthcareService/${service.id}` } },
          ],
        })),
      };
      return { room, schedule };
    }

    test('falls back to the service timezone when its actor has none and its schedule names exactly one service', async () => {
      const service = buildTimezoneService('denver-service', 'America/Denver');
      const { room, schedule } = buildRoomWithServices([service]);
      const medplum = await setupClient([service, room, schedule]);
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Test Room')).toBeInTheDocument());

      // Test Room's Location actor carries no timezone of its own, so this notice can only
      // come from resolving the one service its schedule names.
      const notice = await screen.findByTestId('calendar-timezone-notice');
      expect(notice).toHaveTextContent('Calendar shown in your local time');
    });

    test('does not guess a timezone when a schedule names more than one service', async () => {
      const services = [
        buildTimezoneService('denver-service', 'America/Denver'),
        buildTimezoneService('phoenix-service', 'America/Phoenix'),
      ];
      const { room, schedule } = buildRoomWithServices(services);
      const medplum = await setupClient([...services, room, schedule]);
      renderWithMedplum(<SchedulingWorkspace />, medplum);

      await waitFor(() => expect(screen.getByText('Test Room')).toBeInTheDocument());

      // Ambiguous between two services, and its actor carries no timezone of its own, so
      // nothing contributes a zone and there is nothing to warn about.
      await waitFor(() => expect(screen.queryByTestId('calendar-timezone-notice')).toBeNull());
    });
  });
});
