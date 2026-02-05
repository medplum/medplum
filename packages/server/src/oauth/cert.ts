// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { normalizeErrorString } from '@medplum/core';
import { X509Certificate } from 'node:crypto';

/**
 * Validates the client certificate received via ALB passthrough.
 * @param clientPem - The PEM string of the client certificate.
 * @param trustedCAs - The PEM string of the tenant's trusted CAs.
 * @returns The validated certificate's details (subject, serial, etc.).
 * @throws Error if the certificate is invalid.
 */
export function validateClientCert(clientPem: string, trustedCAs: string): X509Certificate {
  const clientCert = new X509Certificate(splitPemCertificates(clientPem)[0]);
  const trustedCerts = splitPemCertificates(trustedCAs).map((pem) => new X509Certificate(pem));
  validateCertExpiration(clientCert);
  if (isSelfSignedCert(clientCert)) {
    validateSelfSignedCert(clientCert, trustedCerts);
  } else {
    validateCaSignedCert(clientCert, trustedCerts);
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

/**
 * Returns true if the certificate is self-signed.
 * @param cert - The certificate to check.
 * @returns True if the certificate is self-signed, false otherwise.
 */
function isSelfSignedCert(cert: X509Certificate): boolean {
  return cert.issuer === cert.subject;
}

/**
 * Validates a self-signed certificate.
 * @param clientCert - The client certificate.
 * @param trustedCerts - The list of trusted certificates.
 * @throws Error if the certificate is not trusted or has an invalid signature.
 */
function validateSelfSignedCert(clientCert: X509Certificate, trustedCerts: X509Certificate[]): void {
  // Self-signed certificate: Must be explicitly trusted
  const clientFingerprint = clientCert.fingerprint256;
  const isTrusted = trustedCerts.some((trusted) => trusted.fingerprint256 === clientFingerprint);

  if (!isTrusted) {
    throw new Error('Self-signed certificate is not in the trusted certificate list');
  }

  // Verify self-signature (important!)
  if (!clientCert.verify(clientCert.publicKey)) {
    throw new Error('Self-signed certificate has invalid signature');
  }
}

/**
 * Validates a CA signed certificate.
 * @param clientCert - The client certificate.
 * @param trustedCerts - The list of trusted certificates.
 * @throws Error if the certificate is not trusted or has an invalid signature.
 */
function validateCaSignedCert(clientCert: X509Certificate, trustedCerts: X509Certificate[]): void {
  let lastError: string | undefined = undefined;
  for (const caCert of trustedCerts) {
    try {
      // Check if this CA issued the certificate
      if (clientCert.checkIssued(caCert)) {
        // Verify the signature using the CA's public key
        if (clientCert.verify(caCert.publicKey)) {
          return;
        }
      }
    } catch (err) {
      lastError = normalizeErrorString(err);
    }
  }
  throw new Error(`Certificate validation failed: ${lastError ?? 'No matching CA found'}`);
}
