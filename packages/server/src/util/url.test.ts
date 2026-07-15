// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import dns from 'node:dns';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetch } from 'undici';
import { vi } from 'vitest';
import {
  createSafeConnect,
  isAllowedOutboundUrlForQueue,
  isUnsafeHostname,
  isUnsafeIpAddress,
  safeAgent,
  validateOutboundUrl,
} from './url';

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

describe('safeAgent', () => {
  test('requires HTTPS', async () => {
    await expect(fetch('http://example.com/', { dispatcher: safeAgent })).rejects.toThrow('fetch failed');
  });

  test('blocks localhost fetches before opening a socket', async () => {
    const server = createServer((_req, res) => res.end('ok'));
    await listen(server);

    try {
      await expect(fetch(`https://localhost:${getPort(server)}`, { dispatcher: safeAgent })).rejects.toThrow(
        'fetch failed'
      );
    } finally {
      await close(server);
    }
  });

  test('blocks private literal targets', async () => {
    await expect(fetch('https://127.0.0.1/', { dispatcher: safeAgent })).rejects.toThrow('fetch failed');
  });
});

function getPort(server: ReturnType<typeof createServer>): number {
  return (server.address() as AddressInfo).port;
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
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
