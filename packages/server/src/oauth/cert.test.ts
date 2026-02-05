// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { X509Certificate } from 'node:crypto';
import { generateCaSignedCert, generateSelfSignedCert } from '../test.setup';
import { validateCertExpiration, validateClientCert } from './cert';

describe('Certificate validation', () => {
  describe('validateClientCert', () => {
    test('Valid self-signed certificate', () => {
      const { cert } = generateSelfSignedCert('CN=Test Client');
      const result = validateClientCert(cert, cert);
      expect(result).toBeInstanceOf(X509Certificate);
      expect(result.subject).toBe('CN=Test Client');
    });

    test('Valid CA-signed certificate', () => {
      const ca = generateSelfSignedCert('CN=Test CA', true);
      const client = generateCaSignedCert('CN=Test Client', ca);
      const result = validateClientCert(client.cert, ca.cert);
      expect(result).toBeInstanceOf(X509Certificate);
      expect(result.subject).toBe('CN=Test Client');
    });

    test('Multiple certificates in client PEM', () => {
      const ca = generateSelfSignedCert('CN=Test CA', true);
      const client = generateCaSignedCert('CN=Test Client', ca);
      const multipleCerts = client.cert + '\n' + ca.cert;
      const result = validateClientCert(multipleCerts, ca.cert);
      expect(result).toBeInstanceOf(X509Certificate);
      expect(result.subject).toBe('CN=Test Client');
    });

    test('Multiple trusted CAs', () => {
      const ca1 = generateSelfSignedCert('CN=Test CA 1', true);
      const ca2 = generateSelfSignedCert('CN=Test CA 2', true);
      const client = generateCaSignedCert('CN=Test Client', ca2);
      const multipleCAs = ca1.cert + '\n' + ca2.cert;
      const result = validateClientCert(client.cert, multipleCAs);
      expect(result).toBeInstanceOf(X509Certificate);
      expect(result.subject).toBe('CN=Test Client');
    });

    test('Self-signed certificate not in trusted list', () => {
      const cert1 = generateSelfSignedCert('CN=Test Client 1');
      const cert2 = generateSelfSignedCert('CN=Test Client 2');
      expect(() => validateClientCert(cert1.cert, cert2.cert)).toThrow(
        'Self-signed certificate is not in the trusted certificate list'
      );
    });

    test('CA-signed certificate with untrusted CA', () => {
      const ca1 = generateSelfSignedCert('CN=Test CA 1', true);
      const ca2 = generateSelfSignedCert('CN=Test CA 2', true);
      const client = generateCaSignedCert('CN=Test Client', ca1);
      expect(() => validateClientCert(client.cert, ca2.cert)).toThrow('Certificate validation failed');
    });

    // Note: Testing expired and not-yet-valid certificates is challenging because
    // OpenSSL's `req -new -x509` command doesn't allow setting custom validity dates.
    // The validation logic for expiration is straightforward (see cert.ts:63-73),
    // so we rely on the other tests to ensure the validation chain works correctly.

    test('No valid PEM certificates found in client cert', () => {
      const trustedCAs = generateSelfSignedCert('CN=Test CA', true);
      expect(() => validateClientCert('not a certificate', trustedCAs.cert)).toThrow('No valid PEM certificates found');
    });

    test('No valid PEM certificates found in trusted CAs', () => {
      const cert = generateSelfSignedCert('CN=Test Client');
      expect(() => validateClientCert(cert.cert, 'not a certificate')).toThrow('No valid PEM certificates found');
    });

    test('Malformed PEM with BEGIN but no END marker', () => {
      const malformedPem = '-----BEGIN CERTIFICATE-----\nMIID...';
      const trustedCAs = generateSelfSignedCert('CN=Test CA', true);
      expect(() => validateClientCert(malformedPem, trustedCAs.cert)).toThrow('No valid PEM certificates found');
    });

    test('Empty PEM string', () => {
      const trustedCAs = generateSelfSignedCert('CN=Test CA', true);
      expect(() => validateClientCert('', trustedCAs.cert)).toThrow('No valid PEM certificates found');
    });

    test('Whitespace-only PEM string', () => {
      const trustedCAs = generateSelfSignedCert('CN=Test CA', true);
      expect(() => validateClientCert('   \n\n   ', trustedCAs.cert)).toThrow('No valid PEM certificates found');
    });

    test('Certificate with tampered signature', () => {
      const ca = generateSelfSignedCert('CN=Test CA', true);
      const client = generateCaSignedCert('CN=Test Client', ca);

      // Tamper with the certificate by replacing a character in the middle
      const lines = client.cert.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Find a line with substantial base64 data (not BEGIN/END markers, and long enough)
        if (lines[i].length > 20 && !lines[i].includes('BEGIN') && !lines[i].includes('END')) {
          // Replace a character in the middle
          const mid = Math.floor(lines[i].length / 2);
          lines[i] = lines[i].substring(0, mid) + 'X' + lines[i].substring(mid + 1);
          break;
        }
      }
      const tamperedCert = lines.join('\n');

      // The tampered certificate should fail to parse or fail validation
      expect(() => validateClientCert(tamperedCert, ca.cert)).toThrow();
    });

    test('PEM with multiple certificates extracts first one', () => {
      const ca = generateSelfSignedCert('CN=Test CA', true);
      const client1 = generateCaSignedCert('CN=Test Client 1', ca);
      const client2 = generateCaSignedCert('CN=Test Client 2', ca);

      const multipleCerts = client1.cert + '\n' + client2.cert;
      const result = validateClientCert(multipleCerts, ca.cert);

      // Should validate the first certificate
      expect(result.subject).toBe('CN=Test Client 1');
    });
  });

  describe('validateCertExpiration', () => {
    // Because generating expired or not-yet-valid certificates is complex,
    // we will directly test the validateCertExpiration function with mocked certificates.

    test('Valid certificate dates', () => {
      const { cert } = generateSelfSignedCert('CN=Valid Cert');
      const x509 = new X509Certificate(cert);
      expect(() => validateCertExpiration(x509)).not.toThrow();
    });

    test('Certificate not yet valid', () => {
      const { cert } = generateSelfSignedCert('CN=Future Cert', false);
      const x509 = new X509Certificate(cert);

      // Mock the validFrom date to be in the future
      jest.spyOn(x509, 'validFrom', 'get').mockReturnValue(new Date(Date.now() + 1000 * 60 * 60).toISOString());

      expect(() => validateCertExpiration(x509)).toThrow('Certificate not yet active');
    });

    test('Expired certificate', () => {
      const { cert } = generateSelfSignedCert('CN=Expired Cert', false);
      const x509 = new X509Certificate(cert);

      // Mock the validTo date to be in the past
      jest.spyOn(x509, 'validTo', 'get').mockReturnValue(new Date(Date.now() - 1000 * 60 * 60).toISOString());

      expect(() => validateCertExpiration(x509)).toThrow('Certificate expired on');
    });
  });
});
