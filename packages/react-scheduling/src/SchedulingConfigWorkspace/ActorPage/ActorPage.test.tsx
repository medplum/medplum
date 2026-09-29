// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  getScheduleSchedulingParameters,
  serviceTypeIncludesService,
  TimezoneExtensionURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type {
  Bundle,
  HealthcareService,
  Location,
  Practitioner,
  PractitionerRole,
  Resource,
  Schedule,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { setScheduleAvailability } from '../../availability';
import type { ConfigurableActor, ConfigurableActorResource } from '../../configSearch';
import {
  getScheduleSchedulingParameterValues,
  setHealthcareServiceSchedulingParameterValues,
  setScheduleSchedulingParameterValues,
} from '../../parameterValues';
import {
  installAutocompleteTimers,
  pillRemoveButton,
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

function calendar(
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
  readonly onStored: ReturnType<typeof vi.fn>;
  readonly schedules: WithId<Schedule>[];
}

async function setup(
  actor: ConfigurableActorResource,
  schedules: Schedule[] = [],
  extra: Resource[] = [],
  initialOpenServiceId?: string
): Promise<Setup> {
  const medplum = new MockClient({ seedDefaultData: false });
  for (const resource of [downtown, northside, ...services, actor, ...extra]) {
    await medplum.createResource(resource);
  }
  const stored: WithId<Schedule>[] = [];
  for (const schedule of schedules) {
    stored.push(await medplum.createResource(schedule));
  }
  const onStored = vi.fn();
  vi.spyOn(medplum, 'executeBatch');
  const configurable: ConfigurableActor = { resource: actor, schedules: stored };
  renderWithMedplum(
    <ActorPage
      actor={configurable}
      services={services}
      onStored={onStored}
      initialOpenServiceId={initialOpenServiceId}
    />,
    medplum
  );
  return { medplum, onStored, schedules: stored };
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

function storedSchedule(onStored: Setup['onStored']): WithId<Schedule> {
  return onStored.mock.calls.at(-1)?.[0].find((resource: Resource) => resource.resourceType === 'Schedule');
}

async function openOfferMenu(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Offer a visit type' }));
  await waitFor(() => expect(screen.queryByLabelText('Checking service facilities')).not.toBeInTheDocument());
}

function role(
  id: string,
  locations: WithId<Location>[],
  options: { active?: boolean; linked?: boolean } = {}
): WithId<PractitionerRole> {
  return {
    resourceType: 'PractitionerRole',
    id,
    practitioner: { reference: 'Practitioner/dr-smith' },
    location: locations.map((location) => ({ reference: `Location/${location.id}` })),
    ...(options.active !== undefined && { active: options.active }),
    ...(options.linked && { identifier: [{ system: 'http://example.org/provider-location-link', value: id }] }),
  };
}

async function facilityPicker(): Promise<HTMLElement> {
  return screen.findByRole('searchbox', { name: 'Service facilities' });
}

function facilityPickerNow(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Service facilities' });
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
  await act(async () => {
    fireEvent.click(pillRemoveButton(name));
  });
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
  test("a provider's page shows General and Visit types offered, with every visit type closed to its summary", async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'General',
      'Visit types offered',
    ]);
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Initial Visit')).toHaveTextContent('60 min · Mon 9:00 AM–5:00 PM');
  });

  test('marks a visit type the calendar customizes, naming what it overrides, and follows edits', async () => {
    const overriding = setScheduleAvailability(
      setScheduleSchedulingParameterValues(calendar('Practitioner/dr-smith', [initialVisit, followUp]), initialVisit, {
        bufferAfter: 10,
      }),
      initialVisit,
      [{ daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' }]
    );
    await setup(drSmith, [overriding]);

    expect(within(entry('Initial Visit')).getByText('Customized')).toHaveTextContent(
      'Overrides buffer after and custom hours. Everything else follows Initial Visit.'
    );
    expect(within(entry('Follow-up')).queryByText('Customized')).not.toBeInTheDocument();

    await userEvent.click(entry('Follow-up'));
    await userEvent.type(within(panel('Follow-up')).getByTestId('scheduling-parameters-bufferAfter'), '15');

    expect(within(entry('Follow-up')).getByText('Customized')).toHaveTextContent('Overrides buffer after.');
  });

  test('a calendar offering one visit type opens its entry', async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit])]);

    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel('Initial Visit')).getByRole('heading', { name: 'Scheduling parameters' })).toBeVisible();
    expect(within(panel('Initial Visit')).getByRole('heading', { name: 'Availability' })).toBeVisible();
  });

  test('a room with no calendar offers nothing yet, offers to add one, and has no Accepting appointments switch', async () => {
    await setup(room3);

    expect(screen.getByText('Room 3 offers no visit types yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offer a visit type' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Accepting appointments' })).not.toBeInTheDocument();
  });

  test("a provider's name and status are read-only, and an inactive provider's calendar stays editable", async () => {
    await setup({ ...drSmith, active: false }, [calendar('Practitioner/dr-smith', [initialVisit])]);

    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Active/ })).not.toBeInTheDocument();
    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toBeEnabled();
  });

  test('turning off bookings saves Schedule.active false, and every field stays editable', async () => {
    const { onStored } = await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit])]);

    await userEvent.click(screen.getByRole('switch', { name: 'Accepting appointments' }));

    expect(
      screen.getByText("Dr. Jane Smith can't be booked while this is off. Everything below can still be edited.")
    ).toBeInTheDocument();
    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toBeEnabled();
    await save();

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(storedSchedule(onStored).active).toBe(false);
  });

  test('saving the calendar sends only the Schedule, conditional on the version loaded', async () => {
    const { medplum, onStored, schedules } = await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit])]);

    await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');
    await save();

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    const bundle = sentBundle(medplum);
    expect(bundle.entry?.map((item) => item.request)).toEqual([
      { method: 'PUT', url: `Schedule/${schedules[0].id}`, ifMatch: `W/"${schedules[0].meta?.versionId}"` },
    ]);
    expect(getScheduleSchedulingParameterValues(storedSchedule(onStored), initialVisit).bufferAfter).toBe(15);
  });

  test('opening another visit type closes the open one, and edits to either survive the switch', async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);

    await userEvent.click(entry('Initial Visit'));
    await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');
    await userEvent.click(entry('Follow-up'));

    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'true');
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Initial Visit')).toHaveTextContent('Unsaved changes');
    expect(entry('Follow-up')).not.toHaveTextContent('Unsaved changes');

    await userEvent.click(entry('Initial Visit'));
    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toHaveValue('15 min');
  });

  test('closing the open entry leaves every entry closed, and keeps its edits', async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);
    await userEvent.click(entry('Initial Visit'));
    await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');

    await userEvent.click(entry('Initial Visit'));

    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Initial Visit')).toHaveTextContent('Unsaved changes');
    expect(saveBar()).toBeInTheDocument();
  });

  test('a visit type just offered opens, and closes the one that was open', async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);
    await userEvent.click(entry('Initial Visit'));

    await openOfferMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cystoscopy' }));

    expect(entry('Cystoscopy')).toHaveAttribute('aria-expanded', 'true');
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
  });

  test('discarding a visit type just offered leaves every entry closed', async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);
    await openOfferMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cystoscopy' }));

    await userEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));

    expect(screen.queryByRole('button', { name: /^Cystoscopy/ })).not.toBeInTheDocument();
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
  });

  test('opens on the visit type it was asked to', async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])], [], followUp.id);

    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'true');
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
  });

  test('a first visit type for a room creates one active Schedule held by the room alone', async () => {
    const { medplum, onStored } = await setup(room3);

    await openOfferMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Initial Visit' }));
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'true');
    expect(medplum.executeBatch).not.toHaveBeenCalled();
    await save();

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(sentBundle(medplum).entry?.[0].request).toEqual({ method: 'POST', url: 'Schedule' });
    const created = storedSchedule(onStored);
    expect(created.active).toBe(true);
    expect(created.actor).toEqual([expect.objectContaining({ reference: 'Location/room-3' })]);
    expect(serviceTypeIncludesService(created.serviceType, initialVisit)).toBe(true);
  });

  test('discarding a first offering writes nothing and leaves the room without a calendar', async () => {
    const { medplum } = await setup(room3);

    await openOfferMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Initial Visit' }));
    await userEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));

    expect(screen.getByText('Room 3 offers no visit types yet.')).toBeInTheDocument();
    expect(saveBar()).toBeNull();
    expect(medplum.executeBatch).not.toHaveBeenCalled();
  });

  test('offers only active visit types, and says when every one is already offered', async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);

    await openOfferMenu();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Cystoscopy']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cystoscopy' }));

    expect(
      screen.getByText('There is nothing more to offer: every active visit type is offered here.')
    ).toBeInTheDocument();
  });

  test("lists a visit type held away from a room's service facility as disabled, saying why", async () => {
    await setup(room3);

    await openOfferMenu();

    expect(screen.getByRole('menuitem', { name: /Initial Visit/ })).toBeEnabled();
    const held = screen.getByRole('menuitem', { name: /Cystoscopy/ });
    expect(held).toBeDisabled();
    expect(held).toHaveTextContent("Cystoscopy isn't held at Downtown Clinic");
  });

  test('the offer button is ready at once, and only visit types held somewhere wait on where the actor is', async () => {
    const medplum = new MockClient({ seedDefaultData: false });
    for (const resource of [downtown, northside, ...services, drSmith]) {
      await medplum.createResource(resource);
    }
    vi.spyOn(medplum, 'searchResources').mockReturnValue(new Promise(() => {}) as never);
    renderWithMedplum(
      <ActorPage actor={{ resource: drSmith, schedules: [] }} services={services} onStored={vi.fn()} />,
      medplum
    );

    const button = screen.getByRole('button', { name: 'Offer a visit type' });
    expect(button).not.toHaveAttribute('data-loading');
    await userEvent.click(button);

    expect(screen.getByRole('menuitem', { name: /Initial Visit/ })).toBeEnabled();
    const held = screen.getByRole('menuitem', { name: /Cystoscopy/ });
    expect(held).toBeDisabled();
    expect(within(held).getByLabelText('Checking service facilities')).toBeInTheDocument();
  });

  test('a provider with no service facilities can be offered every active visit type', async () => {
    await setup(drSmith);

    await openOfferMenu();

    expect(screen.getAllByRole('menuitem').every((item) => !item.hasAttribute('disabled'))).toBe(true);
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  test("an offered visit type the room's service facility doesn't hold is marked as not bookable", async () => {
    await setup(room3, [calendar('Location/room-3', [cystoscopy])]);

    await waitFor(() => expect(entry('Cystoscopy')).toHaveTextContent("Can't be booked"));
    expect(
      within(panel('Cystoscopy')).getByText("Can't be booked here: Cystoscopy isn't held at Downtown Clinic.")
    ).toBeVisible();
  });

  test('moving a room away from where an offered visit type is held marks it as not bookable, and keeps it offered', async () => {
    const medplum = new MockClient({ seedDefaultData: false });
    for (const resource of [downtown, northside, ...services]) {
      await medplum.createResource(resource);
    }
    const atNorthside = await medplum.createResource<Location>({
      ...room3,
      partOf: { reference: 'Location/northside' },
    });
    const schedule = await medplum.createResource(calendar('Location/room-3', [cystoscopy]));
    const heldDowntown: WithId<HealthcareService> = {
      resourceType: 'HealthcareService',
      id: 'ultrasound',
      name: 'Ultrasound',
      location: [{ reference: 'Location/downtown' }],
    };
    const page = (resource: WithId<Location>): ReactNode => (
      <ActorPage
        actor={{ resource, schedules: [schedule] }}
        services={[...services, heldDowntown]}
        onStored={vi.fn()}
      />
    );
    const { rerender } = renderWithMedplum(page(atNorthside), medplum);
    await openOfferMenu();
    expect(screen.getByRole('menuitem', { name: /Ultrasound/ })).toHaveTextContent("isn't held at Northside");
    await userEvent.keyboard('{Escape}');
    expect(entry('Cystoscopy')).not.toHaveTextContent("Can't be booked");

    rerender(page({ ...atNorthside, partOf: { reference: 'Location/downtown' } }));

    await waitFor(() => expect(entry('Cystoscopy')).toHaveTextContent("Can't be booked"));
    expect(
      within(panel('Cystoscopy')).getByText("Can't be booked here: Cystoscopy isn't held at Downtown Clinic.")
    ).toBeVisible();
  });

  test('stopping a visit type asks first, naming the overrides lost, then drops it and every override for it', async () => {
    const withOverrides = setScheduleAvailability(
      setScheduleSchedulingParameterValues(calendar('Practitioner/dr-smith', [initialVisit, followUp]), initialVisit, {
        bufferAfter: 10,
      }),
      initialVisit,
      [{ daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' }]
    );
    const { onStored } = await setup(drSmith, [withOverrides]);
    await userEvent.click(entry('Initial Visit'));

    await userEvent.click(
      await within(panel('Initial Visit')).findByRole('button', { name: 'Stop offering Initial Visit' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Stop offering Initial Visit?' });
    expect(dialog).toHaveTextContent('Buffer after, custom hours');
    expect(dialog).toHaveTextContent("Existing appointments aren't changed.");
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop offering' }));

    expect(screen.queryByRole('button', { name: /^Initial Visit/ })).not.toBeInTheDocument();
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
    await save();

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    const saved = storedSchedule(onStored);
    expect(serviceTypeIncludesService(saved.serviceType, initialVisit)).toBe(false);
    expect(getScheduleSchedulingParameters(saved, initialVisit, 'bufferAfter')).toEqual([]);
    expect(getScheduleSchedulingParameters(saved, initialVisit, 'availability')).toEqual([]);
  });

  test('stopping a visit type and offering it again saves nothing, and leaves the page clean', async () => {
    const { medplum, onStored } = await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);
    await userEvent.click(entry('Initial Visit'));
    await userEvent.click(
      await within(panel('Initial Visit')).findByRole('button', { name: 'Stop offering Initial Visit' })
    );
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Stop offering Initial Visit?' })).getByRole('button', {
        name: 'Stop offering',
      })
    );
    await openOfferMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Initial Visit' }));
    expect(saveBar()).not.toBeNull();

    await save();

    await waitFor(() => expect(saveBar()).toBeNull());
    expect(medplum.executeBatch).not.toHaveBeenCalled();
    expect(onStored).not.toHaveBeenCalled();
  });

  test('keeping a visit type from the confirmation changes nothing', async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit])]);

    await userEvent.click(within(panel('Initial Visit')).getByRole('button', { name: 'Stop offering Initial Visit' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Keep offering' }));

    expect(entry('Initial Visit')).toBeInTheDocument();
    expect(saveBar()).toBeNull();
  });

  test("custom hours start from the visit type's, and save as this calendar's hours for it", async () => {
    const { onStored } = await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit])]);
    const initial = panel('Initial Visit');

    await userEvent.click(within(initial).getByTestId('schedule-availability-enable'));

    expect(within(initial).getByTestId('schedule-availability-switch-mon')).toBeChecked();
    expect(within(initial).getByTestId('schedule-availability-switch-tue')).not.toBeChecked();
    await userEvent.click(within(initial).getByTestId('schedule-availability-switch-tue'));
    await save();

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(getScheduleSchedulingParameters(storedSchedule(onStored), initialVisit, 'availability')).toHaveLength(1);
  });

  test("going back to the visit type's hours leaves no hours override", async () => {
    const overriding = setScheduleAvailability(calendar('Practitioner/dr-smith', [initialVisit]), initialVisit, [
      { daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' },
    ]);
    const { onStored } = await setup(drSmith, [overriding]);

    await userEvent.click(within(panel('Initial Visit')).getByTestId('schedule-availability-enable'));
    await save();

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(getScheduleSchedulingParameters(storedSchedule(onStored), initialVisit, 'availability')).toEqual([]);
  });

  test('an emptied custom week blocks the save, with the reason', async () => {
    const overriding = setScheduleAvailability(calendar('Practitioner/dr-smith', [initialVisit]), initialVisit, [
      { daysOfWeek: ['tue'], availableStartTime: '08:00:00', availableEndTime: '12:00:00' },
    ]);
    const { medplum } = await setup(drSmith, [overriding]);

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
      calendar('Practitioner/dr-smith', [initialVisit]),
      initialVisit,
      {
        alignmentInterval: 30,
      }
    );
    await setup(drSmith, [aligned]);

    expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-alignmentInterval')).toHaveValue('30 min');
  });

  test('names where the time zone comes from', async () => {
    const walkIn: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'walk-in', name: 'Walk-in' };
    services.push(walkIn);
    try {
      await setup({ ...drSmith, extension: [{ url: TimezoneExtensionURI, valueCode: 'America/Chicago' }] }, [
        calendar('Practitioner/dr-smith', [initialVisit, walkIn]),
      ]);
      await userEvent.click(entry('Initial Visit'));

      await waitFor(() =>
        expect(within(panel('Initial Visit')).getByText('The time zone comes from Initial Visit.')).toBeVisible()
      );

      await userEvent.click(entry('Walk-in'));
      await waitFor(() =>
        expect(within(panel('Walk-in')).getByText('The time zone comes from Dr. Jane Smith.')).toBeVisible()
      );
    } finally {
      services.pop();
    }
  });

  test('warns that hours cannot be booked when no time zone resolves, and says where to set one', async () => {
    const walkIn: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'walk-in', name: 'Walk-in' };
    services.push(walkIn);
    try {
      await setup(drSmith, [calendar('Practitioner/dr-smith', [walkIn])]);

      expect(
        within(panel('Walk-in')).getByText(
          "No time zone is set, so these hours can't be booked. Set one in Time zone above, on Walk-in, or on Dr. Jane Smith."
        )
      ).toBeVisible();
    } finally {
      services.pop();
    }
  });

  test('edits the first of two calendars and says nothing about the other', async () => {
    await setup(drSmith, [
      calendar('Practitioner/dr-smith', [initialVisit], 'first'),
      calendar('Practitioner/dr-smith', [followUp], 'second'),
    ]);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/calendar/)).not.toBeInTheDocument();
    expect(entry('Initial Visit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Follow-up/ })).not.toBeInTheDocument();
  });

  test('a calendar another system changed since it was loaded is not written over, and reload hands back the newer one', async () => {
    const { medplum, onStored, schedules } = await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit])]);
    await medplum.updateResource({ ...schedules[0], comment: 'Changed elsewhere' });

    await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');
    await save();

    expect(await screen.findByText('The calendar for Dr. Jane Smith changed since you opened it')).toBeInTheDocument();
    expect(onStored).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(onStored).toHaveBeenCalled());
    expect(storedSchedule(onStored).comment).toBe('Changed elsewhere');
  });

  describe('service facilities', () => {
    test('a provider with no active role is offered at every service facility', async () => {
      await setup(drSmith, [], [role('retired', [northside], { active: false })]);

      expect(await facilityPicker()).toHaveAttribute('placeholder', 'Offered at every service facility');
      expect(screen.queryByRole('list', { name: 'Linked by another system' })).not.toBeInTheDocument();
    });

    test('rooms and devices have no service facilities field', async () => {
      await setup(room3);

      expect(screen.queryByRole('searchbox', { name: 'Service facilities' })).not.toBeInTheDocument();
    });

    test('lists each service facility of the active roles once', async () => {
      await setup(
        drSmith,
        [],
        [role('r1', [downtown, northside]), role('r2', [downtown]), role('r3', [room3], { active: false })]
      );

      expect(await findChips(['Downtown Clinic', 'Northside'])).toBeInTheDocument();
      expect(chips()).not.toHaveTextContent('Room 3');
    });

    test('removing a service facility turns its role off on save, deleting nothing and writing nothing else', async () => {
      const { medplum, onStored } = await setup(drSmith, [], [role('r1', [northside]), role('r2', [downtown])]);
      vi.spyOn(medplum, 'deleteResource');
      const stored = await medplum.readResource('PractitionerRole', 'r1');

      await removeFacility('Northside');
      expect(chips()).not.toHaveTextContent('Northside');
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      expect(sentRoles(medplum)).toEqual([
        {
          resource: { ...stored, active: false },
          request: { method: 'PUT', url: 'PractitionerRole/r1', ifMatch: `W/"${stored.meta?.versionId}"` },
        },
      ]);
      expect(await medplum.readResource('PractitionerRole', 'r1', { cache: 'no-cache' })).toMatchObject({
        active: false,
      });
      expectNothingDeleted(medplum);
    });

    test('removing a service facility takes it off a role naming others', async () => {
      const { medplum, onStored } = await setup(drSmith, [], [role('r1', [downtown, northside])]);

      await removeFacility('Northside');
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      const [sent] = sentRoles(medplum) ?? [];
      expect(sent.resource).toMatchObject({ location: [{ reference: 'Location/downtown' }] });
      expect(sent.resource).not.toHaveProperty('active');
    });

    test('removing the last service facility asks first, then offers the provider everywhere', async () => {
      const { medplum, onStored } = await setup(drSmith, [], [role('r1', [northside])]);

      await removeFacility('Northside');
      const dialog = await screen.findByRole('dialog', { name: 'Offer Dr. Jane Smith at every service facility?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Offer everywhere' }));
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      expect(sentRoles(medplum)?.[0].resource).toMatchObject({ id: 'r1', active: false });
    });

    test('a save changing only roles leaves the page clean, showing what was stored', async () => {
      const { onStored } = await setup(drSmith, [], [role('r1', [northside]), role('r2', [downtown])]);

      await removeFacility('Northside');
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      expect(onStored.mock.calls[0][0].map((resource: Resource) => resource.resourceType)).toEqual([
        'PractitionerRole',
      ]);
      await waitFor(() => expect(saveBar()).toBeNull());
      expect(await findChips(['Downtown Clinic'])).not.toHaveTextContent('Northside');
    });

    test('Discard puts a removed service facility back', async () => {
      await setup(drSmith, [], [role('r1', [northside]), role('r2', [downtown])]);

      await removeFacility('Northside');
      await userEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Discard' }));

      expect(await findChips(['Downtown Clinic', 'Northside'])).toBeInTheDocument();
      expect(saveBar()).toBeNull();
    });

    test('a service facility linked by another system is listed apart from the field, locked', async () => {
      await setup(drSmith, [], [role('theirs', [downtown], { linked: true })]);

      expect(await linkedFacilities()).toEqual([
        "Downtown Clinic: Another system linked Downtown Clinic, so it can't be removed here.",
      ]);
      expect(chips()).not.toHaveTextContent('Downtown Clinic');
      expect(facilityPickerNow()).toHaveAttribute('placeholder', 'Add a service facility');
    });

    test('a service facility linked both by another system and here is listed once, locked', async () => {
      await setup(drSmith, [], [role('mine', [downtown]), role('theirs', [downtown], { linked: true })]);

      expect(await linkedFacilities()).toHaveLength(1);
      expect(chips()).not.toHaveTextContent('Downtown Clinic');
    });

    test('beside a linked service facility, removing the last other one does not ask', async () => {
      const { medplum, onStored } = await setup(
        drSmith,
        [],
        [role('theirs', [downtown], { linked: true }), role('r1', [northside])]
      );

      await removeFacility('Northside');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      expect(sentRoles(medplum)?.map((item) => item.resource)).toMatchObject([{ id: 'r1', active: false }]);
    });

    test('removing a service facility marks a visit type held only there as not bookable, and keeps it offered', async () => {
      await setup(
        drSmith,
        [calendar('Practitioner/dr-smith', [cystoscopy])],
        [role('r1', [downtown]), role('r2', [northside])]
      );
      await findChips(['Northside']);
      expect(entry('Cystoscopy')).not.toHaveTextContent("Can't be booked");

      await removeFacility('Northside');

      expect(entry('Cystoscopy')).toHaveTextContent("Can't be booked");
      expect(
        within(panel('Cystoscopy')).getByText("Can't be booked here: Cystoscopy isn't held at Downtown Clinic.")
      ).toBeVisible();
      expect(saveBar()).not.toBeNull();
    });

    test('says so when the roles cannot be read, and still offers every visit type', async () => {
      const medplum = new MockClient({ seedDefaultData: false });
      for (const resource of [downtown, northside, ...services, drSmith]) {
        await medplum.createResource(resource);
      }
      vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('Access denied'));
      renderWithMedplum(
        <ActorPage actor={{ resource: drSmith, schedules: [] }} services={services} onStored={vi.fn()} />,
        medplum
      );

      expect(await screen.findByText(/Service facilities could not be loaded/)).toHaveTextContent('Access denied');
      await openOfferMenu();
      expect(screen.getByRole('menuitem', { name: /Cystoscopy/ })).toBeEnabled();
    });

    test('a role another user changed since it was loaded is not written over, and reload discards the draft', async () => {
      const { medplum, onStored } = await setup(drSmith, [], [role('r1', [northside]), role('r2', [downtown])]);
      await removeFacility('Northside');
      const changed = await medplum.readResource('PractitionerRole', 'r1');
      await medplum.updateResource({ ...changed, location: [{ reference: 'Location/downtown' }] });

      await save();

      expect(
        await screen.findByText('The service facilities for Dr. Jane Smith changed since you opened them')
      ).toBeInTheDocument();
      expect(onStored).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

      await waitFor(() => expect(saveBar()).toBeNull());
      expect(await findChips(['Downtown Clinic'])).not.toHaveTextContent('Northside');
    });

    describe('adding', () => {
      installAutocompleteTimers();

      async function add(name: string): Promise<void> {
        await typeInAutocomplete(await facilityPicker(), name.split(' ')[0]);
        // By role, since a linked service facility shows the same name outside the dropdown.
        const option = await screen.findByRole('option', { name: new RegExp(name) });
        await act(async () => {
          fireEvent.click(option);
        });
      }

      async function saveNow(): Promise<void> {
        await act(async () => {
          fireEvent.click(within(saveBar() as HTMLElement).getByRole('button', { name: 'Save' }));
        });
      }

      async function confirm(name: string): Promise<void> {
        const dialog = await screen.findByRole('dialog', { name });
        await act(async () => {
          fireEvent.click(within(dialog).getAllByRole('button').at(-1) as HTMLElement);
        });
      }

      test('adding a first service facility asks, then creates an active role holding only the practitioner and that location', async () => {
        const { medplum, onStored } = await setup(drSmith);
        vi.spyOn(medplum, 'deleteResource');

        await add('Northside');
        await confirm('Offer Dr. Jane Smith only at Northside?');
        expect(chips()).toHaveTextContent('Northside');
        await saveNow();

        await waitFor(() => expect(onStored).toHaveBeenCalled());
        const [sent] = sentRoles(medplum) ?? [];
        expect(sent.request).toEqual({ method: 'POST', url: 'PractitionerRole' });
        expect(Object.keys(sent.resource as PractitionerRole).sort()).toEqual([
          'active',
          'location',
          'practitioner',
          'resourceType',
        ]);
        expect(sent.resource).toMatchObject({
          practitioner: { reference: 'Practitioner/dr-smith' },
          location: [{ reference: 'Location/northside' }],
          active: true,
        });
        expectNothingDeleted(medplum);
      });

      test('cancelling the first service facility changes nothing', async () => {
        await setup(drSmith);

        await add('Northside');
        const dialog = await screen.findByRole('dialog', { name: 'Offer Dr. Jane Smith only at Northside?' });
        await act(async () => {
          fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        });
        await settleAutocomplete();

        expect(chips()).not.toHaveTextContent('Northside');
        expect(saveBar()).toBeNull();
      });

      test('adding a service facility back reactivates the inactive role for it', async () => {
        const { medplum, onStored } = await setup(drSmith, [], [role('r1', [northside], { active: false })]);
        const stored = await medplum.readResource('PractitionerRole', 'r1');

        await add('Northside');
        await confirm('Offer Dr. Jane Smith only at Northside?');
        await saveNow();

        await waitFor(() => expect(onStored).toHaveBeenCalled());
        expect(sentRoles(medplum)).toEqual([
          {
            resource: { ...stored, active: true },
            request: { method: 'PUT', url: 'PractitionerRole/r1', ifMatch: `W/"${stored.meta?.versionId}"` },
          },
        ]);
      });

      test('beside a linked service facility, adding one does not ask', async () => {
        const { medplum, onStored } = await setup(drSmith, [], [role('theirs', [downtown], { linked: true })]);

        await add('Northside');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await saveNow();

        await waitFor(() => expect(onStored).toHaveBeenCalled());
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

      test('role writes join the calendar in one bundle', async () => {
        const { medplum, onStored, schedules } = await setup(
          drSmith,
          [calendar('Practitioner/dr-smith', [initialVisit])],
          [role('r1', [downtown])]
        );

        await act(async () => {
          fireEvent.click(screen.getByRole('switch', { name: 'Accepting appointments' }));
        });
        await add('Northside');
        await saveNow();

        await waitFor(() => expect(onStored).toHaveBeenCalled());
        expect(medplum.executeBatch).toHaveBeenCalledTimes(1);
        expect(sentBundle(medplum).entry?.map((item) => item.request?.url)).toEqual([
          `Schedule/${schedules[0].id}`,
          'PractitionerRole',
        ]);
      });
    });
  });
});
