// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getScheduleSchedulingParameters, TimezoneExtensionURI, toServiceTypeCodeableConcepts } from '@medplum/core';
import type { Bundle, HealthcareService, Location, Practitioner, Resource, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { setScheduleAvailability } from '../../availability';
import type { ConfigurableActor, ConfigurableActorResource } from '../../configSearch';
import {
  getScheduleSchedulingParameterValues,
  setHealthcareServiceSchedulingParameterValues,
  setScheduleSchedulingParameterValues,
} from '../../parameterValues';
import { renderWithMedplum, screen, userEvent, waitFor, within } from '../../test-utils/render';
import { ActorPage } from './ActorPage';

const downtown: WithId<Location> = { resourceType: 'Location', id: 'downtown', name: 'Downtown Clinic' };
const room3: WithId<Location> = {
  resourceType: 'Location',
  id: 'room-3',
  name: 'Room 3',
  status: 'active',
  physicalType: { coding: [{ code: 'ro' }] },
  partOf: { reference: 'Location/downtown' },
};

const initialVisit = setHealthcareServiceSchedulingParameterValues(
  {
    resourceType: 'HealthcareService',
    id: 'initial-visit',
    name: 'Initial Visit',
    availableTime: [{ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' }],
  } satisfies WithId<HealthcareService>,
  { duration: 60, timezone: 'America/New_York' }
);
const followUp = setHealthcareServiceSchedulingParameterValues(
  { resourceType: 'HealthcareService', id: 'follow-up', name: 'Follow-up' } satisfies WithId<HealthcareService>,
  { duration: 30, timezone: 'America/New_York' }
);
const services: WithId<HealthcareService>[] = [initialVisit, followUp];

const drSmith: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-smith',
  name: [{ prefix: ['Dr.'], given: ['Jane'], family: 'Smith' }],
};

function makeSchedule(
  actor: string,
  offered: WithId<HealthcareService>[],
  id = `schedule-${actor.split('/')[1]}`
): Schedule {
  return {
    resourceType: 'Schedule',
    id,
    active: true,
    actor: [{ reference: actor }],
    serviceType: offered.flatMap((service) => toServiceTypeCodeableConcepts(service)),
  };
}

interface Setup {
  readonly medplum: MockClient;
  readonly onSynced: ReturnType<typeof vi.fn>;
  readonly schedules: WithId<Schedule>[];
}

async function setup(
  actor: ConfigurableActorResource,
  schedules: Schedule[] = [],
  extra: Resource[] = [],
  initialOpenServiceId?: string
): Promise<Setup> {
  const medplum = new MockClient({ seedDefaultData: false });
  for (const resource of [downtown, ...services, actor, ...extra]) {
    await medplum.createResource(resource);
  }
  const stored: WithId<Schedule>[] = [];
  for (const schedule of schedules) {
    stored.push(await medplum.createResource(schedule));
  }
  const onSynced = vi.fn();
  vi.spyOn(medplum, 'executeBatch');
  const configurable: ConfigurableActor = { resource: actor, schedules: stored };
  renderWithMedplum(
    <ActorPage
      actor={configurable}
      services={services}
      onSynced={onSynced}
      initialOpenServiceId={initialOpenServiceId}
    />,
    medplum
  );
  return { medplum, onSynced, schedules: stored };
}

function entry(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${name}`) });
}

function panel(name: string): HTMLElement {
  return entry(name).closest('.mantine-Accordion-item') as HTMLElement;
}

function saveBar(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Unsaved changes' });
}

async function save(): Promise<void> {
  await userEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Save' }));
}

function sentBundle(medplum: MockClient): Bundle {
  return vi.mocked(medplum.executeBatch).mock.calls[0][0];
}

function syncedSchedule(onSynced: Setup['onSynced']): WithId<Schedule> {
  return onSynced.mock.calls.at(-1)?.[0].find((resource: Resource) => resource.resourceType === 'Schedule');
}

describe('ActorPage', () => {
  test("a provider's page shows General and Visit types, with every visit type closed to its summary", async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit, followUp])]);

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'General',
      'Visit types offered',
    ]);
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Initial Visit')).toHaveTextContent("60 min · Visit type's default hours");
    expect(entry('Follow-up')).toHaveTextContent('30 min · No hours set');
  });

  test('marks a visit type the Schedule customizes, naming what it overrides, and follows edits', async () => {
    const overriding = setScheduleAvailability(
      setScheduleSchedulingParameterValues(
        makeSchedule('Practitioner/dr-smith', [initialVisit, followUp]),
        initialVisit,
        {
          bufferAfter: 10,
        }
      ),
      initialVisit,
      [{ daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' }]
    );
    await setup(drSmith, [overriding]);

    expect(within(entry('Initial Visit')).getByText('Customized')).toHaveTextContent(
      'Parameter values defined here override those on the Initial Visit visit type.'
    );
    expect(within(entry('Follow-up')).queryByText('Customized')).not.toBeInTheDocument();

    await userEvent.click(entry('Follow-up'));
    await userEvent.type(within(panel('Follow-up')).getByTestId('scheduling-parameters-bufferAfter'), '15');

    expect(within(entry('Follow-up')).getByText('Customized')).toBeInTheDocument();
  });

  test("a Schedule's only visit type starts closed, and opens to its parameters and hours", async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);

    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(entry('Initial Visit'));

    expect(await within(panel('Initial Visit')).findByRole('heading', { name: 'Scheduling parameters' })).toBeVisible();
    expect(within(panel('Initial Visit')).getByRole('heading', { name: 'Availability' })).toBeVisible();
  });

  test('a room with no Schedule offers nothing yet', async () => {
    await setup(room3);

    expect(screen.getByText('Room 3 offers no visit types yet.')).toBeInTheDocument();
    expect(screen.queryByText('Schedule status')).not.toBeInTheDocument();
  });

  const SCHEDULE_OFF =
    "This provider's Schedule is switched off, so they can't be booked until it's switched back on. Appointments already booked stay booked.";
  const INACTIVE = "This provider is inactive and can't be booked.";

  test.each([
    [true, true, 'Active', undefined],
    [true, false, 'Schedule inactive', SCHEDULE_OFF],
    [false, true, 'Inactive', INACTIVE],
    [false, false, 'Inactive', INACTIVE],
  ])(
    'provider active: %s, Schedule active: %s, badge: %s, alert: %s',
    async (providerActive, scheduleActive, badge, expected) => {
      await setup({ ...drSmith, active: providerActive }, [
        { ...makeSchedule('Practitioner/dr-smith', [initialVisit]), active: scheduleActive },
      ]);

      expect(screen.getByRole('heading', { level: 2 }).parentElement).toHaveTextContent(`Dr. Jane Smith${badge}`);
      if (expected) {
        expect(screen.getByRole('alert')).toHaveTextContent(expected);
      } else {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      }
    }
  );

  test("a room whose Schedule is off is called 'it'", async () => {
    await setup(room3, [{ ...makeSchedule('Location/room-3', [initialVisit]), active: false }]);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This room's Schedule is switched off, so it can't be booked until it's switched back on."
    );
  });

  test("shows the provider's status and the Schedule's status side by side", async () => {
    await setup(drSmith, [{ ...makeSchedule('Practitioner/dr-smith', [initialVisit]), active: false }]);

    expect(screen.getByText('Provider status').parentElement).toHaveTextContent('Active');
    expect(screen.getByText('Schedule status').parentElement).toHaveTextContent('Inactive');
  });

  test('a room with no status reads as active', async () => {
    await setup({ ...room3, status: undefined });

    expect(screen.getByRole('switch', { name: 'Room status' })).toBeChecked();
    expect(screen.getByRole('heading', { level: 2 }).parentElement).toHaveTextContent('Room 3Active');
  });

  test('switching a provider off switches its Schedule off and locks it, and both save in one bundle', async () => {
    const { medplum, onSynced, schedules } = await setup(drSmith, [
      makeSchedule('Practitioner/dr-smith', [initialVisit]),
    ]);
    const scheduleSwitch = screen.getByRole('switch', { name: 'Schedule status' });

    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Provider status' }));

    expect(scheduleSwitch).not.toBeChecked();
    expect(scheduleSwitch).toBeDisabled();
    expect(screen.getByRole('heading', { level: 2 }).parentElement).toHaveTextContent('Dr. Jane SmithInactive');
    const reason = "Can't be switched on while the provider is inactive.";
    expect(scheduleSwitch).toHaveAccessibleDescription(reason);
    await userEvent.hover(scheduleSwitch.closest('.mantine-Switch-root')?.parentElement as HTMLElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
    expect(screen.getByRole('alert')).toHaveTextContent("This provider is inactive and can't be booked.");
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(sentBundle(medplum).entry?.map((item) => item.request?.url)).toEqual([
      'Practitioner/dr-smith',
      `Schedule/${schedules[0].id}`,
    ]);
    expect(onSynced.mock.calls[0][0].find((r: Resource) => r.resourceType === 'Practitioner').active).toBe(false);
    expect(syncedSchedule(onSynced).active).toBe(false);
  });

  test('switching a provider back on puts the Schedule back as stored, leaving nothing to save', async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);
    const providerSwitch = screen.getByRole('switch', { name: 'Provider status' });

    await userEvent.click(providerSwitch);
    await userEvent.click(providerSwitch);

    expect(screen.getByRole('switch', { name: 'Schedule status' })).toBeChecked();
    expect(saveBar()).not.toBeInTheDocument();
  });

  test("an inactive provider's Schedule stored on can still be switched off, but not back on", async () => {
    await setup({ ...drSmith, active: false }, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);
    const scheduleSwitch = screen.getByRole('switch', { name: 'Schedule status' });

    expect(scheduleSwitch).toBeEnabled();
    await userEvent.click(scheduleSwitch);

    expect(scheduleSwitch).toBeDisabled();
  });

  test("a room with no Schedule saves only its own status, and a suspended room's status is kept until switched", async () => {
    const { medplum, onSynced } = await setup({ ...room3, status: 'suspended' });
    const roomSwitch = screen.getByRole('switch', { name: 'Room status' });

    expect(roomSwitch).toBeChecked();
    expect(screen.getByText('Suspended')).toBeInTheDocument();
    await userEvent.click(roomSwitch);
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(sentBundle(medplum).entry?.map((item) => item.request?.url)).toEqual(['Location/room-3']);
    expect(onSynced.mock.calls[0][0][0].status).toBe('inactive');
  });

  test('turning off bookings saves Schedule.active false, and every field stays editable', async () => {
    const { onSynced } = await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);

    await userEvent.click(screen.getByRole('switch', { name: 'Schedule status' }));

    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toBeEnabled();
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(syncedSchedule(onSynced).active).toBe(false);
  });

  test('saving the Schedule sends only the Schedule, conditional on the version loaded', async () => {
    const { medplum, onSynced, schedules } = await setup(drSmith, [
      makeSchedule('Practitioner/dr-smith', [initialVisit]),
    ]);

    await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    const bundle = sentBundle(medplum);
    expect(bundle.entry?.map((item) => item.request)).toEqual([
      { method: 'PUT', url: `Schedule/${schedules[0].id}`, ifMatch: `W/"${schedules[0].meta?.versionId}"` },
    ]);
    expect(getScheduleSchedulingParameterValues(syncedSchedule(onSynced), initialVisit).bufferAfter).toBe(15);
  });

  test('one entry opens at a time, closing leaves none open, and edits survive either', async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit, followUp])]);

    await userEvent.click(entry('Initial Visit'));
    await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');
    await userEvent.click(entry('Follow-up'));

    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'true');
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Initial Visit')).toHaveTextContent('Unsaved changes');
    expect(entry('Follow-up')).not.toHaveTextContent('Unsaved changes');

    await userEvent.click(entry('Initial Visit'));
    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toHaveValue('15 min');

    await userEvent.click(entry('Initial Visit'));
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
  });

  test("custom hours start from the visit type's, and save as this Schedule's hours for it", async () => {
    const { onSynced } = await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);
    const initial = panel('Initial Visit');

    await userEvent.click(within(initial).getByTestId('schedule-availability-enable'));

    expect(within(initial).getByTestId('schedule-availability-switch-mon')).toBeChecked();
    expect(within(initial).getByTestId('schedule-availability-switch-tue')).not.toBeChecked();
    await userEvent.click(within(initial).getByTestId('schedule-availability-switch-tue'));
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(getScheduleSchedulingParameters(syncedSchedule(onSynced), initialVisit, 'availability')).toHaveLength(1);
  });

  test('an emptied custom week blocks the save, with the reason', async () => {
    const overriding = setScheduleAvailability(makeSchedule('Practitioner/dr-smith', [initialVisit]), initialVisit, [
      { daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' },
    ]);
    const { medplum } = await setup(drSmith, [overriding], [], initialVisit.id);

    await userEvent.click(within(panel('Initial Visit')).getByTestId('schedule-availability-switch-tue'));
    await save();

    const button = within(saveBar() as HTMLElement).getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(panel('Initial Visit')).getByText(/Custom availability must include at least one available day/)
    ).toBeVisible();
    expect(medplum.executeBatch).not.toHaveBeenCalled();
  });

  test('a stored alignment interval is shown, so it can be cleared', async () => {
    const aligned = setScheduleSchedulingParameterValues(
      makeSchedule('Practitioner/dr-smith', [initialVisit]),
      initialVisit,
      {
        alignmentInterval: 30,
      }
    );
    await setup(drSmith, [aligned]);

    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-alignmentInterval')).toHaveValue('30 min');
  });

  test('hides inherited hours until custom hours are on, then names where the time zone comes from', async () => {
    const walkIn: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'walk-in', name: 'Walk-in' };
    services.push(walkIn);
    try {
      await setup({ ...drSmith, extension: [{ url: TimezoneExtensionURI, valueCode: 'America/Chicago' }] }, [
        makeSchedule('Practitioner/dr-smith', [initialVisit, walkIn]),
      ]);
      await userEvent.click(entry('Initial Visit'));
      expect(within(panel('Initial Visit')).queryByTestId('schedule-availability-switch-mon')).not.toBeInTheDocument();
      expect(within(panel('Initial Visit')).queryByTestId('schedule-availability-reset')).not.toBeInTheDocument();
      expect(within(panel('Initial Visit')).queryByText(/The time zone comes from/)).not.toBeInTheDocument();
      await userEvent.click(within(panel('Initial Visit')).getByTestId('schedule-availability-enable'));

      await waitFor(() =>
        expect(within(panel('Initial Visit')).getByText('The time zone comes from Initial Visit.')).toBeVisible()
      );

      await userEvent.click(entry('Walk-in'));
      await userEvent.click(within(panel('Walk-in')).getByTestId('schedule-availability-enable'));
      await waitFor(() =>
        expect(within(panel('Walk-in')).getByText('The time zone comes from Dr. Jane Smith.')).toBeVisible()
      );
    } finally {
      services.pop();
    }
  });

  test('edits the first of two Schedules and says nothing about the other', async () => {
    await setup(drSmith, [
      makeSchedule('Practitioner/dr-smith', [initialVisit], 'first'),
      makeSchedule('Practitioner/dr-smith', [followUp], 'second'),
    ]);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(entry('Initial Visit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Follow-up/ })).not.toBeInTheDocument();
  });

  test('a Schedule another system changed since it was loaded is not written over, and reload hands back the newer one', async () => {
    const { medplum, onSynced, schedules } = await setup(drSmith, [
      makeSchedule('Practitioner/dr-smith', [initialVisit]),
    ]);
    await medplum.updateResource({ ...schedules[0], comment: 'Changed elsewhere' });

    await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');
    await save();

    expect(await screen.findByText('The Schedule for Dr. Jane Smith changed since you opened it')).toBeInTheDocument();
    expect(onSynced).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(syncedSchedule(onSynced).comment).toBe('Changed elsewhere');
  });
});
