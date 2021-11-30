import { Bundle, Subscription } from '@medplum/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DefaultResourceTimeline, DefaultResourceTimelineProps } from './DefaultResourceTimeline';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';

const subscription: Subscription = {
  resourceType: 'Subscription',
  id: '123',
  meta: {
    versionId: '456'
  }
};

const subscriptionHistory: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: subscription
  }]
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
          versionId: randomUUID(),
          author: {
            reference: 'Practitioner/123'
          }
        }
      }
    }
  ]
};

const medplum = new MockClient({
  'auth/login': {
    'POST': {
      profile: { reference: 'Practitioner/123' }
    }
  },
  'fhir/R4/Subscription/123': {
    'GET': subscription
  },
  'fhir/R4/Subscription/123/_history': {
    'GET': subscriptionHistory
  },
  'fhir/R4/AuditEvent?_count=100&entity=Subscription/123': {
    'GET': auditEvents
  }
});

describe('DefaultResourceTimeline', () => {

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
    setup({ resource: { reference: 'Subscription/' + subscription.id } });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).not.toBeUndefined();
    expect(items.length).toEqual(2);
  });

  test('Renders resource', async () => {
    setup({ resource: subscription });

    await act(async () => {
      await waitFor(() => screen.getAllByTestId('timeline-item'));
    });

    const items = screen.getAllByTestId('timeline-item');
    expect(items).not.toBeUndefined();
    expect(items.length).toEqual(2);
  });

});
