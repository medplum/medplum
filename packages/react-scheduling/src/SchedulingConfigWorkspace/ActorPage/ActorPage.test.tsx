// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allServiceTypesCodeableConcept,
  badRequest,
  getScheduleSchedulingParameters,
  OperationOutcomeError,
  serviceTypeIncludesAllServices,
  serviceTypeIncludesService,
  TimezoneExtensionURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type {
  Bundle,
  Device,
  HealthcareService,
  Location,
  Practitioner,
  PractitionerRole,
  Resource,
  Schedule,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { setScheduleAvailability } from '../../availability';
import type { ConfigurableActor, ConfigurableActorResource } from '../../configSearch';
import { SERVICE_FACILITY_ROLE_SYSTEM } from '../../constants';
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
  fireEvent.click(screen.getByRole('option'));
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

function offeringAll(
  actor: string,
  customized: WithId<HealthcareService>,
  named: WithId<HealthcareService>[] = []
): Schedule {
  const schedule = makeSchedule(actor, named);
  return setScheduleSchedulingParameterValues(
    { ...schedule, serviceType: [...(schedule.serviceType ?? []), allServiceTypesCodeableConcept()] },
    customized,
    { bufferAfter: 10 }
  );
}

function entryNames(): string[] {
  return [...document.querySelectorAll('.mantine-Accordion-control')].map(
    (control) => control.querySelector('p')?.textContent ?? ''
  );
}

async function flipOfferAll(dialogName: string): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('switch', { name: /^Offer all visit types/ }));
  return screen.findByRole('dialog', { name: dialogName });
}

async function offer(...names: string[]): Promise<void> {
  await openOfferPicker();
  for (const name of names) {
    await userEvent.click(screen.getByRole('option', { name }));
  }
  await userEvent.click(screen.getByRole('button', { name: /^Offer \d/ }));
}

function role(
  id: string,
  locations: WithId<Location>[],
  options: { active?: boolean; own?: boolean; linked?: boolean } = {}
): WithId<PractitionerRole> {
  return {
    resourceType: 'PractitionerRole',
    id,
    practitioner: { reference: 'Practitioner/dr-smith' },
    location: locations.map((location) => ({ reference: `Location/${location.id}` })),
    ...(options.active !== undefined && { active: options.active }),
    ...(options.own && { identifier: [{ system: SERVICE_FACILITY_ROLE_SYSTEM, value: 'dr-smith' }] }),
    ...(options.linked && { identifier: [{ system: 'http://example.org/provider-location-link', value: id }] }),
  };
}

async function facilityPicker(): Promise<HTMLElement> {
  return screen.findByRole('searchbox', { name: 'Service facilities' });
}

function chips(): HTMLElement {
  return screen.getByTestId('selected-items');
}

// The field looks each stored reference up after it mounts.
async function findChips(names: string[]): Promise<HTMLElement> {
  await waitFor(() => names.forEach((name) => expect(chips()).toHaveTextContent(name)));
  return chips();
}

async function removeFacility(name: string): Promise<void> {
  await findChips([name]);
  await removePill(name);
}

async function linkedFacilities(): Promise<(string | null)[]> {
  const list = await screen.findByRole('list', { name: 'Linked by another system' });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

function sentRoles(medplum: MockClient): Bundle['entry'] {
  return sentBundle(medplum).entry?.filter((item) => item.resource?.resourceType === 'PractitionerRole');
}

// Nothing the workspace sends may delete: a service facility is taken away by turning its role off.
function expectNothingDeleted(medplum: MockClient): void {
  const requests = vi.mocked(medplum.executeBatch).mock.calls.flatMap(([bundle]) => bundle.entry ?? []);
  expect(requests.every((item) => item.request?.method !== 'DELETE')).toBe(true);
  expect(medplum.deleteResource).not.toHaveBeenCalled();
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
    await userEvent.click(entry('Initial Visit'));

    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toBeEnabled();
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(syncedSchedule(onSynced).active).toBe(false);
  });

  test('saving the Schedule sends only the Schedule, conditional on the version loaded', async () => {
    const { medplum, onSynced, schedules } = await setup(drSmith, [
      makeSchedule('Practitioner/dr-smith', [initialVisit]),
    ]);

    await userEvent.click(entry('Initial Visit'));
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

  test('stopping several at once drops them all on save, and keeps the rest', async () => {
    const { onSynced } = await setup(drSmith, [
      makeSchedule('Practitioner/dr-smith', [initialVisit, followUp, cystoscopy]),
    ]);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Initial Visit' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Cystoscopy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stop offering 2' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Stop offering 2 visit types?' })).getByRole('button', {
        name: 'Stop offering',
      })
    );
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    const saved = syncedSchedule(onSynced).serviceType;
    expect([initialVisit, followUp, cystoscopy].map((service) => serviceTypeIncludesService(saved, service))).toEqual([
      false,
      true,
      false,
    ]);
  });

  test("a Schedule offering every visit type lists each active one, and can't stop or offer one on its own", async () => {
    await setup(drSmith, [offeringAll('Practitioner/dr-smith', followUp)], [], followUp.id);

    expect(screen.getByRole('switch', { name: /^Offer all visit types/ })).toBeChecked();
    expect(entryNames()).toEqual(['Initial Visit', 'Follow-up', 'Cystoscopy']);
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'true');
    expect(entry('Follow-up')).not.toHaveTextContent('Unsaved');
    expect(screen.queryByRole('button', { name: 'Offer visit types' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Initial Visit' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Initial Visit' }));
    expect(await screen.findByRole('menuitem', { name: 'Stop offering' })).toBeDisabled();
  });

  test('offering all warns of what becomes bookable, then saves the marker beside the visit types named', async () => {
    const { onSynced } = await setup(room3, [makeSchedule('Location/room-3', [initialVisit])]);

    const dialog = await flipOfferAll('Offer all visit types?');

    expect(dialog).toHaveTextContent('Room 3 will be bookable for all 3 active visit types, and any added later');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      "Follow-up and Cystoscopy have no hours of their own, so they're bookable around the clock"
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Offer all' }));
    expect(entryNames()).toEqual(['Initial Visit', 'Follow-up', 'Cystoscopy']);
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    const saved = syncedSchedule(onSynced).serviceType;
    expect(serviceTypeIncludesAllServices(saved)).toBe(true);
    expect(serviceTypeIncludesService(saved, initialVisit)).toBe(true);
  });

  test('no longer offering all keeps only the visit types customized here, after warning', async () => {
    const { onSynced } = await setup(drSmith, [offeringAll('Practitioner/dr-smith', followUp)]);

    const dialog = await flipOfferAll('Stop offering all visit types?');

    expect(dialog).toHaveTextContent(
      'Dr. Jane Smith will keep offering the 1 visit type customized here, and stop offering the other 2 once you save.'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop offering all' }));
    expect(entryNames()).toEqual(['Follow-up']);
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    const saved = syncedSchedule(onSynced);
    expect(saved.serviceType).toEqual(toServiceTypeCodeableConcepts(followUp));
    expect(getScheduleSchedulingParameterValues(saved, followUp).bufferAfter).toBe(10);
  });

  test('an inactive visit type the Schedule names can still be stopped while it offers all', async () => {
    await setup(drSmith, [offeringAll('Practitioner/dr-smith', followUp, [discontinued])]);

    await chooseStopOffering('Discontinued');
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Stop offering Discontinued?' })).getByRole('button', {
        name: 'Stop offering',
      })
    );

    expect(entryNames()).toEqual(['Initial Visit', 'Follow-up', 'Cystoscopy']);
  });

  test('no longer offering all keeps the visit types the Schedule names, too', async () => {
    const { onSynced } = await setup(drSmith, [offeringAll('Practitioner/dr-smith', followUp, [initialVisit])]);

    const dialog = await flipOfferAll('Stop offering all visit types?');

    expect(dialog).toHaveTextContent(
      'keep offering the 2 visit types offered before, or customized here, and stop offering the other 1 once you save.'
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop offering all' }));
    expect(entryNames()).toEqual(['Initial Visit', 'Follow-up']);
    await save();

    await waitFor(() => expect(onSynced).toHaveBeenCalled());
    expect(syncedSchedule(onSynced).serviceType).toEqual([
      ...toServiceTypeCodeableConcepts(initialVisit),
      ...toServiceTypeCodeableConcepts(followUp),
    ]);
  });

  test('offering all and undoing it before saving leaves the page as it opened', async () => {
    await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);

    await userEvent.click(
      within(await flipOfferAll('Offer all visit types?')).getByRole('button', { name: 'Offer all' })
    );
    await userEvent.click(
      within(await flipOfferAll('Stop offering all visit types?')).getByRole('button', { name: 'Stop offering all' })
    );

    expect(entryNames()).toEqual(['Initial Visit']);
    expect(saveBar()).toBeNull();
  });

  test("custom hours start from the visit type's, and save as this Schedule's hours for it", async () => {
    const { onSynced } = await setup(drSmith, [makeSchedule('Practitioner/dr-smith', [initialVisit])]);
    await userEvent.click(entry('Initial Visit'));
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

  test('a blocked save opens the entry it is blocked on', async () => {
    const overriding = setScheduleAvailability(makeSchedule('Practitioner/dr-smith', [initialVisit]), initialVisit, [
      { daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' },
    ]);
    await setup(drSmith, [overriding]);
    await userEvent.click(entry('Initial Visit'));
    await userEvent.click(within(panel('Initial Visit')).getByTestId('schedule-availability-switch-tue'));
    await userEvent.click(entry('Initial Visit'));

    await save();

    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'true');
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
    await userEvent.click(entry('Initial Visit'));

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

    await userEvent.click(entry('Initial Visit'));
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

    test('a room without a time zone is warned too', async () => {
      await setup(room3);

      expect(timezoneWarning()).toBeInTheDocument();
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

      test("a device's name is read-only and its location is stored on the Device", async () => {
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
        expect(within(general()).getByText('US-2000')).toBeInTheDocument();
        expect(within(general()).queryByRole('textbox', { name: /Name/ })).not.toBeInTheDocument();
        await pick('Service facility', 'Northside');
        await saveNow();

        await waitFor(() => expect(onSynced).toHaveBeenCalled());
        const sent = sentResources(medplum)[0] as Device;
        expect(sent.deviceName).toEqual(device.deviceName);
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

        test('creating a room stores an active Location typed as a room, at the service facility picked, and its Schedule', async () => {
          const { medplum, onSynced } = await setupNew('Location');

          fireEvent.change(within(general()).getByRole('textbox', { name: /Name/ }), { target: { value: 'Room 9' } });
          await pick('Service facility', 'Downtown Clinic');
          await saveNow();

          await waitFor(() => expect(onSynced).toHaveBeenCalled());
          expect(sentBundle(medplum).entry?.map((item) => item.request)).toEqual([
            { method: 'POST', url: 'Location' },
            { method: 'POST', url: 'Schedule' },
          ]);
          const created = onSynced.mock.calls[0][0][0] as WithId<Location>;
          expect(created).toMatchObject({
            name: 'Room 9',
            status: 'active',
            partOf: { reference: 'Location/downtown' },
          });
          expect(created.physicalType?.coding?.map((coding) => coding.code)).toEqual(['ro']);
          const schedule = syncedSchedule(onSynced);
          expect(schedule).toMatchObject({ active: true, actor: [{ reference: `Location/${created.id}` }] });
          expect(schedule.serviceType).toBeUndefined();
        });

        test('a new device switched off is created inactive, with its Schedule off', async () => {
          const { onSynced } = await setupNew('Device');

          fireEvent.change(within(general()).getByRole('textbox', { name: /Name/ }), {
            target: { value: 'Ultrasound 4' },
          });
          await userEvent.click(screen.getByRole('switch', { name: 'Device status' }));
          await saveNow();

          await waitFor(() => expect(onSynced).toHaveBeenCalled());
          expect(onSynced.mock.calls[0][0][0]).toMatchObject({ resourceType: 'Device', status: 'inactive' });
          expect(syncedSchedule(onSynced).active).toBe(false);
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
      expect(timezoneField()).toHaveValue('(CT) Central Time');
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

  describe('service facilities', () => {
    installAutocompleteTimers();

    async function saveNow(): Promise<void> {
      await act(async () => {
        fireEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Save' }));
      });
    }

    async function add(name: string): Promise<void> {
      await typeInAutocomplete(await facilityPicker(), name.split(' ')[0]);
      // By role, since a linked service facility shows the same name outside the dropdown.
      const option = await screen.findByRole('option', { name: new RegExp(name) });
      await act(async () => {
        fireEvent.click(option);
      });
    }

    async function confirm(name: string): Promise<void> {
      const dialog = await screen.findByRole('dialog', { name });
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Limit to|Offer everywhere)/ }));
      });
    }

    test('a provider with no active role is offered at every service facility', async () => {
      await setup(drSmith, [], [role('retired', [northside], { active: false })]);

      expect(await facilityPicker()).toHaveAttribute('placeholder', 'Offered at every service facility');
      expect(screen.queryByRole('list', { name: 'Linked by another system' })).not.toBeInTheDocument();
    });

    test('rooms and devices have no service facilities field', async () => {
      await setup(room3);

      expect(screen.queryByRole('searchbox', { name: 'Service facilities' })).not.toBeInTheDocument();
    });

    test("lists the workspace role's service facilities, and none of an inactive role", async () => {
      await setup(
        drSmith,
        [],
        [role('own', [downtown, northside], { own: true }), role('r3', [room3], { active: false })]
      );

      expect(await findChips(['Downtown Clinic', 'Northside'])).toBeInTheDocument();
      expect(chips()).not.toHaveTextContent('Room 3');
    });

    test('removing a service facility takes it off the workspace role on save, deleting nothing and writing nothing else', async () => {
      const { medplum, onSynced } = await setup(drSmith, [], [role('own', [northside, downtown], { own: true })]);
      vi.spyOn(medplum, 'deleteResource');
      const stored = await medplum.readResource('PractitionerRole', 'own');

      await removeFacility('Northside');
      expect(chips()).not.toHaveTextContent('Northside');
      await saveNow();

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      expect(sentRoles(medplum)).toEqual([
        {
          resource: { ...stored, active: true, location: [{ reference: 'Location/downtown' }] },
          request: { method: 'PUT', url: 'PractitionerRole/own', ifMatch: `W/"${stored.meta?.versionId}"` },
        },
      ]);
      expectNothingDeleted(medplum);
    });

    test('saving with the last service facility removed asks, then offers the provider everywhere', async () => {
      const { medplum, onSynced } = await setup(drSmith, [], [role('own', [northside], { own: true })]);

      await removeFacility('Northside');
      await saveNow();
      await confirm('Offer Dr. Jane Smith at every service facility?');

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      expect(sentRoles(medplum)?.[0].resource).toMatchObject({ id: 'own', active: false });
    });

    test('a save changing only roles leaves the page clean, showing what was stored', async () => {
      const { onSynced } = await setup(drSmith, [], [role('own', [northside, downtown], { own: true })]);

      await removeFacility('Northside');
      await saveNow();

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      expect(onSynced.mock.calls[0][0].map((resource: Resource) => resource.resourceType)).toEqual([
        'PractitionerRole',
      ]);
      await waitFor(() => expect(saveBar()).toBeNull());
      expect(await findChips(['Downtown Clinic'])).not.toHaveTextContent('Northside');
    });

    test('Discard puts a removed service facility back', async () => {
      await setup(drSmith, [], [role('own', [northside, downtown], { own: true })]);

      await removeFacility('Northside');
      await act(async () => {
        fireEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));
      });

      expect(await findChips(['Downtown Clinic', 'Northside'])).toBeInTheDocument();
      expect(saveBar()).toBeNull();
    });

    test('a service facility on any role but the workspace one is shown locked, outside the input', async () => {
      await setup(drSmith, [], [role('theirs', [downtown], { linked: true }), role('handmade', [northside])]);

      expect(await linkedFacilities()).toEqual([
        "Downtown Clinic: Another system linked Downtown Clinic, so it can't be removed here.",
        "Northside: Another system linked Northside, so it can't be removed here.",
      ]);
      expect(chips()).not.toHaveTextContent('Downtown Clinic');
      expect(await facilityPicker()).toHaveAttribute('placeholder', 'Add a service facility');
    });

    test('a service facility linked both by another system and here is listed once, locked', async () => {
      await setup(drSmith, [], [role('own', [downtown], { own: true }), role('theirs', [downtown], { linked: true })]);

      expect(await linkedFacilities()).toHaveLength(1);
      expect(chips()).not.toHaveTextContent('Downtown Clinic');
    });

    test('beside a linked service facility, removing the last other one does not ask', async () => {
      const { medplum, onSynced } = await setup(
        drSmith,
        [],
        [role('theirs', [downtown], { linked: true }), role('own', [northside], { own: true })]
      );

      await removeFacility('Northside');
      await saveNow();

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      expect(sentRoles(medplum)?.map((item) => item.resource)).toMatchObject([{ id: 'own', active: false }]);
    });

    test('says so when the roles cannot be read', async () => {
      const medplum = new MockClient({ seedDefaultData: false });
      for (const resource of [downtown, northside, ...services, drSmith]) {
        await medplum.createResource(resource);
      }
      vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('Access denied'));
      renderWithMedplum(
        <ActorPage actor={{ resource: drSmith, schedules: [] }} services={services} onSynced={vi.fn()} />,
        medplum
      );

      expect(await screen.findByText(/Service facilities could not be loaded/)).toHaveTextContent('Access denied');
    });

    test('a role another user changed since it was loaded is not written over, and reload discards the draft', async () => {
      const { medplum, onSynced } = await setup(drSmith, [], [role('own', [northside, downtown], { own: true })]);
      await removeFacility('Northside');
      const changed = await medplum.readResource('PractitionerRole', 'own');
      await medplum.updateResource({ ...changed, location: [{ reference: 'Location/downtown' }] });

      await saveNow();

      expect(
        await screen.findByText('The service facilities for Dr. Jane Smith changed since you opened it')
      ).toBeInTheDocument();
      expect(onSynced).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      });

      await waitFor(() => expect(saveBar()).toBeNull());
      expect(await findChips(['Downtown Clinic'])).not.toHaveTextContent('Northside');
    });

    test('saving a first service facility asks, then creates the workspace role holding only its identifier, the practitioner, and that location', async () => {
      const { medplum, onSynced } = await setup(drSmith);
      vi.spyOn(medplum, 'deleteResource');

      await add('Northside');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await saveNow();
      await confirm('Offer Dr. Jane Smith only at Northside?');

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      const [sent] = sentRoles(medplum) ?? [];
      expect(sent.request).toEqual({
        method: 'POST',
        url: 'PractitionerRole',
        ifNoneExist: `identifier=${SERVICE_FACILITY_ROLE_SYSTEM}|dr-smith`,
      });
      expect(Object.keys(sent.resource as PractitionerRole).sort()).toEqual([
        'active',
        'identifier',
        'location',
        'practitioner',
        'resourceType',
      ]);
      expect(sent.resource).toMatchObject({
        identifier: [{ system: SERVICE_FACILITY_ROLE_SYSTEM, value: 'dr-smith' }],
        practitioner: { reference: 'Practitioner/dr-smith' },
        location: [{ reference: 'Location/northside' }],
        active: true,
      });
      expectNothingDeleted(medplum);
    });

    test('cancelling the question on save writes nothing and keeps the edit', async () => {
      const { medplum } = await setup(drSmith);

      await add('Northside');
      await saveNow();
      const dialog = await screen.findByRole('dialog', { name: 'Offer Dr. Jane Smith only at Northside?' });
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      });

      expect(medplum.executeBatch).not.toHaveBeenCalled();
      expect(chips()).toHaveTextContent('Northside');
      expect(saveBar()).not.toBeNull();
    });

    test('adding a service facility turns an inactive workspace role back on rather than creating another', async () => {
      const { medplum, onSynced } = await setup(drSmith, [], [role('own', [northside], { own: true, active: false })]);
      const stored = await medplum.readResource('PractitionerRole', 'own');

      await add('Northside');
      await saveNow();
      await confirm('Offer Dr. Jane Smith only at Northside?');

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      const [sent, ...rest] = sentRoles(medplum) ?? [];
      expect(rest).toEqual([]);
      expect(sent.request).toEqual({
        method: 'PUT',
        url: 'PractitionerRole/own',
        ifMatch: `W/"${stored.meta?.versionId}"`,
      });
      expect(sent.resource).toMatchObject({ id: 'own', active: true, location: [{ reference: 'Location/northside' }] });
    });

    test('beside a linked service facility, adding one does not ask', async () => {
      const { medplum, onSynced } = await setup(drSmith, [], [role('theirs', [downtown], { linked: true })]);

      await add('Northside');
      await saveNow();

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      expect(sentRoles(medplum)?.map((item) => item.resource)).toMatchObject([
        { location: [{ reference: 'Location/northside' }] },
      ]);
    });

    test('picking a linked service facility changes nothing', async () => {
      await setup(drSmith, [], [role('theirs', [downtown], { linked: true })]);

      await add('Downtown Clinic');
      await settleAutocomplete();

      expect(chips()).not.toHaveTextContent('Downtown Clinic');
      expect(saveBar()).toBeNull();
    });

    test('role writes join the Schedule in one bundle', async () => {
      const { medplum, onSynced, schedules } = await setup(
        drSmith,
        [makeSchedule('Practitioner/dr-smith', [initialVisit])],
        [role('r1', [downtown])]
      );

      await act(async () => {
        fireEvent.click(screen.getByRole('switch', { name: 'Schedule status' }));
      });
      await add('Northside');
      await saveNow();

      await waitFor(() => expect(onSynced).toHaveBeenCalled());
      expect(medplum.executeBatch).toHaveBeenCalledTimes(1);
      expect(sentBundle(medplum).entry?.map((item) => item.request?.url)).toEqual([
        `Schedule/${schedules[0].id}`,
        'PractitionerRole',
      ]);
    });
  });
});
