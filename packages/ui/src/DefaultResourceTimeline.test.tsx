import { Bundle, MedplumClient, Subscription } from '@medplum/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DefaultResourceTimeline, DefaultResourceTimelineProps } from './DefaultResourceTimeline';
import { MedplumProvider } from './MedplumProvider';

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
          lastUpdated: new Date().toISOString(),
          author: {
            reference: 'Practitioner/123'
          }
        }
      }
    }
  ]
};

function mockFetch(url: string, options: any): Promise<any> {
  const method = options.method ?? 'GET';
  let result: any;

  if (method === 'POST' && url.endsWith('/auth/login')) {
    result = {
      profile: 'Practitioner/123'
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

describe('DefaultResourceTimeline', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (args: DefaultResourceTimelineProps) => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <DefaultResourceTimeline {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders reference', async () => {
    setup({ resource: { reference: 'Subscription/' + subscriptionId } });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).not.toBeUndefined();
    expect(items.length).toEqual(1);
  });

  test('Renders resource', async () => {
    setup({ resource: subscription });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).not.toBeUndefined();
    expect(items.length).toEqual(1);
  });

});
