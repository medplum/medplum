// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { execSync } from 'node:child_process';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateClientCert } from './cert';

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
});

/**
 * Helper function to generate a self-signed certificate for testing.
 * @param subject - The subject name for the certificate.
 * @param isCA - Whether the certificate should be a CA certificate.
 * @returns The generated certificate and private key.
 */
function generateSelfSignedCert(subject: string, isCA = false): { cert: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Create certificate using X509Certificate (Node.js 15.6+)
  const cert = createCertificate(subject, subject, publicKey, privateKey, isCA);

  return { cert, privateKey };
}

/**
 * Helper function to generate a CA-signed certificate for testing.
 * @param subject - The subject name for the certificate.
 * @param ca - The CA certificate and private key.
 * @param ca.cert - The CA certificate.
 * @param ca.privateKey - The CA private key.
 * @returns The generated certificate and private key.
 */
function generateCaSignedCert(
  subject: string,
  ca: { cert: string; privateKey: string }
): { cert: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const cert = createCaSignedCertificate(subject, publicKey, privateKey, ca.cert, ca.privateKey);

  return { cert, privateKey };
}

/**
 * Creates a certificate using openssl command
 * @param subject - The subject name for the certificate.
 * @param issuer - The issuer name for the certificate.
 * @param publicKey - The public key for the certificate.
 * @param signingKey - The private key used to sign the certificate.
 * @param isCA - Whether the certificate should be a CA certificate.
 * @param notBeforeDays - Number of days from now when the certificate becomes valid.
 * @param notAfterDays - Number of days from now when the certificate expires.
 * @returns The generated certificate in PEM format.
 */
function createCertificate(
  subject: string,
  issuer: string,
  publicKey: string,
  signingKey: string,
  isCA: boolean,
  notBeforeDays = 0,
  notAfterDays = 365
): string {
  // Create temporary directory
  const tmpDir = mkdtempSync(join(tmpdir(), 'cert-test-'));

  try {
    // Write keys to temporary files
    const publicKeyPath = join(tmpDir, 'public.pem');
    const signingKeyPath = join(tmpDir, 'signing.pem');
    const certPath = join(tmpDir, 'cert.pem');
    const configPath = join(tmpDir, 'openssl.cnf');

    writeFileSync(publicKeyPath, publicKey);
    writeFileSync(signingKeyPath, signingKey);

    // Create OpenSSL config
    const config = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${subject.replace('CN=', '')}

[v3_req]
basicConstraints = CA:${isCA ? 'TRUE' : 'FALSE'}
keyUsage = ${isCA ? 'keyCertSign, cRLSign' : 'digitalSignature, keyEncipherment'}
`;

    writeFileSync(configPath, config);

    // Calculate dates
    const notBefore = new Date();
    notBefore.setDate(notBefore.getDate() + notBeforeDays);
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + notAfterDays);

    // Generate certificate using OpenSSL
    const cmd = `openssl req -new -x509 -key "${signingKeyPath}" -out "${certPath}" -days ${notAfterDays - notBeforeDays} -config "${configPath}"`;

    execSync(cmd, { stdio: 'pipe' });

    const cert = readFileSync(certPath, 'utf8');
    return cert;
  } finally {
    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Creates a CA-signed certificate using openssl command.
 * @param subject - The subject name for the certificate.
 * @param publicKey - The public key for the certificate.
 * @param privateKey - The private key for the certificate.
 * @param caCert - The CA certificate.
 * @param caPrivateKey - The CA private key.
 * @param notBeforeDays - Number of days from now when the certificate becomes valid.
 * @param notAfterDays - Number of days from now when the certificate expires.
 * @returns The generated certificate in PEM format.
 */
function createCaSignedCertificate(
  subject: string,
  publicKey: string,
  privateKey: string,
  caCert: string,
  caPrivateKey: string,
  notBeforeDays = 0,
  notAfterDays = 365
): string {
  // Create temporary directory
  const tmpDir = mkdtempSync(join(tmpdir(), 'cert-test-'));

  try {
    // Write files to temporary directory
    const privateKeyPath = join(tmpDir, 'private.pem');
    const csrPath = join(tmpDir, 'csr.pem');
    const certPath = join(tmpDir, 'cert.pem');
    const caCertPath = join(tmpDir, 'ca-cert.pem');
    const caKeyPath = join(tmpDir, 'ca-key.pem');
    const configPath = join(tmpDir, 'openssl.cnf');
    const extConfigPath = join(tmpDir, 'ext.cnf');

    writeFileSync(privateKeyPath, privateKey);
    writeFileSync(caCertPath, caCert);
    writeFileSync(caKeyPath, caPrivateKey);

    // Create OpenSSL config for CSR
    const config = `
[req]
distinguished_name = req_distinguished_name
prompt = no

[req_distinguished_name]
CN = ${subject.replace('CN=', '')}
`;

    writeFileSync(configPath, config);

    // Create extension config
    const extConfig = `
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
`;

    writeFileSync(extConfigPath, extConfig);

    // Step 1: Generate CSR
    execSync(`openssl req -new -key "${privateKeyPath}" -out "${csrPath}" -config "${configPath}"`, {
      stdio: 'pipe',
    });

    // Step 2: Sign CSR with CA
    const days = notAfterDays - notBeforeDays;
    execSync(
      `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${certPath}" -days ${days} -extfile "${extConfigPath}"`,
      { stdio: 'pipe' }
    );

    const cert = readFileSync(certPath, 'utf8');
    return cert;
  } finally {
    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
