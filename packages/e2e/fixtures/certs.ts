// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import * as x509 from '@peculiar/x509';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CERT_DIR = join(import.meta.dirname, '..', '.certs');
export const CA_CERT_PATH = join(CERT_DIR, 'ca.pem');
const LOCALHOST_CERT_PATH = join(CERT_DIR, 'localhost.pem');
const LOCALHOST_KEY_PATH = join(CERT_DIR, 'localhost-key.pem');

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const VALIDITY_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Creates the test CA and a `localhost` certificate signed by it, unless both already exist.
 *
 * The server trusts the CA through `NODE_EXTRA_CA_CERTS`, which Node reads only at startup, so this
 * must run before Playwright starts `webServer`.
 */
export async function ensureTestCertificates(): Promise<void> {
  if ([CA_CERT_PATH, LOCALHOST_CERT_PATH, LOCALHOST_KEY_PATH].every((path) => existsSync(path))) {
    return;
  }

  x509.cryptoProvider.set(crypto);
  // Backdate to tolerate clock skew between this process and the server
  const notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const notAfter = new Date(notBefore.getTime() + VALIDITY_MS);

  const caKeys = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const ca = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: 'CN=Medplum e2e test CA',
    notBefore,
    notAfter,
    keys: caKeys,
    signingAlgorithm: ALGORITHM,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  });

  const leafKeys = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: '02',
    subject: 'CN=localhost',
    issuer: ca.subject,
    notBefore,
    notAfter,
    publicKey: leafKeys.publicKey,
    signingKey: caKeys.privateKey,
    signingAlgorithm: ALGORITHM,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([
        { type: 'dns', value: 'localhost' },
        { type: 'ip', value: '127.0.0.1' },
      ]),
      await x509.AuthorityKeyIdentifierExtension.create(ca),
    ],
  });

  mkdirSync(CERT_DIR, { recursive: true });
  writeFileSync(CA_CERT_PATH, ca.toString('pem'));
  writeFileSync(LOCALHOST_CERT_PATH, leaf.toString('pem'));
  const leafKey = await crypto.subtle.exportKey('pkcs8', leafKeys.privateKey);
  writeFileSync(LOCALHOST_KEY_PATH, x509.PemConverter.encode(leafKey, 'PRIVATE KEY'));
}

/**
 * Returns the `localhost` certificate and key for mock HTTPS servers.
 * @returns The PEM-encoded certificate and private key.
 */
export function getLocalhostCertificate(): { cert: string; key: string } {
  return { cert: readFileSync(LOCALHOST_CERT_PATH, 'utf8'), key: readFileSync(LOCALHOST_KEY_PATH, 'utf8') };
}
