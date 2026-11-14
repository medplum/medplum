// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OAuthSigningAlgorithm } from '@medplum/core';
import type { Request } from 'express';
import type { JWK } from 'jose';
import { calculateJwkThumbprint, EmbeddedJWK, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import { getConfig } from '../config/loader';
import { getCacheRedis } from '../redis';

const DPOP_MAX_AGE_SECONDS = 300;
const DPOP_CLOCK_TOLERANCE_SECONDS = 60;
const DPOP_JTI_KEY_PREFIX = 'medplum:dpop:jti:';

export const DPOP_SIGNING_ALGORITHMS = [
  OAuthSigningAlgorithm.ES256,
  OAuthSigningAlgorithm.ES384,
  OAuthSigningAlgorithm.ES512,
  OAuthSigningAlgorithm.RS256,
  OAuthSigningAlgorithm.RS384,
  OAuthSigningAlgorithm.RS512,
  OAuthSigningAlgorithm.PS256,
  OAuthSigningAlgorithm.PS384,
  OAuthSigningAlgorithm.PS512,
];

declare module 'express-serve-static-core' {
  interface Locals {
    /** JWK thumbprint of the request's verified DPoP proof, set by the token endpoint. */
    dpopJkt?: string;
  }
}

export type DpopProofResult = { jkt: string } | { error: string };

/**
 * Verifies the DPoP proof in the request's DPoP header.
 * See RFC 9449 section 4.3.
 * @param req - The HTTP request carrying the DPoP header.
 * @param accessToken - The access token presented with the proof, if any. When set, the proof must carry a matching `ath` claim.
 * @returns The JWK SHA-256 thumbprint of the proof key on success, or an error message on failure.
 */
export async function verifyDpopProof(req: Request, accessToken?: string): Promise<DpopProofResult> {
  const headers = req.headersDistinct.dpop;
  if (headers?.length !== 1) {
    return { error: 'Expected exactly one DPoP header' };
  }

  let payload: Record<string, unknown>;
  let jwk: JWK;
  try {
    const result = await jwtVerify(headers[0], EmbeddedJWK, {
      typ: 'dpop+jwt',
      algorithms: DPOP_SIGNING_ALGORITHMS,
      requiredClaims: ['jti', 'htm', 'htu'],
      maxTokenAge: DPOP_MAX_AGE_SECONDS,
      clockTolerance: DPOP_CLOCK_TOLERANCE_SECONDS,
    });
    payload = result.payload;
    jwk = result.protectedHeader.jwk as JWK;
  } catch {
    return { error: 'Invalid DPoP proof' };
  }

  if (payload.htm !== req.method) {
    return { error: 'DPoP proof htm mismatch' };
  }

  const htu = normalizeHtu(payload.htu);
  if (!htu || !getExpectedHtus(req).includes(htu)) {
    return { error: 'DPoP proof htu mismatch' };
  }

  if (accessToken !== undefined && payload.ath !== createHash('sha256').update(accessToken).digest('base64url')) {
    return { error: 'DPoP proof ath mismatch' };
  }

  const jkt = await calculateJwkThumbprint(jwk, 'sha256');
  const replayKey = DPOP_JTI_KEY_PREFIX + jkt + ':' + payload.jti;
  const ttl = DPOP_MAX_AGE_SECONDS + DPOP_CLOCK_TOLERANCE_SECONDS;
  if ((await getCacheRedis().set(replayKey, '1', 'EX', ttl, 'NX')) !== 'OK') {
    return { error: 'DPoP proof replayed' };
  }

  return { jkt };
}

/**
 * Returns the acceptable `htu` values for the request.
 * The scheme and host always come from the configured base URL, never from request headers.
 * Two candidates cover deployments where a reverse proxy does or does not strip the base URL path prefix.
 * @param req - The HTTP request.
 * @returns The normalized URLs a proof for this request may target.
 */
function getExpectedHtus(req: Request): string[] {
  const baseUrl = new URL(getConfig().baseUrl);
  const path = req.originalUrl.split('?')[0];
  const basePath = baseUrl.pathname.replace(/\/$/, '');
  return [new URL(baseUrl.origin + path).href, new URL(baseUrl.origin + basePath + path).href];
}

/**
 * Normalizes an `htu` value for comparison, dropping the query and fragment (RFC 9449 section 4.3).
 * @param htu - The URL to normalize.
 * @returns The normalized URL, or undefined if the input is not a valid URL.
 */
function normalizeHtu(htu: unknown): string | undefined {
  if (typeof htu !== 'string') {
    return undefined;
  }
  try {
    const url = new URL(htu);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return undefined;
  }
}
