// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { Bot, Subscription } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';

const medplum = new MockClient();

describe('SubscriptionsPage', () => {
  function setup(url: string): void {
    renderAppRoutes(medplum, url);
  }

  test('Renders', async () => {
    const bot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
    });

    const subscription = await medplum.createResource<Subscription>({
      resourceType: 'Subscription',
      reason: 'test',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: `${getReferenceString(bot)}`,
      },
    });

    // load bot page
    await act(async () => {
      setup(`/${getReferenceString(bot)}`);
    });

    const subscriptionsTab = screen.getByRole('tab', { name: 'Subscriptions' });

    // click on Subscriptions tab
    await act(async () => {
      fireEvent.click(subscriptionsTab);
    });

    expect(screen.getByText(`${subscription.id}`)).toBeInTheDocument();

    // click on a subscription
    await act(async () => {
      fireEvent.click(screen.getByText(`${subscription.id}`));
    });

    expect(screen.getByLabelText(`Actions for Subscription/${subscription.id}`));
  });

  test('Renders test changes', async () => {
    const bot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
    });

    const subscription = await medplum.createResource<Subscription>({
      resourceType: 'Subscription',
      reason: 'test',
      status: 'active',
      criteria: 'Patient',
      channel: {
        type: 'rest-hook',
        endpoint: `${getReferenceString(bot)}`,
      },
    });

    // directly load bot subscriptions page
    await act(async () => {
      setup(`/${getReferenceString(bot)}/subscriptions`);
    });

    // click on a subscription
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Last Updated' }));
    });

    const sortButton = await screen.findByRole('menuitem', { name: 'Sort Newest to Oldest' });

    await act(async () => {
      fireEvent.click(sortButton);
    });

    expect(screen.getByText(`${subscription.id}`)).toBeInTheDocument();
  });
});
