// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  encodeSmartHealthLink,
  getSmartHealthLinkId,
  parseSmartHealthLink,
  type SmartHealthLinkPayload,
} from './smarthealthlinks';

describe('SMART Health Links', () => {
  const payload: SmartHealthLinkPayload = {
    url: 'https://example.com/fhir/shl/abc123/manifest',
    key: 'test-key',
    exp: 1_735_689_600,
    flag: 'P',
    label: 'Test Label',
    v: 1,
  };

  test('encodes and parses a SMART Health Link', () => {
    const encoded = encodeSmartHealthLink(payload);

    expect(encoded).toMatch(/^shlink:\/.+/);
    expect(parseSmartHealthLink(encoded)).toStrictEqual(payload);
  });

  test('parses a SMART Health Link from a URL fragment', () => {
    const encoded = encodeSmartHealthLink(payload);

    expect(parseSmartHealthLink(`https://viewer.example/launch#${encoded}`)).toStrictEqual(payload);
  });

  test('throws on an invalid SMART Health Link URI', () => {
    expect(() => parseSmartHealthLink('https://example.com')).toThrow('Invalid SMART Health Link URI');
    expect(() => parseSmartHealthLink('smart-health-card:/abc123')).toThrow('Invalid SMART Health Link URI');
  });

  test('throws on an invalid SMART Health Link payload', () => {
    expect(() =>
      parseSmartHealthLink(
        encodeSmartHealthLink({
          url: 'https://example.com/fhir/shl/abc123/manifest',
          key: 'test-key',
          v: 2,
        } as unknown as SmartHealthLinkPayload)
      )
    ).toThrow('Invalid SMART Health Link payload');

    expect(() =>
      parseSmartHealthLink(
        encodeSmartHealthLink({
          url: 'https://example.com/fhir/shl/abc123/manifest',
          v: 1,
        } as unknown as SmartHealthLinkPayload)
      )
    ).toThrow('Invalid SMART Health Link payload');

    expect(() =>
      parseSmartHealthLink(
        encodeSmartHealthLink({
          key: 'test-key',
          v: 1,
        } as unknown as SmartHealthLinkPayload)
      )
    ).toThrow('Invalid SMART Health Link payload');
  });

  test('gets SMART Health Link ID from manifest and payload URLs', () => {
    expect(getSmartHealthLinkId('https://example.com/fhir/shl/abc123/manifest')).toBe('abc123');
    expect(getSmartHealthLinkId('https://example.com/fhir/shl/abc123/payload')).toBe('abc123');
    expect(getSmartHealthLinkId('/fhir/R4/shl/link-id/manifest')).toBe('link-id');
  });

  test('returns undefined when URL does not identify a SMART Health Link manifest or payload', () => {
    expect(getSmartHealthLinkId('https://example.com/fhir/shl/abc123')).toBeUndefined();
    expect(getSmartHealthLinkId('https://example.com/fhir/shl/abc123/manifest/')).toBeUndefined();
    expect(getSmartHealthLinkId('https://example.com/fhir/shl/abc123/status')).toBeUndefined();
    expect(getSmartHealthLinkId('https://example.com/fhir/shl/abc123/nested/manifest')).toBeUndefined();
  });
});
