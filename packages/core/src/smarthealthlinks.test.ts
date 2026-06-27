// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { encodeBase64, encodeBase64Url } from './base64';
import type { SmartHealthLinkPayload } from './smarthealthlinks';
import { encodeSmartHealthLink, getSmartHealthLinkId, parseSmartHealthLink } from './smarthealthlinks';

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
    const encodedPayload = encoded.substring('shlink:/'.length);

    expect(encoded).toMatch(/^shlink:\/.+/);
    expect(encodedPayload).toBe(encodeBase64Url(JSON.stringify(payload)));
    expect(encodedPayload).not.toMatch(/[+/=]/);
    expect(parseSmartHealthLink(encoded)).toStrictEqual(payload);
  });

  test('parses a legacy padded base64 SMART Health Link payload', () => {
    const encoded = `shlink:/${encodeBase64(JSON.stringify(payload))}`;

    expect(parseSmartHealthLink(encoded)).toStrictEqual(payload);
  });

  test('parses a SMART Health Link payload without version', () => {
    const { v: _version, ...payloadWithoutVersion } = payload;
    const encoded = `shlink:/${encodeBase64Url(JSON.stringify(payloadWithoutVersion))}`;

    expect(parseSmartHealthLink(encoded)).toStrictEqual(payloadWithoutVersion);
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

  test('HL7 IPS Example', () => {
    // See https://build.fhir.org/ig/HL7/smart-health-cards-and-links/links-examples.html#smart-health-link
    const input =
      'https://viewer.tcpdev.org/shlink.html#shlink:/eyJ1cmwiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vc2Vhbm5vL3NoYy1kZW1vLWRhdGEvbWFpbi9pcHMvSVBTX0lHLWJ1bmRsZS0wMS1lbmMudHh0IiwiZmxhZyI6IkxVIiwia2V5IjoicnhUZ1lsT2FLSlBGdGNFZDBxY2NlTjh3RVU0cDk0U3FBd0lXUWU2dVg3USIsImxhYmVsIjoiRGVtbyBTSEwgZm9yIElQU19JRy1idW5kbGUtMDEifQ';
    expect(parseSmartHealthLink(input)).toStrictEqual({
      url: 'https://raw.githubusercontent.com/seanno/shc-demo-data/main/ips/IPS_IG-bundle-01-enc.txt',
      flag: 'LU',
      key: 'rxTgYlOaKJPFtcEd0qcceN8wEU4p94SqAwIWQe6uX7Q',
      label: 'Demo SHL for IPS_IG-bundle-01',
    });
  });

  test('HL7 CARIN Insurance Card Example', () => {
    // See https://build.fhir.org/ig/HL7/smart-health-cards-and-links/links-examples.html#carin-insurance-card
    const input =
      'https://viewer.tcpdev.org/shlink.html#shlink:/eyJ1cmwiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vc2Vhbm5vL3NoYy1kZW1vLWRhdGEvbWFpbi9jYXJkcy9jYXJpbi1pbnN1cmFuY2UtZXhhbXBsZS9qd3MudHh0IiwiZmxhZyI6IkxVIiwia2V5IjoicnhUZ1lsT2FLSlBGdGNFZDBxY2NlTjh3RVU0cDk0U3FBd0lXUWU2dVg3USIsImxhYmVsIjoiRGVtbyBTSEwgZm9yIGNhcmluLWluc3VyYW5jZS1leGFtcGxlIn0';
    expect(parseSmartHealthLink(input)).toStrictEqual({
      url: 'https://raw.githubusercontent.com/seanno/shc-demo-data/main/cards/carin-insurance-example/jws.txt',
      flag: 'LU',
      key: 'rxTgYlOaKJPFtcEd0qcceN8wEU4p94SqAwIWQe6uX7Q',
      label: 'Demo SHL for carin-insurance-example',
    });
  });

  test('SMART Health Links Test Harness', () => {
    // Generated with https://pshd-shl.exe.xyz/
    const input =
      'shlink:/eyJ1cmwiOiJodHRwczovL3BzaGQtc2hsLmV4ZS54eXovc2hsL093dVBvT0RVQTFwT1R6UFJsbXNkU2pJU0NfZW4wc3BYZy1MWUZyUjhhWmciLCJmbGFnIjoiVSIsImtleSI6InRoMjV2VEowZll1cTQtMFBITGdsOWsxalFNWXRFYWZ4c1M0bzhYUFBnQmMiLCJleHAiOjE3ODI1OTY2MzIsImxhYmVsIjoiSmVzc2ljYSBBcmdvbmF1dCdzIGhlYWx0aCBzdW1tYXJ5In0=';
    expect(parseSmartHealthLink(input)).toStrictEqual({
      url: 'https://pshd-shl.exe.xyz/shl/OwuPoODUA1pOTzPRlmsdSjISC_en0spXg-LYFrR8aZg',
      flag: 'U',
      key: 'th25vTJ0fYuq4-0PHLgl9k1jQMYtEafxsS4o8XPPgBc',
      exp: 1782596632,
      label: "Jessica Argonaut's health summary",
    });
  });
});
