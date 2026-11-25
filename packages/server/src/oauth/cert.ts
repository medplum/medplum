// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { X509Certificate } from 'node:crypto';

/**
 * Validates the client certificate received via ALB passthrough.
 *
 * The certificate must exactly match one of the certificates in the trust store.
 * The ALB TLS handshake proves the client holds the matching private key.
 * Certificates are not trusted by virtue of being issued by a trust store certificate.
 * @param clientPem - The PEM string of the client certificate chain. Only the leaf (first) certificate is used.
 * @param trustStore - The PEM string of the client's trusted certificates.
 * @returns The validated certificate's details (subject, serial, etc.).
 * @throws Error if the certificate is invalid.
 */
export function validateClientCert(clientPem: string, trustStore: string): X509Certificate {
  const clientCert = new X509Certificate(splitPemCertificates(clientPem)[0]);
  const trustedCerts = splitPemCertificates(trustStore).map((pem) => new X509Certificate(pem));
  validateCertExpiration(clientCert);
  if (!trustedCerts.some((trusted) => trusted.fingerprint256 === clientCert.fingerprint256)) {
    throw new Error('Certificate is not in the trusted certificate list');
  }
  return clientCert;
}

/**
 * Helper function to split PEM certificates.
 * @param pemContent - The PEM content containing one or more certificates.
 * @returns An array of individual PEM certificates.
 */
function splitPemCertificates(pemContent: string): string[] {
  const beginMarker = '-----BEGIN CERTIFICATE-----';
  const endMarker = '-----END CERTIFICATE-----';

  const certificates: string[] = [];
  let currentIndex = 0;

  while (currentIndex < pemContent.length) {
    const startIndex = pemContent.indexOf(beginMarker, currentIndex);
    if (startIndex === -1) {
      break;
    }
    const endIndex = pemContent.indexOf(endMarker, startIndex);
    if (endIndex === -1) {
      break;
    }
    const certificate = pemContent.substring(startIndex, endIndex + endMarker.length);
    certificates.push(certificate);
    currentIndex = endIndex + endMarker.length;
  }

  if (certificates.length === 0) {
    throw new Error('No valid PEM certificates found');
  }

  return certificates;
}

/**
 * Validates the expiration dates of a certificate.
 * @param cert - The certificate to validate.
 * @throws Error if the certificate is expired or not yet valid.
 */
export function validateCertExpiration(cert: X509Certificate): void {
  const now = new Date();
  const validFrom = new Date(cert.validFrom);
  if (now < validFrom) {
    throw new Error(`Certificate not yet active. Valid from: ${validFrom.toISOString()}`);
  }

  const validTo = new Date(cert.validTo);
  if (now > validTo) {
    throw new Error(`Certificate expired on: ${validTo.toISOString()}`);
  }
}
