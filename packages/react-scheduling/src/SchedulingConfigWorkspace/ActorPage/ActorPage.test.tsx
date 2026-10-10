// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  badRequest,
  getScheduleSchedulingParameters,
  OperationOutcomeError,
  serviceTypeIncludesService,
  TimezoneExtensionURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { Bundle, Device, HealthcareService, Location, Practitioner, Resource, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { setScheduleAvailability } from '../../availability';
import type { ConfigurableActor, ConfigurableActorResource } from '../../configSearch';
import {
  getScheduleSchedulingParameterValues,
  setHealthcareServiceSchedulingParameterValues,
  setScheduleSchedulingParameterValues,
} from '../../parameterValues';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  removePill,
  settleAutocomplete,
  typeInAutocomplete,
} from '../../test-utils/asyncAutocomplete';
import { act, fireEvent, renderWithMedplum, screen, userEvent, waitFor, within } from '../../test-utils/render';
import { ActorPage } from './ActorPage';

const downtown: WithId<Location> = { resourceType: 'Location', id: 'downtown', name: 'Downtown Clinic' };
const northside: WithId<Location> = { resourceType: 'Location', id: 'northside', name: 'Northside' };
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
const cystoscopy: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'cystoscopy',
  name: 'Cystoscopy',
  location: [{ reference: 'Location/northside' }],
};
const discontinued: WithId<HealthcareService> = {
  resourceType: 'HealthcareService',
  id: 'discontinued',
  name: 'Discontinued',
  active: false,
};
const services = [initialVisit, followUp, cystoscopy, discontinued];

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
  for (const resource of [downtown, northside, ...services, ...extra]) {
    await medplum.createResource(resource);
  }
  // Loaded as stored, with its version, as the workspace hands it over.
  const storedActor = await medplum.createResource(actor);
  const stored: WithId<Schedule>[] = [];
  for (const schedule of schedules) {
    stored.push(await medplum.createResource(schedule));
  }
  const onSynced = vi.fn();
  vi.spyOn(medplum, 'executeBatch');
  const configurable: ConfigurableActor = { resource: storedActor, schedules: stored };
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

function general(): HTMLElement {
  return screen.getByRole('region', { name: 'General' });
}

function timezoneField(): HTMLElement {
  return within(general()).getByRole('textbox', { name: 'Time zone' });
}

function timezoneWarning(): HTMLElement | null {
  return within(general()).queryByText(/Recommended for scheduling/);
}

function pickTimezone(zone: string): void {
  fireEvent.focus(timezoneField());
  fireEvent.change(timezoneField(), { target: { value: zone } });
  fireEvent.click(screen.getByText(zone));
}

function sentResources(medplum: MockClient): Resource[] {
  return sentBundle(medplum).entry?.map((item) => item.resource as Resource) ?? [];
}

async function openOfferPicker(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Offer visit types' }));
}

async function chooseStopOffering(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Stop offering' }));
}

async function offer(...names: string[]): Promise<void> {
  await openOfferPicker();
  for (const name of names) {
    await userEvent.click(screen.getByRole('option', { name }));
  }
  await userEvent.click(screen.getByRole('button', { name: /^Offer \d/ }));
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
    expect(entry('Initial Visit')).toHaveTextContent('Unsaved');
    expect(entry('Follow-up')).not.toHaveTextContent('Unsaved');

    await userEvent.click(entry('Initial Visit'));
    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toHaveValue('15 min');

    await userEvent.click(entry('Initial Visit'));
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
  });

  test('a first visit type for a room creates one active Schedule held by the room alone', async () => {
    const { medplum, onSynced } = await setup(room3);

    await offer('Initial Visit');
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Initial Visit')).toHaveTextContent('Unsaved');
    expect(medplum.executeBatch).not.toHaveBeenCalled();
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(sentBundle(medplum).entry?.[0].request).toEqual({
      method: 'POST',
      url: 'Schedule',
      ifNoneExist: `actor=Location/${room3.id}`,
    });
    expect(serviceTypeIncludesService(syncedSchedule(onSynced).serviceType, initialVisit)).toBe(true);
  });

  test('discarding a first offering writes nothing and leaves the room without a Schedule', async () => {
    const { medplum } = await setup(room3);

    await offer('Initial Visit');
    await userEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));

    expect(screen.getByText('Room 3 offers no visit types yet.')).toBeInTheDocument();
    expect(saveBar()).toBeNull();
    expect(medplum.executeBatch).not.toHaveBeenCalled();
  });

  test('offers only active visit types not yet offered', async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);

    await openOfferPicker();
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Follow-up', 'Cystoscopy']);
  });

  test('offers several visit types at once, closed, and then says none are left to offer', async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);

    await offer('Cystoscopy', 'Follow-up');

    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Cystoscopy')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('No active visit types are left to offer.')).toBeInTheDocument();
  });

  test('stopping a visit type asks first, then drops it on save', async () => {
    const { onSynced } = await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit, followUp])]);

    await chooseStopOffering('Initial Visit');
    const dialog = await screen.findByRole('dialog', { name: 'Stop offering Initial Visit?' });
    expect(dialog).toHaveTextContent("Existing appointments aren't changed.");
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop offering' }));

    expect(screen.queryByRole('button', { name: /^Initial Visit/ })).not.toBeInTheDocument();
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    const saved = syncedSchedule(onSynced);
    expect(serviceTypeIncludesService(saved.serviceType, initialVisit)).toBe(false);
  });

  test('stopping a visit type and offering it again saves nothing, and leaves the page clean', async () => {
    const { medplum, onSynced } = await setup(drSmith, [
      makeSchedule('Practitioner/dr-smith', [initialVisit, followUp]),
    ]);
    await chooseStopOffering('Initial Visit');
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Stop offering Initial Visit?' })).getByRole('button', {
        name: 'Stop offering',
      })
    );
    await offer('Initial Visit');
    expect(saveBar()).not.toBeNull();

    await save();

    await waitFor(() => expect(saveBar()).toBeNull());
    expect(medplum.executeBatch).not.toHaveBeenCalled();
    expect(onSynced).not.toHaveBeenCalled();
  });

  test('keeping a visit type from the confirmation changes nothing', async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);

    await chooseStopOffering('Initial Visit');
    await userEvent.click(await screen.findByRole('button', { name: 'Keep offering' }));

    expect(entry('Initial Visit')).toBeInTheDocument();
    expect(saveBar()).toBeNull();
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

  test('a Schedule created elsewhere for an actor that had none is not duplicated, and reload hands it back', async () => {
    const { medplum, onSynced } = await setup(room3);
    await offer('Initial Visit');
    const elsewhere = await medplum.createResource(makeSchedule('Location/room-3', [followUp]));

    await save();

    expect(await screen.findByText('The Schedule for Room 3 changed since you opened it')).toBeInTheDocument();
    expect(await medplum.searchResources('Schedule', { actor: 'Location/room-3' }, { cache: 'no-cache' })).toHaveLength(
      1
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(syncedSchedule(onSynced).id).toBe(elsewhere.id);
  });
  describe('General', () => {
    const drSmithSynced: WithId<Practitioner> = {
      ...drSmith,
      active: true,
      address: [{ state: 'IL' }, { state: 'WI' }],
      extension: [{ url: 'http://example.org/source', valueString: 'kept' }],
    };

    test("a provider's time zone is edited, and saving it sends the extension and nothing else", async () => {
      const { medplum, onSynced } = await setup(drSmithSynced, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);
      const stored = await medplum.readResource('Practitioner', 'dr-smith');

      expect(within(general()).queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
      pickTimezone('America/Chicago');
      await save();

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      const bundle = sentBundle(medplum);
      expect(bundle.entry?.map((item) => item.request)).toEqual([
        { method: 'PUT', url: 'Practitioner/dr-smith', ifMatch: `W/"${stored.meta?.versionId}"` },
      ]);
      expect(bundle.entry?.[0].resource).toEqual({
        ...stored,
        extension: [
          { url: 'http://example.org/source', valueString: 'kept' },
          { url: TimezoneExtensionURI, valueCode: 'America/Chicago' },
        ],
      });
    });

    test("a provider's NPIs are shown read-only, and other identifiers aren't", async () => {
      await setup({
        ...drSmith,
        identifier: [
          { system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567893' },
          { system: 'http://example.org/employee-id', value: 'E-42' },
          { system: 'http://hl7.org/fhir/sid/us-npi', value: '1245319599' },
        ],
      });

      expect(within(general()).getByText('NPIs').nextSibling).toHaveTextContent('1234567893, 1245319599');
      expect(within(general()).queryByText(/E-42/)).not.toBeInTheDocument();
      expect(within(general()).queryByRole('textbox', { name: /NPI/ })).not.toBeInTheDocument();
    });

    test('a provider without an NPI shows it as not set', async () => {
      await setup(drSmith);

      expect(within(general()).getByText('NPI').nextSibling).toHaveTextContent('Not set');
    });

    test('a provider without a time zone is warned it is recommended, until one is picked', async () => {
      await setup(drSmith);

      expect(timezoneWarning()).toBeInTheDocument();
      pickTimezone('America/Chicago');
      expect(timezoneWarning()).not.toBeInTheDocument();
    });

    test('a room without a time zone is not warned', async () => {
      await setup(room3);

      expect(timezoneWarning()).not.toBeInTheDocument();
    });

    test("the provider's time zone is read for hours as soon as it is set, before it is saved", async () => {
      const walkIn: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'walk-in', name: 'Walk-in' };
      services.push(walkIn);
      try {
        await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [walkIn])]);
        await userEvent.click(entry('Walk-in'));
        await userEvent.click(within(panel('Walk-in')).getByTestId('schedule-availability-enable'));
        expect(within(panel('Walk-in')).queryByText(/The time zone comes from/)).not.toBeInTheDocument();

        pickTimezone('America/Chicago');

        await waitFor(() =>
          expect(within(panel('Walk-in')).getByText('The time zone comes from Dr. Jane Smith.')).toBeVisible()
        );
      } finally {
        services.pop();
      }
    });

    test('a room is retired by switching its status off, and nothing deletes it', async () => {
      const { medplum, onSynced } = await setup(room3);
      const remove = vi.spyOn(medplum, 'deleteResource');

      expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument();
      await userEvent.click(within(general()).getByRole('switch', { name: 'Room status' }));
      await save();

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      expect(sentBundle(medplum).entry?.map((item) => item.request?.method)).toEqual(['PUT']);
      expect((sentResources(medplum)[0] as Location).status).toBe('inactive');
      expect(remove).not.toHaveBeenCalled();
    });

    test("a room's name is required", async () => {
      const { medplum } = await setup(room3);

      await userEvent.clear(within(general()).getByRole('textbox', { name: /Name/ }));
      await save();

      expect(within(general()).getByText('A name is required.')).toBeInTheDocument();
      expect(within(saveBar() as HTMLElement).getByRole('button', { name: 'Save' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      expect(medplum.executeBatch).not.toHaveBeenCalled();
    });

    describe('service facility', () => {
      installAutocompleteTimers();

      async function pick(label: string, name: string): Promise<void> {
        await typeInAutocomplete(within(general()).getByRole('searchbox', { name: label }), name.split(' ')[0]);
        await clickAutocompleteOption(name);
      }

      async function saveNow(): Promise<void> {
        await act(async () => {
          fireEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: /^(Save|Create)$/ }));
        });
      }

      test("assigning a room to a service facility stores it as the room's partOf", async () => {
        const { partOf: _partOf, ...unplaced } = room3;
        const { medplum, onSynced } = await setup(unplaced);

        expect(within(general()).getByRole('searchbox', { name: 'Service facility' })).toHaveAttribute(
          'placeholder',
          'Hidden when booking by service facility'
        );
        await pick('Service facility', 'Downtown Clinic');
        await saveNow();

        await waitFor(() => expect(onSynced).toHaveBeenCalled());
        expect((sentResources(medplum)[0] as Location).partOf?.reference).toBe('Location/downtown');
      });

      test("a device's name and location are stored on the Device", async () => {
        const device: WithId<Device> = {
          resourceType: 'Device',
          id: 'ultrasound-2',
          deviceName: [{ name: 'US-2000', type: 'model-name' }],
        };
        const { medplum, onSynced } = await setup(device);

        expect(within(general()).getByRole('searchbox', { name: 'Service facility' })).toHaveAttribute(
          'placeholder',
          'Shown at every service facility'
        );
        fireEvent.change(within(general()).getByRole('textbox', { name: /Name/ }), {
          target: { value: 'Ultrasound 2' },
        });
        await pick('Service facility', 'Northside');
        await saveNow();

        await waitFor(() => expect(onSynced).toHaveBeenCalled());
        const sent = sentResources(medplum)[0] as Device;
        expect(sent.deviceName?.[0]).toEqual({ name: 'Ultrasound 2', type: 'user-friendly-name' });
        expect(sent.location?.reference).toBe('Location/northside');
      });

      test('moving a room to another service facility keeps what it offers', async () => {
        const atNorthside = { ...room3, partOf: { reference: 'Location/northside', display: 'Northside' } };
        await setup(atNorthside, [makeSchedule('Location/room-3', [cystoscopy])], [], cystoscopy.id);
        await settleAutocomplete();

        await removePill('Northside');
        await pick('Service facility', 'Downtown Clinic');
        await settleAutocomplete();

        expect(entry('Cystoscopy')).toBeInTheDocument();
        expect(saveBar()).not.toBeNull();
      });

      describe('creating', () => {
        async function setupNew(
          newActorType: 'Location' | 'Device'
        ): Promise<Pick<Setup, 'medplum' | 'onSynced'> & { onDiscardNew: ReturnType<typeof vi.fn> }> {
          const medplum = new MockClient({ seedDefaultData: false });
          for (const resource of [downtown, northside, ...services]) {
            await medplum.createResource(resource);
          }
          const onSynced = vi.fn();
          const onDiscardNew = vi.fn();
          vi.spyOn(medplum, 'executeBatch');
          renderWithMedplum(
            <ActorPage
              newActorType={newActorType}
              services={services}
              onSynced={onSynced}
              onDiscardNew={onDiscardNew}
            />,
            medplum
          );
          return { medplum, onSynced, onDiscardNew };
        }

        test('a new room says it is not saved yet, and offers no visit types until it is created', async () => {
          await setupNew('Location');

          expect(screen.getByText('New room')).toBeInTheDocument();
          expect(screen.getByText('Not saved yet')).toBeInTheDocument();
          expect(screen.getByText('Visit types can be offered once this room is created.')).toBeInTheDocument();
          expect(screen.queryByRole('button', { name: 'Offer visit types' })).not.toBeInTheDocument();
          expect(screen.getByRole('switch', { name: 'Room status' })).toBeChecked();
          expect(screen.queryByRole('switch', { name: 'Schedule status' })).not.toBeInTheDocument();
        });

        test('creating a room stores an active Location typed as a room, at the service facility picked', async () => {
          const { medplum, onSynced } = await setupNew('Location');

          fireEvent.change(within(general()).getByRole('textbox', { name: /Name/ }), { target: { value: 'Room 9' } });
          await pick('Service facility', 'Downtown Clinic');
          await saveNow();

          await waitFor(() => expect(onSynced).toHaveBeenCalled());
          expect(sentBundle(medplum).entry?.map((item) => item.request)).toEqual([{ method: 'POST', url: 'Location' }]);
          const created = onSynced.mock.calls[0][0][0] as WithId<Location>;
          expect(created).toMatchObject({
            name: 'Room 9',
            status: 'active',
            partOf: { reference: 'Location/downtown' },
          });
          expect(created.physicalType?.coding?.map((coding) => coding.code)).toEqual(['ro']);
        });

        test('a new device switched off is created inactive', async () => {
          const { onSynced } = await setupNew('Device');

          fireEvent.change(within(general()).getByRole('textbox', { name: /Name/ }), {
            target: { value: 'Ultrasound 4' },
          });
          await userEvent.click(screen.getByRole('switch', { name: 'Device status' }));
          await saveNow();

          await waitFor(() => expect(onSynced).toHaveBeenCalled());
          expect(onSynced.mock.calls[0][0][0]).toMatchObject({ resourceType: 'Device', status: 'inactive' });
        });

        test('a new room is refused without a name, and discarding it writes nothing', async () => {
          const { medplum, onDiscardNew } = await setupNew('Location');

          await saveNow();
          expect(within(general()).getByText('A name is required.')).toBeInTheDocument();
          await act(async () => {
            fireEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));
          });

          expect(onDiscardNew).toHaveBeenCalled();
          expect(medplum.executeBatch).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('saving the provider and the Schedule together', () => {
    async function editBoth(): Promise<Setup> {
      const result = await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);
      pickTimezone('America/Chicago');
      await userEvent.click(entry('Initial Visit'));
      await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');
      return result;
    }

    test('a refused transaction changes neither, keeps every edit, and shows the reason', async () => {
      const { medplum, onSynced } = await editBoth();
      vi.mocked(medplum.executeBatch).mockRejectedValueOnce(
        new OperationOutcomeError(badRequest('Rejected by policy'))
      );

      await save();

      expect(await screen.findByText('Rejected by policy')).toBeInTheDocument();
      expect(sentResources(medplum).map((resource) => resource.resourceType)).toEqual(['Practitioner', 'Schedule']);
      expect(onSynced).not.toHaveBeenCalled();
      expect(timezoneField()).toHaveValue('America/Chicago');
      expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toHaveValue('15 min');
      expect(saveBar()).not.toBeNull();
    });

    test('a provider an external sync changed since it was loaded is not written over, and can be reloaded', async () => {
      const { medplum, onSynced } = await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);
      const stored = await medplum.readResource('Practitioner', 'dr-smith');
      await medplum.updateResource({ ...stored, name: [{ given: ['Janet'], family: 'Smith' }] });

      pickTimezone('America/Chicago');
      await save();

      expect(await screen.findByText('Dr. Jane Smith or its Schedule changed since you opened it')).toBeInTheDocument();
      expect(onSynced).not.toHaveBeenCalled();
      const current = await medplum.readResource('Practitioner', 'dr-smith');
      expect(current.extension).toBeUndefined();

      await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      const reloaded = onSynced.mock.calls[0][0].find((r: Resource) => r.resourceType === 'Practitioner');
      expect((reloaded as Practitioner).name?.[0].given).toEqual(['Janet']);
    });
  });
});
