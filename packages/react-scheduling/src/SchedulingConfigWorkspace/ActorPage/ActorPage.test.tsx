// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  getScheduleSchedulingParameters,
  serviceTypeIncludesService,
  TimezoneExtensionURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { Bundle, HealthcareService, Location, Practitioner, Resource, Schedule } from '@medplum/fhirtypes';
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
import { renderWithMedplum, screen, userEvent, waitFor, within } from '../../test-utils/render';
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

describe('ActorPage', () => {
  test("a provider's page shows General and Visit types, with every visit type closed to its summary", async () => {
    await setup(drSmith, [calendar('Practitioner/dr-smith', [initialVisit, followUp])]);

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'General',
      'Visit types',
    ]);
    expect(entry('Initial Visit')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Follow-up')).toHaveAttribute('aria-expanded', 'false');
    expect(entry('Initial Visit')).toHaveTextContent('60 min · Mon 9:00 AM–5:00 PM');
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
});
