import { getReferenceString } from '@medplum/core';
import { Bot, Subscription } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

describe('SubscriptionPage', () => {
  function setup(url: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <AppRoutes />
        </MemoryRouter>
      </MedplumProvider>
    );
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

    const subscriptionTab = screen.getByRole('tab', { name: 'Subscription' });

    // click on Subscription tab
    await act(async () => {
      fireEvent.click(subscriptionTab);
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
      channel: {
        type: 'rest-hook',
        endpoint: `${getReferenceString(bot)}`,
      },
    });

    // directly load bot subscription page
    await act(async () => {
      setup(`/${getReferenceString(bot)}/subscription`);
    });

    // click on a subscription
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Last Updated' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sort Newest to Oldest' }));
    });

    expect(screen.getByText(`${subscription.id}`)).toBeInTheDocument();
  });
});
