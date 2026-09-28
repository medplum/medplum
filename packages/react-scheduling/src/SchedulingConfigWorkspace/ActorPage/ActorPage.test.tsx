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
  for (const resource of [downtown, northside, ...services, ...extra]) {
    await medplum.createResource(resource);
  }
  // Loaded as stored, with its version, as the workspace hands it over.
  const storedActor = await medplum.createResource(actor);
  const stored: WithId<Schedule>[] = [];
  for (const schedule of schedules) {
    stored.push(await medplum.createResource(schedule));
  }
  const onStored = vi.fn();
  vi.spyOn(medplum, 'executeBatch');
  const configurable: ConfigurableActor = { resource: storedActor, schedules: stored };
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

function general(): HTMLElement {
  return screen.getByRole('region', { name: 'General' });
}

function timezoneField(): HTMLElement {
  return within(general()).getByRole('textbox', { name: 'Time zone' });
}

function pickTimezone(zone: string): void {
  fireEvent.focus(timezoneField());
  fireEvent.change(timezoneField(), { target: { value: zone } });
  fireEvent.click(screen.getByText(zone));
}

function sentResources(medplum: MockClient, call = 0): Resource[] {
  return vi.mocked(medplum.executeBatch).mock.calls[call][0].entry?.map((item) => item.resource as Resource) ?? [];
}

async function openOfferMenu(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Offer a visit type' }));
  await waitFor(() => expect(screen.queryByLabelText('Checking service facilities')).not.toBeInTheDocument());
}

describe('ActorPage', () => {
  test("a provider's page shows General and Visit types, with every visit type closed to its summary", async () => {
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
          "No time zone is set, so these hours can't be booked. Set one in Time zone above, on Walk-in, or under General for Dr. Jane Smith."
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

  describe('General', () => {
    const drSmithSynced: WithId<Practitioner> = {
      ...drSmith,
      active: true,
      address: [{ state: 'IL' }, { state: 'WI' }],
      extension: [{ url: 'http://example.org/source', valueString: 'kept' }],
    };

    test("a provider's time zone is its only field, and saving it sends the extension and nothing else", async () => {
      const { medplum, onStored } = await setup(drSmithSynced, [calendar('Practitioner/dr-smith', [initialVisit])]);
      const stored = await medplum.readResource('Practitioner', 'dr-smith');

      expect(within(general()).queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
      pickTimezone('America/Chicago');
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
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
      expect(timezoneField()).toHaveValue('America/Chicago');
      expect(saveBar()).toBeNull();
    });

    test("the provider's time zone is read for hours as soon as it is set, before it is saved", async () => {
      const walkIn: WithId<HealthcareService> = { resourceType: 'HealthcareService', id: 'walk-in', name: 'Walk-in' };
      services.push(walkIn);
      try {
        await setup(drSmith, [calendar('Practitioner/dr-smith', [walkIn])]);
        expect(within(panel('Walk-in')).getByText(/No time zone is set/)).toBeVisible();

        pickTimezone('America/Chicago');

        await waitFor(() =>
          expect(within(panel('Walk-in')).getByText('The time zone comes from Dr. Jane Smith.')).toBeVisible()
        );
      } finally {
        services.pop();
      }
    });

    test('a room is retired by turning Active off, and nothing deletes it', async () => {
      const { medplum, onStored } = await setup(room3, [calendar('Location/room-3', [initialVisit])]);
      const remove = vi.spyOn(medplum, 'deleteResource');

      expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument();
      await userEvent.click(within(general()).getByRole('switch', { name: 'Active' }));
      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalled());
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
        const { medplum, onStored } = await setup(unplaced);

        await pick('Service facility', 'Downtown Clinic');
        await saveNow();

        await waitFor(() => expect(onStored).toHaveBeenCalled());
        expect((sentResources(medplum)[0] as Location).partOf?.reference).toBe('Location/downtown');
      });

      test("a device's name and location are stored on the Device", async () => {
        const device: WithId<Device> = {
          resourceType: 'Device',
          id: 'ultrasound-2',
          deviceName: [{ name: 'US-2000', type: 'model-name' }],
        };
        const { medplum, onStored } = await setup(device);

        fireEvent.change(within(general()).getByRole('textbox', { name: /Name/ }), {
          target: { value: 'Ultrasound 2' },
        });
        await pick('Location', 'Northside');
        await saveNow();

        await waitFor(() => expect(onStored).toHaveBeenCalled());
        const sent = sentResources(medplum)[0] as Device;
        expect(sent.deviceName?.[0]).toEqual({ name: 'Ultrasound 2', type: 'user-friendly-name' });
        expect(sent.location?.reference).toBe('Location/northside');
      });

      test('moving a room away from where an offered visit type is held marks it as not bookable, and keeps it offered', async () => {
        const atNorthside = { ...room3, partOf: { reference: 'Location/northside', display: 'Northside' } };
        await setup(atNorthside, [calendar('Location/room-3', [cystoscopy])]);
        await settleAutocomplete();
        expect(entry('Cystoscopy')).not.toHaveTextContent("Can't be booked");

        await removePill('Northside');
        await pick('Service facility', 'Downtown Clinic');
        await settleAutocomplete();

        expect(entry('Cystoscopy')).toHaveTextContent("Can't be booked");
        expect(
          within(panel('Cystoscopy')).getByText("Can't be booked here: Cystoscopy isn't held at Downtown Clinic.")
        ).toBeVisible();
        expect(saveBar()).not.toBeNull();
      });

      describe('creating', () => {
        async function setupNew(
          newActorType: 'Location' | 'Device'
        ): Promise<Pick<Setup, 'medplum' | 'onStored'> & { onDiscardNew: ReturnType<typeof vi.fn> }> {
          const medplum = new MockClient({ seedDefaultData: false });
          for (const resource of [downtown, northside, ...services]) {
            await medplum.createResource(resource);
          }
          const onStored = vi.fn();
          const onDiscardNew = vi.fn();
          vi.spyOn(medplum, 'executeBatch');
          renderWithMedplum(
            <ActorPage
              newActorType={newActorType}
              services={services}
              onStored={onStored}
              onDiscardNew={onDiscardNew}
            />,
            medplum
          );
          return { medplum, onStored, onDiscardNew };
        }

        test('a new room says it is not saved yet, and offers no visit types until it is created', async () => {
          await setupNew('Location');

          expect(screen.getByText('New room')).toBeInTheDocument();
          expect(screen.getByText('Not saved yet')).toBeInTheDocument();
          expect(screen.getByText('Visit types can be offered once this room is created.')).toBeInTheDocument();
          expect(screen.queryByRole('button', { name: 'Offer a visit type' })).not.toBeInTheDocument();
          expect(screen.queryByRole('switch', { name: 'Accepting appointments' })).not.toBeInTheDocument();
        });

        test('creating a room stores an active Location typed as a room, at the service facility picked', async () => {
          const { medplum, onStored } = await setupNew('Location');

          fireEvent.change(within(general()).getByRole('textbox', { name: /Name/ }), { target: { value: 'Room 9' } });
          await pick('Service facility', 'Downtown Clinic');
          await saveNow();

          await waitFor(() => expect(onStored).toHaveBeenCalled());
          expect(sentBundle(medplum).entry?.map((item) => item.request)).toEqual([{ method: 'POST', url: 'Location' }]);
          const created = onStored.mock.calls[0][0][0] as WithId<Location>;
          expect(created).toMatchObject({
            name: 'Room 9',
            status: 'active',
            partOf: { reference: 'Location/downtown' },
          });
          expect(created.physicalType?.coding?.map((coding) => coding.code)).toEqual(['ro']);
        });

        test('creating a device stores an active Device with its name', async () => {
          const { medplum, onStored } = await setupNew('Device');

          expect(screen.getByText('New device')).toBeInTheDocument();
          fireEvent.change(within(general()).getByRole('textbox', { name: /Name/ }), {
            target: { value: 'Ultrasound 4' },
          });
          await saveNow();

          await waitFor(() => expect(onStored).toHaveBeenCalled());
          expect(sentBundle(medplum).entry?.[0].request).toEqual({ method: 'POST', url: 'Device' });
          expect(onStored.mock.calls[0][0][0]).toMatchObject({
            status: 'active',
            deviceName: [{ name: 'Ultrasound 4', type: 'user-friendly-name' }],
          });
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

  describe('saving the provider and the calendar together', () => {
    async function editBoth(): Promise<Setup> {
      const result = await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit])]);
      pickTimezone('America/Chicago');
      await userEvent.type(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter'), '15');
      return result;
    }

    test('a refused transaction changes neither, keeps every edit, and shows the reason', async () => {
      const { medplum, onStored } = await editBoth();
      vi.mocked(medplum.executeBatch).mockRejectedValueOnce(
        new OperationOutcomeError(badRequest('Rejected by policy'))
      );

      await save();

      expect(await screen.findByText('Rejected by policy')).toBeInTheDocument();
      expect(sentResources(medplum).map((resource) => resource.resourceType)).toEqual(['Practitioner', 'Schedule']);
      expect(onStored).not.toHaveBeenCalled();
      expect(timezoneField()).toHaveValue('America/Chicago');
      expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toHaveValue('15 min');
      expect(saveBar()).not.toBeNull();
    });

    test('applied as a batch, keeps the time zone that landed, and the calendar edits that did not', async () => {
      const { medplum, onStored } = await editBoth();
      vi.mocked(medplum.executeBatch).mockImplementationOnce(async (bundle) => {
        const practitioner = await medplum.updateResource(bundle.entry?.[0].resource as WithId<Practitioner>);
        return {
          resourceType: 'Bundle',
          type: 'batch-response',
          entry: [
            { resource: practitioner, response: { status: '200' } },
            { response: { status: '400', outcome: badRequest('Calendar refused') } },
          ],
        };
      });

      await save();

      expect(
        await screen.findByRole('alert', { name: 'The calendar for Dr. Jane Smith was not saved' })
      ).toHaveTextContent('Calendar refused');
      expect(onStored.mock.calls[0][0].map((resource: Resource) => resource.resourceType)).toEqual(['Practitioner']);
      expect(timezoneField()).toHaveValue('America/Chicago');
      expect(within(panel('Initial Visit')).getByTestId('scheduling-parameters-bufferAfter')).toHaveValue('15 min');

      await save();

      await waitFor(() => expect(onStored).toHaveBeenCalledTimes(2));
      expect(sentResources(medplum, 1).map((resource) => resource.resourceType)).toEqual(['Schedule']);
      expect(saveBar()).toBeNull();
    });

    test('a provider an external sync changed since it was loaded is not written over, and can be reloaded', async () => {
      const { medplum, onStored } = await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit])]);
      const stored = await medplum.readResource('Practitioner', 'dr-smith');
      await medplum.updateResource({ ...stored, name: [{ given: ['Janet'], family: 'Smith' }] });

      pickTimezone('America/Chicago');
      await save();

      expect(await screen.findByText('Dr. Jane Smith changed since you opened it')).toBeInTheDocument();
      expect(onStored).not.toHaveBeenCalled();
      const current = await medplum.readResource('Practitioner', 'dr-smith');
      expect(current.extension).toBeUndefined();

      await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

      await waitFor(() => expect(onStored).toHaveBeenCalled());
      expect(within(general()).getByText('Janet Smith')).toBeInTheDocument();
      expect(timezoneField()).toHaveValue('');
      expect(saveBar()).toBeNull();
    });
  });
});
