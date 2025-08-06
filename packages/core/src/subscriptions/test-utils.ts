// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Bundle, SubscriptionStatus } from '@medplum/fhirtypes';
import WS from 'jest-websocket-mock';
import { MedplumClient } from '../client';
import { generateId } from '../crypto';
import { createReference } from '../utils';

export function sendHandshakeBundle(wsServer: WS, subscriptionId: string): void {
  const timestamp = new Date().toISOString();
  wsServer.send({
    resourceType: 'Bundle',
    timestamp,
    type: 'history',
    entry: [
      {
        resource: {
          resourceType: 'SubscriptionStatus',
          type: 'handshake',
          subscription: { reference: `Subscription/${subscriptionId}` },
        } as SubscriptionStatus,
      },
    ],
  } satisfies Bundle);
}

export async function sendSubscriptionMessage(
  wsServer: WS,
  medplum: MedplumClient,
  subscriptionId: string,
  message: string
): Promise<void> {
  const resource = await medplum.createResource({
    id: generateId(),
    resourceType: 'Communication',
    status: 'completed',
    payload: [{ contentString: message }],
  });
  const timestamp = new Date().toISOString();
  wsServer.send({
    id: generateId(),
    resourceType: 'Bundle',
    type: 'history',
    timestamp,
    entry: [
      {
        resource: {
          id: generateId(),
          resourceType: 'SubscriptionStatus',
          status: 'active',
          type: 'event-notification',
          subscription: { reference: `Subscription/${subscriptionId}` },
          notificationEvent: [{ eventNumber: '0', timestamp, focus: createReference(resource) }],
        },
      },
      {
        resource,
        fullUrl: `${medplum.getBaseUrl()}fhir/R4/Communication/${resource.id}`,
      },
    ],
  });
}
