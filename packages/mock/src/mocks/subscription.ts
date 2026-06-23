// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { AuditEvent, Subscription } from '@medplum/fhirtypes';
import { DrAliceSmith } from './alice';

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
    author: createReference(DrAliceSmith),
  },
  type: {
    system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
    code: 'rest-hook',
  },
  recorded: new Date().toISOString(),
  agent: [
    {
      requestor: true,
      who: createReference(DrAliceSmith),
    },
  ],
  source: {
    observer: {
      reference: 'Device/123',
    },
  },
};
