// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bot, Reference } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './cds-hooks-via-proxy';

const servicesResponse = {
  services: [
    {
      id: 'patient-greeting',
      title: 'Patient greeting',
      description: 'Display which patient the user is currently working with',
      hook: 'patient-view',
      prefetch: {
        patient: 'Patient/{{context.patientId}}',
      },
    },
  ],
};

const hookResponse = {
  cards: [
    {
      uuid: 'ad16aaae-8a5e-4b2b-9314-d581600893c1',
      summary: 'Now seeing: Homer',
      source: {
        label: 'Patient greeting service',
      },
      indicator: 'info',
    },
  ],
};

vi.mock('undici', () => ({
  ProxyAgent: vi.fn(),

  fetch: vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/cds-services')) {
      return {
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => servicesResponse,
      };
    }
    return {
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => hookResponse,
    };
  }),
}));

test('CDS Hooks via Proxy', async () => {
  const medplum = new MockClient();

  const bot: Reference<Bot> = { reference: 'Bot/123' };

  const input = HomerSimpson;

  const contentType = ContentType.JSON;

  const secrets = {
    PROXY_HOST: {
      name: 'PROXY_HOST',
      valueString: 'YOUR_PROXY_HOST_HERE', // Example: 'proxy.example.com'
    },
    PROXY_PORT: {
      name: 'PROXY_PORT',
      valueInteger: 8080,
    },
    PROXY_CA_CERT: {
      name: 'PROXY_CA_CERT',
      valueString: 'YOUR_PROXY_CA_CERT_HERE', // Example: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n'
    },
    CLIENT_CERT: {
      name: 'CLIENT_CERT',
      valueString: 'YOUR_CLIENT_CERT_HERE', // Example: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n'
    },
    CLIENT_KEY: {
      name: 'CLIENT_KEY',
      valueString: 'YOUR_CLIENT_KEY_HERE', // Example: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
    },
  };

  const result = await handler(medplum, { bot, input, contentType, secrets });
  expect(result).toMatchObject(hookResponse);
});
