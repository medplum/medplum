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

    expect(within(details()).getByText('No visit type selected')).toBeInTheDocument();
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

  test('says when the visit types could not be loaded', async () => {
    const medplum = new MockClient({ seedDefaultData: false });
    vi.spyOn(medplum, 'searchResourcePages').mockImplementation(() => {
      throw new Error('Search is down');
    });

    renderWithMedplum(<SchedulingConfigWorkspace />, medplum);

    expect(await screen.findByText('Visit types could not be loaded: Search is down')).toBeInTheDocument();
  });
});
