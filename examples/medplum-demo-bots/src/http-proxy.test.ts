// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, ContentType } from '@medplum/core';
import type { Bot, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './http-proxy';

vi.mock('undici', () => ({
  ProxyAgent: vi.fn(),

  fetch: vi.fn().mockImplementation(() =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(allOk),
    })
  ),
}));

test('HTTP Proxy', async () => {
  const medplum = new MockClient();

  const bot: Reference<Bot> = { reference: 'Bot/123' };

  const input = { foo: 'bar' };

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
  expect(result).toMatchObject(allOk);
});
