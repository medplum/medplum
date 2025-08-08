// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PhotonWebhook } from '../photon-types';
import { verifyEvent } from './utils';

test.skip('Verify photon signature', async () => {
  const result = verifyEvent(exampleWebhookEvent, 'example-secret');

  expect(result).toBe(false);
});

const exampleWebhookEvent: PhotonWebhook = {
  method: 'POST',
  path: '/',
  query: {},
  client_ip: 'example-ip',
  url: 'https://neutron.health',
  headers: {
    'Content-Type': 'application/json',
    'x-photon-signature': 'verification-test',
    Authorization: 'Bearer EXAMPLE_TOKEN',
  },
  body: {
    id: '01G8C1TNGH2F03021F23C95261',
    type: 'photon:prescription:created',
    specversion: '1.0',
    datacontenttype: 'application/json',
    time: '2022-01-01T01:00:00.000Z',
    subject: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH',
    source: 'org:org_KzSVZBQixLRkqj5d',
    data: {
      id: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH',
      externalId: '1234',
      dispenseQuantity: 30,
      dispenseAsWritten: true,
      dispenseUnit: 'EA',
      refillsAllowed: 12,
      daysSupply: 30,
      instructions: 'Take once daily',
      notes: '',
      effectiveDate: '2022-01-01',
      expirationDate: '2023-01-01',
      prescriberId: 'usr_wUofzqEvcA2JCwJ4',
      treatmentId: 'med_01G7T2NB6',
      patient: {
        id: 'pat_ieUv67viS0lG18JN',
        externalId: '1234',
      },
    },
  },
};
