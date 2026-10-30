// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Project } from '@medplum/fhirtypes';
import dns from 'node:dns';
import net from 'node:net';
import type { SMTPTransportGetSocket } from 'nodemailer/lib/smtp-transport';
import { vi } from 'vitest';
import type * as Url from '../util/url';
import { addressToString, applyFromDisplayName, getProjectAppName, getProjectSmtpSocket } from './utils';

const urlMocks = vi.hoisted(() => ({ allowUnsafeIpAddress: false }));

vi.mock('../util/url', async (importOriginal) => {
  const actual = await importOriginal<typeof Url>();
  return {
    ...actual,
    isUnsafeIpAddress: (address: string) => !urlMocks.allowUnsafeIpAddress && actual.isUnsafeIpAddress(address),
  };
});

describe('Email utils', () => {
  function projectWithAppName(valueString: string | undefined): Project {
    if (valueString === undefined) {
      return { resourceType: 'Project' };
    }
    return { resourceType: 'Project', setting: [{ name: 'appName', valueString }] };
  }

  test('getProjectAppName returns undefined when unset', () => {
    expect(getProjectAppName(undefined)).toBeUndefined();
    expect(getProjectAppName(projectWithAppName(undefined))).toBeUndefined();
    expect(getProjectAppName({ resourceType: 'Project', setting: [] })).toBeUndefined();
  });

  test('getProjectAppName treats a blank app name as unset', () => {
    expect(getProjectAppName(projectWithAppName(''))).toBeUndefined();
    expect(getProjectAppName(projectWithAppName('   '))).toBeUndefined();
  });

  test('getProjectAppName returns the trimmed app name', () => {
    expect(getProjectAppName(projectWithAppName('Acme Health'))).toBe('Acme Health');
    expect(getProjectAppName(projectWithAppName('  Acme Health  '))).toBe('Acme Health');
  });

  test('addressToString', () => {
    expect(addressToString(undefined)).toBeUndefined();
    expect(addressToString('foo@example.com')).toBe('foo@example.com');
    expect(addressToString({ name: 'name', address: 'foo@example.com' })).toBe('foo@example.com');
    expect(addressToString(['foo@example.com'])).toBe('foo@example.com');
    expect(addressToString([{ name: 'name', address: 'foo@example.com' }])).toBe('foo@example.com');
  });

  test('applyFromDisplayName', () => {
    expect(applyFromDisplayName('noreply@acme.com', 'Acme Health')).toStrictEqual({
      name: 'Acme Health',
      address: 'noreply@acme.com',
    });
    // Without an app name, the address is used as-is.
    expect(applyFromDisplayName('noreply@acme.com', undefined)).toBe('noreply@acme.com');
    // A display name already set on the address wins over the app name.
    expect(applyFromDisplayName('"Acme Billing" <noreply@acme.com>', 'Acme Health')).toBe(
      '"Acme Billing" <noreply@acme.com>'
    );
  });

  describe('getProjectSmtpSocket', () => {
    afterEach(() => {
      urlMocks.allowUnsafeIpAddress = false;
      vi.restoreAllMocks();
    });

    function mockLookup(addresses: dns.LookupAddress[] | Error | undefined): void {
      vi.spyOn(dns, 'lookup').mockImplementation(((
        _hostname: string,
        _options: dns.LookupAllOptions,
        callback: (err: Error | null, addresses: dns.LookupAddress[]) => void
      ) => {
        if (addresses instanceof Error) {
          callback(addresses, []);
        } else if (addresses) {
          callback(null, addresses);
        }
      }) as unknown as typeof dns.lookup);
    }

    function openSocket(
      getSocket: SMTPTransportGetSocket,
      host: string,
      port = 587,
      connectionTimeout = 1000
    ): Promise<net.Socket> {
      return new Promise((resolve, reject) => {
        getSocket({ host, port, connectionTimeout }, (err, socketOptions) =>
          err ? reject(err) : resolve((socketOptions as { connection: net.Socket }).connection)
        );
      });
    }

    test.each([
      ['a private address', 'smtp.project.example.com', [{ address: '10.20.30.40', family: 4 }]],
      [
        'a public and a private address',
        'smtp.project.example.com',
        [
          { address: '93.184.215.14', family: 4 },
          { address: '10.20.30.40', family: 4 },
        ],
      ],
      ['no addresses', 'smtp.project.example.com', []],
      ['an unsafe IP literal', '10.20.30.40', undefined],
    ])('Rejects a project SMTP host with %s', async (_label, host, addresses) => {
      mockLookup(addresses);
      await expect(openSocket(getProjectSmtpSocket('p1'), host)).rejects.toThrow(
        'Project SMTP configuration is incomplete or invalid'
      );
    });

    test('Connects through any resolved address', async () => {
      const server = net.createServer((socket) => socket.end());
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });
      const { port } = server.address() as net.AddressInfo;
      urlMocks.allowUnsafeIpAddress = true;
      mockLookup([
        { address: '::1', family: 6 },
        { address: '127.0.0.1', family: 4 },
      ]);

      try {
        const socket = await openSocket(getProjectSmtpSocket('p1'), 'smtp.project.example.com', port);
        expect(socket.remoteAddress).toBe('127.0.0.1');
        socket.destroy();
      } finally {
        server.close();
      }
    });

    test('Passes through lookup errors', async () => {
      mockLookup(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
      await expect(openSocket(getProjectSmtpSocket('p1'), 'smtp.project.example.com')).rejects.toMatchObject({
        code: 'ENOTFOUND',
      });
    });

    test('Times out when resolving and connecting take too long', async () => {
      mockLookup(undefined);
      await expect(openSocket(getProjectSmtpSocket('p1'), 'smtp.project.example.com', 587, 50)).rejects.toMatchObject({
        code: 'ETIMEDOUT',
      });
    });
  });
});
