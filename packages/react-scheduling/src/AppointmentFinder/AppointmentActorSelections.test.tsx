// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import type { JSX } from 'react';
import { useState } from 'react';
import { SchedulingFixtures, UltrasoundImagingService } from '../stories/scheduling';
import {
  clickAutocompleteOption,
  installAutocompleteTimers,
  settleAutocomplete,
  typeInAutocomplete,
} from '../test-utils/asyncAutocomplete';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import { AppointmentActorSelections } from './AppointmentActorSelections';
import type { ActorSelections } from './AppointmentFinder.schedules';

installAutocompleteTimers();

async function setupClient(): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of SchedulingFixtures) {
    await medplum.createResource(resource);
  }
  return medplum;
}

/** Every selection the component has handed back, newest last. */
const written = vi.fn<(selections: ActorSelections) => void>();

/**
 * What the component last handed back, so a test can read the shape it wrote.
 * @returns The newest selections, or an empty one before anything was chosen.
 */
function latest(): ActorSelections {
  return written.mock.calls.at(-1)?.[0] ?? {};
}

/**
 * Renders the rows as a host would: selection held outside, handed back in.
 * @returns The element.
 */
function Host(): JSX.Element {
  const [value, setValue] = useState<ActorSelections>({});
  return (
    <AppointmentActorSelections
      value={value}
      service={UltrasoundImagingService}
      onChange={(next) => {
        written(next);
        setValue(next);
      }}
    />
  );
}

async function setup(medplum: MockClient): Promise<void> {
  written.mockClear();
  renderWithMedplum(<Host />, medplum);
  await settleAutocomplete();
}

/**
 * Picks one name into a row.
 * @param label - The row's label, exactly.
 * @param query - What to type.
 * @param name - The option to click.
 */
async function pick(label: RegExp, query: string, name: string): Promise<void> {
  await typeInAutocomplete(screen.getByRole('searchbox', { name: label }), query);
  await clickAutocompleteOption(name);
  await settleAutocomplete();
}

/**
 * Whether a name is showing as a pill, rather than only as an option on a list.
 * @param name - The name to look for.
 * @returns Whether a pill holds it.
 */
function hasPill(name: string): boolean {
  return screen.queryAllByText(name).some((node) => node.className.includes('Pill'));
}

async function click(name: string): Promise<void> {
  const button = screen.getByRole('button', { name });
  await act(async () => {
    fireEvent.click(button);
  });
  await settleAutocomplete();
}

describe('AppointmentActorSelections', () => {
  test('Asks about every bookable actor type, in the order they are asked about', async () => {
    const medplum = await setupClient();
    await setup(medplum);

    const labels = screen.getAllByRole('searchbox').map((box) => box.getAttribute('name'));
    expect(labels).toStrictEqual(['Practitioner', 'Location', 'Device']);
  });

  test('Offers a row to answer in even when nothing has been asked for yet', async () => {
    const medplum = await setupClient();
    await setup(medplum);

    // The caller may hold `{}`; the row it is answered in still has to exist.
    expect(screen.getByRole('searchbox', { name: /^provider$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove provider 1' })).not.toBeInTheDocument();
  });

  test('A second row is another provider the visit needs, and both rows are named', async () => {
    const medplum = await setupClient();
    await setup(medplum);

    await pick(/^provider$/i, 'riv', 'Dr. Maya Rivera');
    await click('Add another provider');

    // The lone row was labelled by its type; two rows have to be told apart.
    expect(screen.queryByRole('searchbox', { name: /^provider$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /^provider 1$/i })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /^and provider 2$/i })).toBeInTheDocument();
    expect(latest().Practitioner).toHaveLength(2);
  });

  test('Adding another is offered only once the row above it has been answered', async () => {
    const medplum = await setupClient();
    await setup(medplum);

    // An empty row is already the place to name a provider, so a second empty one
    // would be the same question asked twice.
    expect(screen.queryByRole('button', { name: 'Add another provider' })).not.toBeInTheDocument();

    await pick(/^provider$/i, 'riv', 'Dr. Maya Rivera');
    expect(screen.getByRole('button', { name: 'Add another provider' })).toBeInTheDocument();

    // The new row is empty, so the offer goes until it too is answered.
    await click('Add another provider');
    expect(screen.queryByRole('button', { name: 'Add another provider' })).not.toBeInTheDocument();

    await pick(/^and provider 2$/i, 'oka', 'Dr. Tunde Okafor');
    expect(screen.getByRole('button', { name: 'Add another provider' })).toBeInTheDocument();
  });

  test('Several names in one row are kept as the alternatives they are', async () => {
    const medplum = await setupClient();
    await setup(medplum);

    await pick(/^provider$/i, 'riv', 'Dr. Maya Rivera');
    await pick(/^provider$/i, 'oka', 'Dr. Tunde Okafor');

    expect(latest().Practitioner).toHaveLength(1);
    expect(latest().Practitioner?.[0].candidates).toHaveLength(2);
  });

  test('Removing a row leaves the names in the rows around it alone', async () => {
    const medplum = await setupClient();
    await setup(medplum);

    await pick(/^provider$/i, 'riv', 'Dr. Maya Rivera');
    await click('Add another provider');
    await pick(/^and provider 2$/i, 'oka', 'Dr. Tunde Okafor');

    // The rows are keyed by their own id. Keyed by position, removing the first
    // would hand the second row the first one's field, pills and all.
    await click('Remove provider 1');

    expect(latest().Practitioner).toHaveLength(1);
    expect(latest().Practitioner?.[0].candidates.map((candidate) => candidate.schedule.id)).toStrictEqual([
      'schedule-dr-okafor',
    ]);
    expect(screen.getByRole('searchbox', { name: /^provider$/i })).toBeInTheDocument();
    expect(hasPill('Dr. Tunde Okafor')).toBe(true);
    expect(hasPill('Dr. Maya Rivera')).toBe(false);
  });

  test('One offer to add another per type, and a lone row cannot be removed', async () => {
    const medplum = await setupClient();
    await setup(medplum);

    await pick(/^provider$/i, 'riv', 'Dr. Maya Rivera');

    // The action belongs to the group rather than to a row, so it is never one per row.
    expect(screen.getAllByRole('button', { name: 'Add another provider' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Remove provider 1' })).not.toBeInTheDocument();

    await click('Add another provider');

    expect(screen.getByRole('button', { name: 'Remove provider 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove provider 2' })).toBeInTheDocument();
  });

  test('Answering one actor type leaves the others as they were', async () => {
    const medplum = await setupClient();
    await setup(medplum);

    await pick(/^provider$/i, 'riv', 'Dr. Maya Rivera');
    await pick(/^room$/i, 'exam', 'Exam Room A');

    expect(latest().Practitioner?.[0].candidates).toHaveLength(1);
    expect(latest().Location?.[0].candidates).toHaveLength(1);
  });
});
