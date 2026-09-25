// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, vi } from 'vitest';
import { ConfigFixtures } from '../stories/scheduling';
import { act, renderWithMedplum, screen, userEvent, waitFor, within } from '../test-utils/render';
import { SchedulingConfigWorkspace } from './SchedulingConfigWorkspace';

async function setup(resources: readonly Resource[] = ConfigFixtures): Promise<MockClient> {
  const medplum = new MockClient({ seedDefaultData: false });
  for (const resource of resources) {
    await medplum.createResource(resource);
  }
  renderWithMedplum(<SchedulingConfigWorkspace />, medplum);
  await waitFor(() => expect(within(sidebar()).getByText('Telehealth Consult')).toBeInTheDocument());
  return medplum;
}

function sidebar(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Scheduling configuration' });
}

function row(label: string): HTMLElement {
  return within(sidebar()).getByText(label).closest('button') as HTMLElement;
}

function section(title: string): HTMLElement {
  return within(sidebar()).getByText(title, { selector: 'p' }).closest('.mantine-Stack-root') as HTMLElement;
}

function sectionCount(title: string): string | null {
  return within(section(title)).getByTestId('section-count').textContent;
}

async function showInactive(): Promise<void> {
  await userEvent.click(within(sidebar()).getByRole('button', { name: 'Filters' }));
  await userEvent.click(screen.getByLabelText('Show inactive'));
}

function entry(name: string): HTMLElement {
  return within(details()).getByRole('button', { name: new RegExp(`^${name}`) });
}

function details(): HTMLElement {
  return screen.getByRole('region', { name: 'Configuration details' });
}

function nameField(): HTMLElement {
  return within(details()).getByLabelText(/Name/);
}

function saveButton(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Unsaved changes' })).getByRole('button', {
    name: /^(Save|Create)$/,
  });
}

describe('SchedulingConfigWorkspace', () => {
  test('lists visit types with no duration, and hides turned-off ones until asked', async () => {
    await setup();

    expect(row('Unconfigured Visit')).toBeInTheDocument();
    expect(within(sidebar()).queryByText('Discontinued Consult')).not.toBeInTheDocument();

    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Filters' }));
    await userEvent.click(screen.getByLabelText('Show inactive'));

    expect(row('Discontinued Consult')).toHaveTextContent('Inactive');
  });

  test('nothing is selected until something is picked, and the empty pane offers to start one', async () => {
    await setup();

    expect(within(details()).getByText('Nothing selected')).toBeInTheDocument();
    expect(
      within(sidebar())
        .queryAllByRole('button')
        .filter((button) => button.hasAttribute('aria-current'))
    ).toHaveLength(0);
  });

  test('selecting a visit type opens its page and marks its row', async () => {
    await setup();

    await userEvent.click(row('Telehealth Consult'));

    expect(row('Telehealth Consult')).toHaveAttribute('aria-current', 'true');
    expect(within(details()).getByRole('heading', { name: 'Telehealth Consult' })).toBeInTheDocument();
    expect(nameField()).toHaveValue('Telehealth Consult');
  });

  test('a saved rename shows in the sidebar at once, without refetching the list', async () => {
    const medplum = await setup();
    const search = vi.spyOn(medplum, 'searchResourcePages');
    await userEvent.click(row('Telehealth Consult'));

    await userEvent.type(nameField(), ' (video)');
    await userEvent.click(saveButton());

    await waitFor(() => expect(within(sidebar()).getByText('Telehealth Consult (video)')).toBeInTheDocument());
    expect(row('Telehealth Consult (video)')).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  test('a new visit type is not listed until saved, then listed and selected though it starts turned off', async () => {
    await setup();

    await userEvent.click(within(sidebar()).getByRole('button', { name: 'New visit type' }));
    expect(within(details()).getByText('Not saved yet')).toBeInTheDocument();
    await userEvent.type(nameField(), 'Consult');
    expect(within(sidebar()).queryByText('Consult')).not.toBeInTheDocument();

    await userEvent.click(saveButton());

    await waitFor(() => expect(row('Consult')).toHaveAttribute('aria-current', 'true'));
    expect(row('Consult')).toHaveTextContent('Inactive');
    expect(within(details()).getByRole('heading', { name: 'Consult' })).toBeInTheDocument();
  });

  test('switching rows with unsaved changes asks first, and declining keeps the page and its edits', async () => {
    await setup();
    await userEvent.click(row('Telehealth Consult'));
    await userEvent.type(nameField(), ' (video)');

    await userEvent.click(row('Ultrasound Imaging'));
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));

    expect(nameField()).toHaveValue('Telehealth Consult (video)');
    expect(row('Telehealth Consult')).toHaveAttribute('aria-current', 'true');

    await userEvent.click(row('Ultrasound Imaging'));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole('button', {
        name: 'Discard changes',
      })
    );

    expect(nameField()).toHaveValue('Ultrasound Imaging');
  });

  test('the empty pane starts a new visit type', async () => {
    await setup();

    await userEvent.click(within(details()).getByRole('button', { name: 'New visit type' }));

    expect(within(details()).getByText('Not saved yet')).toBeInTheDocument();
  });

  test('clicking the row already open does not ask, and leaves the unsaved-changes guard in place', async () => {
    await setup();
    await userEvent.click(row('Telehealth Consult'));
    await userEvent.type(nameField(), ' (video)');

    await userEvent.click(row('Telehealth Consult'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nameField()).toHaveValue('Telehealth Consult (video)');

    await userEvent.click(row('Ultrasound Imaging'));
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
  });

  test('a visit type created while the list is still loading stays listed once it loads', async () => {
    const medplum = new MockClient({ seedDefaultData: false });
    for (const resource of ConfigFixtures) {
      await medplum.createResource(resource);
    }
    // The search reads the project now, before the create, and hands back its pages only once released.
    const search = medplum.searchResourcePages.bind(medplum);
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(medplum, 'searchResourcePages').mockImplementation(((...args: Parameters<typeof search>) =>
      (async function* () {
        const pages = [];
        for await (const page of search(...args)) {
          pages.push(page);
        }
        await released;
        yield* pages;
      })()) as typeof search);
    renderWithMedplum(<SchedulingConfigWorkspace />, medplum);

    await userEvent.click(within(sidebar()).getByRole('button', { name: 'New visit type' }));
    await userEvent.type(nameField(), 'Consult');
    await userEvent.click(saveButton());
    await waitFor(() => expect(row('Consult')).toHaveAttribute('aria-current', 'true'));

    await act(async () => release());

    await waitFor(() => expect(within(sidebar()).getByText('Telehealth Consult')).toBeInTheDocument());
    expect(row('Consult')).toHaveAttribute('aria-current', 'true');
    expect(within(details()).getByRole('heading', { name: 'Consult' })).toBeInTheDocument();
  });

  test('switching rows without unsaved changes does not ask', async () => {
    await setup();
    await userEvent.click(row('Telehealth Consult'));

    await userEvent.click(row('Ultrasound Imaging'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nameField()).toHaveValue('Ultrasound Imaging');
  });

  test('lists each provider, room, and device once, whether or not it has a calendar, and no calendar as a row', async () => {
    await setup();

    expect(within(section('Providers')).getAllByText('Dr. Maya Rivera')).toHaveLength(1);
    expect(within(section('Providers')).getAllByText('Dr. Anika Patel')).toHaveLength(1);
    expect(within(section('Devices')).getByText('Ultrasound 1 (Main Campus)')).toBeInTheDocument();
    expect(within(section('Rooms')).getByText('Exam Room C')).toBeInTheDocument();
    expect(within(sidebar()).queryByText(/availability$/)).not.toBeInTheDocument();
  });

  test('rooms are the Locations typed as rooms and the ones booked as rooms, and never a service facility', async () => {
    await setup();

    expect(within(section('Rooms')).getByText('Exam Room A Bed 1')).toBeInTheDocument();
    expect(row('Procedure Room')).toHaveTextContent('Not marked as a room');
    expect(row('Exam Room A')).not.toHaveTextContent('Not marked as a room');
    expect(within(sidebar()).queryByText('Uro Associates - Main Clinic')).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText('Second Floor')).not.toBeInTheDocument();
  });

  test('a calendar held by two actors is counted rather than listed', async () => {
    await setup();

    expect(within(sidebar()).getByText(/1 calendar is not listed because it can’t be booked/)).toBeInTheDocument();
  });

  test('offers to create visit types, and never providers', async () => {
    await setup();

    expect(within(section('Visit types')).getByRole('button', { name: 'New visit type' })).toBeInTheDocument();
    expect(within(section('Providers')).queryByRole('button', { name: /^New/ })).not.toBeInTheDocument();
  });

  test('the text filter narrows every section, and the counts follow it', async () => {
    await setup();
    const providers = Number(sectionCount('Providers')?.replace(/\D/g, ''));
    expect(providers).toBeGreaterThan(3);

    await userEvent.type(within(sidebar()).getByRole('textbox', { name: 'Filter' }), 'NGUYEN');

    expect(sectionCount('Providers')).toBe('1 listed');
    expect(row('Dr. Linh Nguyen')).toBeInTheDocument();
    expect(within(section('Rooms')).getByText('No matching rooms')).toBeInTheDocument();
    expect(within(section('Devices')).getByText('No matching devices')).toBeInTheDocument();
  });

  test('collapsing a section hides its rows but keeps its header and count, and leaves the others', async () => {
    await setup();
    const count = sectionCount('Providers');

    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Hide providers' }));

    await waitFor(() => expect(within(section('Providers')).getByText('Dr. Maya Rivera')).not.toBeVisible());
    expect(sectionCount('Providers')).toBe(count);
    expect(within(section('Rooms')).getByText('Exam Room A')).toBeVisible();
  });

  test('hides inactive providers and devices until asked, then marks them', async () => {
    await setup();

    expect(within(sidebar()).queryByText('Ultrasound 3 (Retired)')).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText('Dr. Hana Lee')).not.toBeInTheDocument();

    await showInactive();

    expect(row('Ultrasound 3 (Retired)')).toHaveTextContent('Inactive');
    expect(row('Dr. Hana Lee')).toHaveTextContent('Inactive');
  });

  test('marks what still needs finishing: no time zone, and a calendar not accepting appointments', async () => {
    await setup();
    await showInactive();

    expect(row('Dr. Anika Patel')).toHaveTextContent('No time zone');
    expect(row('Ultrasound 3 (Retired)')).toHaveTextContent('Not accepting appointments');
    // An actor with no calendar, or whose calendar resolves a time zone, needs nothing.
    expect(row('Exam Room C')).not.toHaveTextContent(/No time zone|Not accepting/);
    expect(row('Dr. Linh Nguyen')).not.toHaveTextContent(/No time zone|Not accepting/);
  });

  test('a saved calendar replaces the one listed, so its row and page follow at once', async () => {
    const medplum = await setup();
    const search = vi.spyOn(medplum, 'searchResourcePages');
    await userEvent.click(row('Dr. Maya Rivera'));

    await userEvent.click(within(details()).getByRole('switch', { name: 'Accepting appointments' }));
    await userEvent.click(saveButton());

    await waitFor(() => expect(row('Dr. Maya Rivera')).toHaveTextContent('Not accepting appointments'));
    expect(row('Dr. Maya Rivera')).toHaveAttribute('aria-current', 'true');
    expect(within(details()).getByRole('switch', { name: 'Accepting appointments' })).not.toBeChecked();
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  test("offering a room's first visit type creates its calendar, and the room stays selected", async () => {
    await setup();
    await userEvent.click(row('Exam Room C'));

    await userEvent.click(within(details()).getByRole('button', { name: 'Offer a visit type' }));
    const telehealth = screen.getByRole('menuitem', { name: 'Telehealth Consult' });
    await waitFor(() => expect(telehealth).toBeEnabled());
    await userEvent.click(telehealth);
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(within(details()).getByRole('switch', { name: 'Accepting appointments' })).toBeInTheDocument()
    );
    expect(entry('Telehealth Consult')).toHaveAttribute('aria-expanded', 'true');
    expect(row('Exam Room C')).toHaveAttribute('aria-current', 'true');
  });

  test('a visit type’s page shows its sections in order, ending with what offers it', async () => {
    await setup();

    await userEvent.click(row('Ultrasound Imaging'));

    expect(
      within(details())
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['General', 'Scheduling parameters', 'Default availability', 'Offered by']);
    const offeredBy = within(details()).getByRole('region', { name: 'Offered by' });
    expect(within(offeredBy).getByText('Dr. Maya Rivera')).toBeInTheDocument();
    expect(within(offeredBy).getByText('Exam Room B')).toBeInTheDocument();
  });

  test('Offered by says why an actor sharing no service facility with the visit type can’t be booked', async () => {
    await setup();

    await userEvent.click(row('Ultrasound Imaging'));

    const offeredBy = within(details()).getByRole('region', { name: 'Offered by' });
    const satellite = within(offeredBy).getByText('Satellite Exam Room').closest('button') as HTMLElement;
    await waitFor(() =>
      expect(satellite).toHaveTextContent(
        "Can't be booked: Ultrasound Imaging isn't held at Uro Associates - Satellite."
      )
    );
    // Exam Room B is a floor below the main clinic, which holds the visit type.
    expect(within(offeredBy).getByText('Exam Room B').closest('button')).not.toHaveTextContent("Can't be booked");
  });

  test("selecting an actor in Offered by opens its page with that visit type's entry open", async () => {
    await setup();
    await userEvent.click(row('Telehealth Consult'));

    const offeredBy = within(details()).getByRole('region', { name: 'Offered by' });
    await userEvent.click(within(offeredBy).getByText('Dr. Linh Nguyen'));

    expect(within(details()).getByRole('heading', { name: 'Dr. Linh Nguyen' })).toBeInTheDocument();
    expect(entry('Telehealth Consult')).toHaveAttribute('aria-expanded', 'true');
    expect(entry('Ultrasound Imaging')).toHaveAttribute('aria-expanded', 'false');
    expect(row('Dr. Linh Nguyen')).toHaveAttribute('aria-current', 'true');
  });

  test('Offered by says when nothing offers the visit type, and where visit types are offered from', async () => {
    await setup();

    await userEvent.click(row('Unconfigured Visit'));

    expect(
      within(details()).getByText(
        "Nothing offers Unconfigured Visit yet. Visit types are offered from a provider's, room's, or device's page."
      )
    ).toBeInTheDocument();
  });

  test('an empty project says each section has nothing yet, and still offers to create a visit type', async () => {
    const medplum = new MockClient({ seedDefaultData: false });
    renderWithMedplum(<SchedulingConfigWorkspace />, medplum);

    for (const noun of ['visit types', 'providers', 'rooms', 'devices']) {
      expect(await within(sidebar()).findByText(`No ${noun} yet`)).toBeInTheDocument();
    }
    expect(within(sidebar()).getByRole('button', { name: 'New visit type' })).toBeInTheDocument();
  });

  test('says when the visit types could not be loaded', async () => {
    const medplum = new MockClient({ seedDefaultData: false });
    vi.spyOn(medplum, 'searchResourcePages').mockImplementation(() => {
      throw new Error('Search is down');
    });

    renderWithMedplum(<SchedulingConfigWorkspace />, medplum);

    expect(await screen.findByText('Visit types could not be loaded: Search is down')).toBeInTheDocument();
  });
});
