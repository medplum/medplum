// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import { SatelliteClinic, SchedulingFixtures, UltrasoundImagingService, WalkInService } from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import type { SchedulingRole } from './AppointmentFinder.roles';
import type { ScheduleCandidate } from './AppointmentFinder.schedules';

installAutocompleteTimers();

async function setupClient(): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of SchedulingFixtures) {
    await medplum.createResource(resource);
  }
  vi.spyOn(medplum, 'search');
  return medplum;
}

interface SetupProps {
  readonly role?: SchedulingRole;
  readonly service?: WithId<HealthcareService>;
  readonly location?: WithId<Location>;
  readonly disabled?: boolean;
}

/**
 * Renders the field and reports what it hands back.
 * @param medplum - The client to search against.
 * @param props - What to render the field with.
 * @returns The onChange spy, and the field's own input.
 */
async function setup(medplum: MockClient, props?: SetupProps): Promise<{ onChange: ReturnType<typeof vi.fn> }> {
  const onChange = vi.fn();
  const element: JSX.Element = (
    <AppointmentActorSelect
      role={props?.role ?? 'provider'}
      service={props?.service ?? UltrasoundImagingService}
      location={props?.location}
      disabled={props?.disabled}
      onChange={onChange}
    />
  );

  renderWithMedplum(element, medplum);

  return { onChange };
}

/**
 * Opens the field on what it has without typing anything.
 *
 * `fireEvent.change` to the value already in the box is not a change, so the
 * unfiltered list is reached the way a user reaches it: by focusing.
 *
 * @returns The field's input, now searched.
 */
async function openAutocomplete(): Promise<HTMLElement> {
  const input = screen.getByRole('searchbox');
  await act(async () => {
    fireEvent.focus(input);
  });
  await settleAutocomplete();
  return input;
}

/**
 * The candidates one call handed back, by the name they were offered under.
 * @param onChange - The spy the field reports to.
 * @param call - Which call to read. Defaults to the first.
 * @returns The names, in the order they were handed back.
 */
function namesGiven(onChange: ReturnType<typeof vi.fn>, call = 0): string[] {
  return (onChange.mock.calls[call][0] as ScheduleCandidate[]).map(
    (candidate) => candidate.schedule.actor[0].display as string
  );
}

describe('AppointmentActorSelect', () => {
  test('Offers what the service has for its role as soon as it is opened', async () => {
    const medplum = await setupClient();
    await setup(medplum, { role: 'room' });

    await openAutocomplete();

    expect(await screen.findByText('Exam Room A')).toBeInTheDocument();
    expect(screen.getByText('Satellite Exam Room')).toBeInTheDocument();
    // A room field offers rooms, and only rooms, of the same service.
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();
  });

  test('Narrows the list to the name being typed', async () => {
    const medplum = await setupClient();
    await setup(medplum);
    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, 'riv');

    expect(await screen.findByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Tunde Okafor')).not.toBeInTheDocument();
  });

  test('Hands back the candidate that was picked, not just its name', async () => {
    // The caller needs the Schedule behind the name, because that is what `$find`
    // is asked for.
    const medplum = await setupClient();
    const { onChange } = await setup(medplum);
    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, 'riv');
    await clickAutocompleteOption('Dr. Maya Rivera');

    const [chosen] = onChange.mock.calls[0][0] as ScheduleCandidate[];
    expect(chosen.schedule.id).toBe('schedule-dr-rivera');
    expect(chosen.actorResource?.id).toBe('dr-rivera');
  });

  test('Keeps both picks, because everything chosen attends', async () => {
    // `$find` intersects the schedules, so a second provider narrows the times
    // to the ones both are free for rather than replacing the first.
    const medplum = await setupClient();
    const { onChange } = await setup(medplum);
    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, 'riv');
    await clickAutocompleteOption('Dr. Maya Rivera');
    await typeInAutocomplete(input, 'oka');
    await clickAutocompleteOption('Dr. Tunde Okafor');

    expect(namesGiven(onChange, 1)).toStrictEqual(['Dr. Maya Rivera', 'Dr. Tunde Okafor']);
  });

  test('Leaves out actors sited at another clinic', async () => {
    const medplum = await setupClient();
    await setup(medplum, { role: 'room', location: SatelliteClinic });

    await openAutocomplete();

    expect(await screen.findByText('Satellite Exam Room')).toBeInTheDocument();
    expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument();
  });

  test('Still renders for a role the service has nothing configured for', async () => {
    // Every role gets a field whether or not the service uses it, so the form's
    // shape does not change with the data behind it.
    const medplum = await setupClient();
    await setup(medplum, { role: 'room', service: WalkInService });

    await openAutocomplete();

    expect(screen.getByRole('searchbox')).toBeEnabled();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  test('Asks for a provider, but leaves rooms optional', async () => {
    const medplum = await setupClient();
    await setup(medplum);
    expect(screen.queryByText(/Optional\. Leave empty/)).not.toBeInTheDocument();
    // Mantine marks a required field on its label, not on the input inside it.
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  test('Searches nothing until a service is chosen', async () => {
    const medplum = await setupClient();
    const onChange = vi.fn();

    renderWithMedplum(<AppointmentActorSelect role="provider" service={undefined} onChange={onChange} />, medplum);
    await settleAutocomplete();
    await typeInAutocomplete(screen.getByRole('searchbox'), 'riv');

    expect(medplum.search).not.toHaveBeenCalled();
    expect(screen.queryByText('Dr. Maya Rivera')).not.toBeInTheDocument();
  });

  test('Offers nothing to type into while disabled', async () => {
    const medplum = await setupClient();
    const { onChange } = await setup(medplum, { disabled: true });

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('Offers the schedule’s own label under the actor’s name', async () => {
    // A Schedule has no `name` in R4, so its comment is the only thing that
    // tells two of one actor's schedules apart.
    const medplum = await setupClient();
    await setup(medplum);
    const input = screen.getByRole('searchbox');

    await typeInAutocomplete(input, 'riv');

    expect(await screen.findByText('Dr. Maya Rivera - Ultrasound Imaging availability')).toBeInTheDocument();
  });

  test('Reruns the search when the location changes', async () => {
    const medplum = await setupClient();
    const onChange = vi.fn();
    const { rerender } = renderWithMedplum(
      <AppointmentActorSelect role="room" service={UltrasoundImagingService} onChange={onChange} />,
      medplum
    );
    await settleAutocomplete();

    await act(async () => {
      rerender(
        <AppointmentActorSelect
          role="room"
          service={UltrasoundImagingService}
          location={SatelliteClinic}
          onChange={onChange}
        />
      );
    });
    await openAutocomplete();

    expect(await screen.findByText('Satellite Exam Room')).toBeInTheDocument();
    expect(screen.queryByText('Exam Room A')).not.toBeInTheDocument();
  });
});
