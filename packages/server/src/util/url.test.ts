// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isUnsafeHostname, isUnsafeIpAddress, validateOutboundUrl } from './url';

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
  });

  test('allows public addresses', () => {
    expect(isUnsafeIpAddress('8.8.8.8')).toBe(false);
    expect(isUnsafeIpAddress('2001:4860:4860::8888')).toBe(false);
  });
});
