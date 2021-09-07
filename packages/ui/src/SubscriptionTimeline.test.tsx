import { Bundle, MedplumClient, Subscription } from '@medplum/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { SubscriptionTimeline, SubscriptionTimelineProps } from './SubscriptionTimeline';

const subscriptionId = randomUUID();

const subscription: Subscription = {
  resourceType: 'Subscription',
  id: subscriptionId
};

const auditEvents: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'AuditEvent',
        id: randomUUID(),
        meta: {
          lastUpdated: new Date(),
          author: {
            reference: 'Practitioner/123'
          }
        }
      }
    }
  ]
};

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const method = options.method ?? 'GET';
  let result: any;

  if (method === 'POST' && url.endsWith('/auth/login')) {
    result = {
      profile: {
        resourceType: 'Practitioner',
        id: '123'
      }
    };
  } else if (method === 'GET' && url.includes('/fhir/R4/Subscription/' + subscriptionId)) {
    result = subscription;
  } else if (method === 'GET' && url.includes('/fhir/R4/AuditEvent?')) {
    result = auditEvents;
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

describe('SubscriptionTimeline', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (args: SubscriptionTimelineProps) => {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <SubscriptionTimeline {...args} />
      </MedplumProvider>
    );
  };

  test('Renders reference', async () => {
    setup({ subscription: { reference: 'Subscription/' + subscriptionId } });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).not.toBeUndefined();
    expect(items.length).toEqual(1);
  });

  test('Renders resource', async () => {
    setup({ subscription });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).not.toBeUndefined();
    expect(items.length).toEqual(1);
  });

});
