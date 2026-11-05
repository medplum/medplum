// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import dns from 'node:dns';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import tls from 'node:tls';
import { vi } from 'vitest';
import { getConfig, loadTestConfig } from '../config/loader';
import { generateSelfSignedCert } from '../test.setup';
import {
  createSafeConnect,
  getNormalizedPath,
  getProjectIdFromUrl,
  getProjectScopedUrl,
  isAllowedOutboundUrlForQueue,
  isUnsafeHostname,
  isUnsafeIpAddress,
  safeFetch,
  validateOutboundUrl,
} from './url';

describe('request URL helpers', () => {
  test.each([
    ['/fhir/R4/Patient', '/fhir/R4/Patient'],
    ['/api/fhir/R4/Patient', '/fhir/R4/Patient'],
    ['/projects/123/fhir/R4/Patient', '/fhir/R4/Patient'],
    ['/api/projects/123/fhir/R4/Patient?active=true', '/fhir/R4/Patient'],
    ['/apiary/fhir/R4/Patient', '/apiary/fhir/R4/Patient'],
  ])('normalizes %s', (url, expected) => {
    expect(getNormalizedPath(url)).toBe(expected);
  });

  test.each([
    ['/projects/123/fhir/R4/Patient', '123'],
    ['/api/projects/123/fhir/R4/Patient', '123'],
    ['/fhir/R4/Patient', undefined],
    ['/api/fhir/R4/Patient', undefined],
  ])('gets the project ID from %s', (url, expected) => {
    expect(getProjectIdFromUrl(url)).toBe(expected);
  });

  test('scopes an internal URL to the request project', () => {
    expect(
      getProjectScopedUrl(
        '/projects/123/.well-known/openid-configuration',
        'https://example.com/',
        'https://example.com/oauth2/token'
      )
    ).toBe('https://example.com/projects/123/oauth2/token');
  });

  test('scopes an internal URL when the base URL has a path', () => {
    expect(
      getProjectScopedUrl(
        '/api/projects/123/.well-known/openid-configuration',
        'https://example.com/api/',
        'https://example.com/api/oauth2/token'
      )
    ).toBe('https://example.com/api/projects/123/oauth2/token');
  });

  test('does not scope an external URL', () => {
    expect(
      getProjectScopedUrl(
        '/projects/123/.well-known/openid-configuration',
        'https://example.com/',
        'https://identity.example.net/oauth2/token'
      )
    ).toBe('https://identity.example.net/oauth2/token');
  });
});

describe('validateOutboundUrl', () => {
  test('parses HTTPS URLs', () => {
    expect(validateOutboundUrl('https://example.com/path').toString()).toBe('https://example.com/path');
  });

  test('rejects invalid URLs', () => {
    expect(() => validateOutboundUrl('not a url')).toThrow('absolute URL');
  });

  test('rejects HTTP by default', () => {
    expect(() => validateOutboundUrl('http://example.com')).toThrow('HTTPS is required');
  });

  test('allows HTTP when explicitly configured', () => {
    expect(validateOutboundUrl('http://example.com', { allowHttp: true }).toString()).toBe('http://example.com/');
  });

  test('rejects unsafe literal hostnames', () => {
    expect(() => validateOutboundUrl('https://localhost')).toThrow('unsafe hostname');
    expect(() => validateOutboundUrl('https://127.0.0.1')).toThrow('unsafe hostname');
    expect(() => validateOutboundUrl('https://[::1]')).toThrow('unsafe hostname');
  });
});

describe('isUnsafeHostname', () => {
  test('detects localhost names', () => {
    expect(isUnsafeHostname('localhost')).toBe(true);
    expect(isUnsafeHostname('localhost.localdomain')).toBe(true);
    expect(isUnsafeHostname('api.localhost')).toBe(true);
  });

  test('detects normalized IPv4 hostnames', () => {
    expect(isUnsafeHostname(new URL('https://2130706433').hostname)).toBe(true);
    expect(isUnsafeHostname(new URL('https://0x7f.0.0.1').hostname)).toBe(true);
  });
});

describe('isUnsafeIpAddress', () => {
  test('detects private and reserved IPv4 addresses', () => {
    expect(isUnsafeIpAddress('10.0.0.1')).toBe(true);
    expect(isUnsafeIpAddress('172.16.0.1')).toBe(true);
    expect(isUnsafeIpAddress('192.168.0.1')).toBe(true);
    expect(isUnsafeIpAddress('169.254.0.1')).toBe(true);
    expect(isUnsafeIpAddress('100.64.0.1')).toBe(true);
    expect(isUnsafeIpAddress('198.18.0.1')).toBe(true);
  });

  test('detects unsafe IPv6 addresses', () => {
    expect(isUnsafeIpAddress('::1')).toBe(true);
    expect(isUnsafeIpAddress('fe80::1')).toBe(true);
    expect(isUnsafeIpAddress('fc00::1')).toBe(true);
    expect(isUnsafeIpAddress('::ffff:7f00:1')).toBe(true);
    expect(isUnsafeIpAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isUnsafeIpAddress('::ffff:192.168.1.1')).toBe(true);
  });

  test('allows public addresses', () => {
    expect(isUnsafeIpAddress('8.8.8.8')).toBe(false);
    expect(isUnsafeIpAddress('2001:4860:4860::8888')).toBe(false);
  });
});

describe('isAllowedOutboundUrlForQueue', () => {
  test('allows safe HTTPS URLs by default', () => {
    expect(isAllowedOutboundUrlForQueue('https://example.com/path', {})).toBe(true);
  });

  test('rejects known unsafe URLs by default', () => {
    expect(isAllowedOutboundUrlForQueue('http://example.com/path', {})).toBe(false);
    expect(isAllowedOutboundUrlForQueue('https://localhost/path', {})).toBe(false);
    expect(isAllowedOutboundUrlForQueue('https://127.0.0.1/path', {})).toBe(false);
    expect(isAllowedOutboundUrlForQueue('not a url', {})).toBe(false);
  });

  test('allows HTTP and unsafe hostnames when unsafe outbound is enabled', () => {
    expect(isAllowedOutboundUrlForQueue('http://localhost/path', { allowUnsafeOutbound: true })).toBe(true);
  });

  test('rejects unsupported protocols when unsafe outbound is enabled', () => {
    expect(isAllowedOutboundUrlForQueue('file://example.com/path', { allowUnsafeOutbound: true })).toBe(false);
  });
});

describe('createSafeConnect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns DNS lookup errors', async () => {
    const dnsError = new Error('DNS failure');
    mockDnsLookup(dnsError, []);
    const connect = createSafeConnect(vi.fn());

    await expect(callConnect(connect, { hostname: 'example.com' })).rejects.toBe(dnsError);
  });

  test('blocks unsafe resolved addresses', async () => {
    mockDnsLookup(null, [{ address: '10.0.0.1', family: 4 }]);
    const connector = vi.fn();
    const connect = createSafeConnect(connector);

    await expect(callConnect(connect, { hostname: 'example.com' })).rejects.toThrow(
      'Outbound request to unsafe address example.com is blocked'
    );
    expect(connector).not.toHaveBeenCalled();
  });

  test('passes resolved address to connector and preserves original hostname for SNI', async () => {
    mockDnsLookup(null, [{ address: '8.8.8.8', family: 4 }]);
    const connector = vi.fn((_options, callback) => callback(null, {} as any));
    const connect = createSafeConnect(connector);

    await expect(callConnect(connect, { hostname: 'example.com' })).resolves.toBeDefined();
    expect(connector).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: '8.8.8.8', servername: 'example.com' }),
      expect.any(Function)
    );
  });
});

describe('safeFetch', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getConfig().allowUnsafeOutbound = undefined;
  });

  test('fetches public HTTPS hosts', async () => {
    const { cert, privateKey } = generateSelfSignedCert('CN=example.com');
    const server = createHttpsServer({ cert, key: privateKey }, (_req, res) => res.end('ok'));

    // Route the TLS connection for the public address to the local server and trust its certificate.
    // Relies on undici's connector calling tls.connect through the module object at call time.
    const tlsConnect = tls.connect;
    const connectSpy = vi
      .spyOn(tls, 'connect')
      .mockImplementation(((options: tls.ConnectionOptions) =>
        tlsConnect({ ...options, host: '127.0.0.1', ca: cert })) as typeof tls.connect);

    await withServer(server, async (port) => {
      mockDnsLookup(null, [{ address: '93.184.216.34', family: 4 }]);
      const response = await safeFetch(`https://example.com:${port}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('ok');
      expect(connectSpy).toHaveBeenCalledWith(
        expect.objectContaining({ host: '93.184.216.34', servername: 'example.com' })
      );
    });
  });

  test('allows local HTTP targets when unsafe outbound is enabled', async () => {
    getConfig().allowUnsafeOutbound = true;
    const server = createHttpServer((_req, res) => res.end('ok'));

    await withServer(server, async (port) => {
      const response = await safeFetch(`http://127.0.0.1:${port}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('ok');
    });
  });

  test('requires HTTPS', async () => {
    await expect(safeFetch('http://example.com/')).rejects.toMatchObject({
      cause: { message: 'Outbound request blocked: HTTPS is required' },
    });
  });

  test('blocks localhost', async () => {
    await expect(safeFetch('https://localhost/')).rejects.toMatchObject({
      cause: { message: 'Outbound request to unsafe hostname localhost is blocked' },
    });
  });

  test('blocks private literal targets', async () => {
    await expect(safeFetch('https://127.0.0.1/')).rejects.toMatchObject({
      cause: { message: 'Outbound request to unsafe hostname 127.0.0.1 is blocked' },
    });
  });

  test('blocks hostnames that resolve to private addresses', async () => {
    mockDnsLookup(null, [{ address: '169.254.169.254', family: 4 }]);
    await expect(safeFetch('https://metadata.example.com/')).rejects.toMatchObject({
      cause: { message: 'Outbound request to unsafe address metadata.example.com is blocked' },
    });
  });
});

async function withServer(server: Server, fn: (port: number) => Promise<void>): Promise<void> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await fn((server.address() as AddressInfo).port);
  } finally {
    // close() waits for active connections, so drop them to keep a failed assertion from stalling teardown
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
}

function callConnect(
  connect: ReturnType<typeof createSafeConnect>,
  options: Partial<Parameters<ReturnType<typeof createSafeConnect>>[0]>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    connect(
      {
        protocol: 'https:',
        hostname: 'example.com',
        port: '443',
        ...options,
      },
      (err, socket) => (err ? reject(err) : resolve(socket))
    );
  });
}

function mockDnsLookup(err: Error | null, addresses: dns.LookupAddress[]): void {
  vi.spyOn(dns, 'lookup').mockImplementation(((...args: unknown[]) => {
    const callback = args[2] as (err: Error | null, addresses: dns.LookupAddress[]) => void;
    callback(err, addresses);
    return {} as any;
  }) as any);
}
