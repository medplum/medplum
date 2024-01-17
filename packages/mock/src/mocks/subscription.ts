import { AuditEvent, Subscription } from '@medplum/fhirtypes';

export const ExampleSubscription: Subscription = {
  resourceType: 'Subscription',
  id: '123',
  meta: {
    versionId: '456',
  },
  status: 'active',
  reason: 'Reason',
  criteria: 'Criteria',
  channel: {
    type: 'rest-hook',
    endpoint: 'https://example.com',
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
  type: {
    system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
    code: 'rest-hook',
  },
  recorded: new Date().toISOString(),
  agent: [
    {
      requestor: true,
      who: {
        reference: 'Practitioner/123',
      },
    },
  ],
  source: {
    observer: {
      reference: 'Device/123',
    },
  },
};
