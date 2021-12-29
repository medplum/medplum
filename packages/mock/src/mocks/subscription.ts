import { AuditEvent, Bundle, Subscription } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

export const ExampleSubscription: Subscription = {
  resourceType: 'Subscription',
  id: '123',
  meta: {
    versionId: '456',
  },
};

export const ExampleSubscriptionHistory: Bundle<Subscription> = {
  resourceType: 'Bundle',
  type: 'history',
  entry: [
    {
      resource: ExampleSubscription,
    },
  ],
};

export const ExampleAuditEvent: AuditEvent = {
  resourceType: 'AuditEvent',
  id: randomUUID(),
  meta: {
    lastUpdated: new Date().toISOString(),
    versionId: randomUUID(),
    author: {
      reference: 'Practitioner/123',
    },
  },
};

export const ExampleAuditEventBundle: Bundle<AuditEvent> = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: ExampleAuditEvent,
    },
  ],
};
