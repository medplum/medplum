// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { ChargeItemDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { RouterProvider, createMemoryRouter, useNavigate, useParams } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ChargeItemDefinitions } from './ChargeItemDefinitions';

const BASE_URL = '/Billing/Settings/ChargeItems';

function ChargeItemsRoute(): JSX.Element {
  const { '*': path } = useParams();
  const navigate = useNavigate();
  return (
    <ChargeItemDefinitions
      resourceId={path || undefined}
      onNavigate={(id) => navigate(id ? `${BASE_URL}/${id}` : BASE_URL)}
    />
  );
}

describe('ChargeItemDefinitions', () => {
  let medplum: MockClient;
  let definition: WithId<ChargeItemDefinition>;

  beforeEach(async () => {
    medplum = new MockClient();
    notifications.clean();
    definition = await medplum.createResource<ChargeItemDefinition>({
      resourceType: 'ChargeItemDefinition',
      url: 'https://example.com/fee-schedule/99213',
      title: 'Office visit, established patient',
      status: 'active',
    });
  });

  const setup = (path = ''): { router: ReturnType<typeof createMemoryRouter> } => {
    const router = createMemoryRouter([{ path: `${BASE_URL}/*`, element: <ChargeItemsRoute /> }], {
      initialEntries: [`${BASE_URL}/${path}`],
    });
    render(
      <MedplumProvider medplum={medplum} navigate={router.navigate}>
        <MantineProvider>
          <Notifications />
          <RouterProvider router={router} />
        </MantineProvider>
      </MedplumProvider>
    );
    return { router };
  };

  test('lists charge item definitions with title, code, last updated, and status', async () => {
    setup();

    expect(await screen.findByText('Office visit, established patient')).toBeInTheDocument();
    for (const header of ['Title', 'Code', 'Last Updated', 'Status']) {
      expect(screen.getByText(header, { selector: 'th *' })).toBeInTheDocument();
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('opens the edit modal for a clicked charge item and saves changes', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    const { router } = setup();

    await user.click(await screen.findByText('Office visit, established patient'));
    expect(router.state.location.pathname).toBe(`${BASE_URL}/${definition.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Edit charge item' });
    const title = await within(dialog).findByDisplayValue('Office visit, established patient');

    await user.clear(title);
    await user.type(title, 'Office visit, level 3');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ id: definition.id, title: 'Office visit, level 3' });
    await waitFor(() => expect(router.state.location.pathname).toBe(BASE_URL));
    expect(await screen.findByText('Office visit, level 3')).toBeInTheDocument();
  });

  test('opens a new charge item modal from the add button', async () => {
    const user = userEvent.setup();
    const { router } = setup();

    await user.click(await screen.findByRole('button', { name: 'New ChargeItemDefinition' }));
    expect(router.state.location.pathname).toBe(`${BASE_URL}/new`);
    const dialog = await screen.findByRole('dialog', { name: 'New charge item' });
    expect(await within(dialog).findByRole('button', { name: 'Save' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(router.state.location.pathname).toBe(BASE_URL);
  });

  test('saves the base price onto the definition, keeping its other fields', async () => {
    const user = userEvent.setup();
    const priced = await medplum.createResource<ChargeItemDefinition>({
      resourceType: 'ChargeItemDefinition',
      url: 'https://example.com/fee-schedule/36415',
      title: 'Venipuncture',
      status: 'active',
      description: 'Kept as is',
      propertyGroup: [
        {
          applicability: [{ expression: 'true' }],
          priceComponent: [{ type: 'base', amount: { value: 25, currency: 'USD' } }],
        },
      ],
    });
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    setup(priced.id);

    const dialog = await screen.findByRole('dialog', { name: 'Edit charge item' });
    const price = await within(dialog).findByLabelText('Price');
    expect(price).toHaveValue('$25.00');
    await user.clear(price);
    await user.type(price, '30');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0][0]).toMatchObject({
      url: 'https://example.com/fee-schedule/36415',
      description: 'Kept as is',
      propertyGroup: [
        {
          applicability: [{ expression: 'true' }],
          priceComponent: [{ type: 'base', amount: { value: 30, currency: 'USD' } }],
        },
      ],
    });
  });

  test('creates a new charge item with a generated URL and a base price', async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(medplum, 'createResource');
    setup('new');

    const dialog = await screen.findByRole('dialog', { name: 'New charge item' });
    await user.type(within(dialog).getByLabelText(/^Title/), 'Telehealth visit');
    await user.type(within(dialog).getByLabelText('Price'), '95');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const created = createSpy.mock.calls[0][0] as ChargeItemDefinition;
    expect(created.title).toBe('Telehealth visit');
    expect(created.status).toBe('active');
    expect(created.url).toMatch(/^urn:uuid:/);
    expect(created.propertyGroup).toEqual([
      { priceComponent: [{ type: 'base', amount: { value: 95, currency: 'USD' } }] },
    ]);
  });

  test('edits only the title and status of a definition with several price groups', async () => {
    const user = userEvent.setup();
    const groups: ChargeItemDefinition['propertyGroup'] = [
      { priceComponent: [{ type: 'base', amount: { value: 180, currency: 'USD' } }] },
      { priceComponent: [{ type: 'base', amount: { value: 25, currency: 'USD' } }] },
    ];
    const bundle = await medplum.createResource<ChargeItemDefinition>({
      resourceType: 'ChargeItemDefinition',
      url: 'https://example.com/fee-schedule/visit-bundle',
      title: 'Visit bundle',
      status: 'active',
      propertyGroup: groups,
    });
    const updateSpy = vi.spyOn(medplum, 'updateResource');
    setup(bundle.id);

    const dialog = await screen.findByRole('dialog', { name: 'Edit charge item' });
    expect(await within(dialog).findByText(/several codes or price groups/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open the full editor' })).toHaveAttribute(
      'href',
      `/ChargeItemDefinition/${bundle.id}/edit`
    );
    expect(within(dialog).queryByLabelText('Price')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect((updateSpy.mock.calls[0][0] as ChargeItemDefinition).propertyGroup).toEqual(groups);
  });

  test('deep links to a charge item', async () => {
    setup(definition.id);

    const dialog = await screen.findByRole('dialog', { name: 'Edit charge item' });
    expect(await within(dialog).findByDisplayValue('Office visit, established patient')).toBeInTheDocument();
  });
});
