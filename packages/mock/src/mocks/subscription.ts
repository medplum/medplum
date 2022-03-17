import { AuditEvent, Subscription } from '@medplum/fhirtypes';

export const ExampleSubscription: Subscription = {
  resourceType: 'Subscription',
  id: '123',
  meta: {
    versionId: '456',
  },
};

export const ExampleAuditEvent: AuditEvent = {
  resourceType: 'AuditEvent',
  id: '123',
  meta: {
    lastUpdated: new Date().toISOString(),
    versionId: '456',
    author: {
      reference: 'Practitioner/123',
    },
  },
};
