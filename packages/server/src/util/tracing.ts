// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';

// https://www.w3.org/TR/trace-context/#traceparent-header

type hex = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
type twohex = `${hex}${hex}`;

export type Traceparent = {
  version?: twohex;
  traceId: string;
  parentId: string;
  flags?: hex | twohex;
};

const traceparentRegex = /^([0-9a-f]{2})?-?([0-9a-f]{32})-([0-9a-f]{16})-?([0-9a-f]{1,2})?$/i;

export function parseTraceparent(traceparent: string): Traceparent | null {
  const match = traceparentRegex.exec(traceparent);
  if (!match) {
    return null;
  }

  return {
    version: (match[1] ?? undefined) as Traceparent['version'],
    traceId: match[2],
    parentId: match[3],
    flags: (match[4] ?? undefined) as Traceparent['flags'],
  };
}

/**
 * Characters allowed in a trace ID accepted from a caller.
 *
 * A trace ID is written to JSON log lines and to `AuditEvent` resources, so an accepted value must
 * be safe in both places. This is the character set of the FHIR `id` type, the narrower of the two.
 *
 * Deliberately broader than a UUID: OpenTelemetry emits trace IDs as bare 32 character hex,
 * X-Ray uses `1-{8 hex}-{24 hex}`, and Datadog uses decimal. None of those are UUIDs.
 */
const SAFE_TRACE_ID_REGEX = /^[A-Za-z0-9.-]{1,64}$/;

/** A W3C trace ID: 16 bytes as 32 lowercase hex characters. */
const TRACE_ID_REGEX = /^[0-9a-f]{32}$/;

/** A UUID, which is also a 128 bit value and so converts cleanly to a W3C trace ID. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An X-Ray trace ID: `1-{8 hex epoch}-{24 hex unique}`, which is also a 128 bit value. */
const XRAY_TRACE_ID_REGEX = /^1-([0-9a-f]{8})-([0-9a-f]{24})$/i;

/** The all-zero trace ID, which the W3C spec defines as invalid. */
const INVALID_TRACE_ID = '0'.repeat(32);

/**
 * Normalizes a trace ID to a canonical form.
 *
 * Values that represent a 128 bit trace ID are converted to lowercase hex, so that a UUID, an
 * X-Ray trace ID, and a W3C trace ID for the same trace all normalize to the same string. Other
 * safe values are preserved as-is, because there is no lossless conversion for them.
 *
 * @param value - The raw trace ID from a request header.
 * @returns The normalized trace ID, or undefined if the value is unsafe or invalid.
 */
export function normalizeTraceId(value: string): string | undefined {
  const hex = toTraceIdHex(value);
  if (hex) {
    return hex === INVALID_TRACE_ID ? undefined : hex;
  }
  return SAFE_TRACE_ID_REGEX.test(value) ? value : undefined;
}

/**
 * Converts a 128 bit trace ID to canonical hex, if the value is one.
 * @param value - The raw trace ID.
 * @returns 32 lowercase hex characters, or undefined if the value is not a 128 bit trace ID.
 */
function toTraceIdHex(value: string): string | undefined {
  const lower = value.toLowerCase();

  if (TRACE_ID_REGEX.test(lower)) {
    return lower;
  }

  if (UUID_REGEX.test(lower)) {
    return lower.replaceAll('-', '');
  }

  const xray = XRAY_TRACE_ID_REGEX.exec(lower);
  if (xray) {
    return xray[1] + xray[2];
  }

  return undefined;
}

/**
 * Generates a new trace ID in canonical W3C form.
 * @returns A random 128 bit trace ID as 32 lowercase hex characters.
 */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Builds a W3C `traceparent` header value for an outbound request.
 *
 * A new span ID is generated for each call, because the outbound request is a new span within the
 * current trace. Returns undefined when the trace ID is not a W3C trace ID, since a `traceparent`
 * carrying a malformed trace ID is worse than no `traceparent` at all.
 *
 * The sampled flag is always set: Medplum does not make its own sampling decision, and an
 * unsampled trace would leave nothing to correlate against during an incident.
 *
 * @param traceId - The current trace ID.
 * @returns A valid `traceparent` header value, or undefined if one cannot be built.
 * @see https://www.w3.org/TR/trace-context/#traceparent-header
 */
export function buildTraceparent(traceId: string | undefined): string | undefined {
  if (!traceId || !TRACE_ID_REGEX.test(traceId) || traceId === INVALID_TRACE_ID) {
    return undefined;
  }
  return `00-${traceId}-${randomBytes(8).toString('hex')}-01`;
}

/**
 * Returns the trace ID for an incoming request.
 *
 * `traceparent` is checked first because it is the W3C standard and is what OpenTelemetry SDKs
 * emit. `x-trace-id` remains supported for callers that do not implement trace context.
 *
 * Each source is tried in turn, and a source that yields no usable trace ID falls through to the
 * next rather than ending the search. A caller that sends both an unusable `traceparent` and a
 * valid `x-trace-id` keeps its correlation.
 *
 * @param req - The incoming HTTP request.
 * @returns The normalized trace ID, or undefined if the request does not carry a usable one.
 */
export function getTraceId(req: Request): string | undefined {
  const traceparent = req.header('traceparent');
  const amznTraceId = req.header('x-amzn-trace-id');

  const candidates = [
    parseTraceparent(traceparent ?? '')?.traceId,
    req.header('x-trace-id'),
    amznTraceId ? extractAmazonTraceId(amznTraceId) : undefined,
  ];

  for (const candidate of candidates) {
    const normalized = candidate ? normalizeTraceId(candidate) : undefined;
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

/**
 * Extracts the trace ID from an AWS X-Ray trace header.
 * @param amznTraceId - The `x-amzn-trace-id` header value.
 * @returns The X-Ray trace ID, or undefined if the header does not contain one.
 * @see https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-request-tracing.html
 */
export function extractAmazonTraceId(amznTraceId: string): string | undefined {
  // Definition: Field=version-time-id
  // Example header: X-Amzn-Trace-Id: Root=1-67891233-abcdef012345678912345678
  // Example header: X-Amzn-Trace-Id: Self=1-67891233-12456789abcdef012345678;Root=1-67891233-abcdef012345678912345678
  const regex = /(?:Root|Self)=([^;]+)/;
  const match = regex.exec(amznTraceId);
  return match ? match[1] : undefined;
}
