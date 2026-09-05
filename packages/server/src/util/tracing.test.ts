// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Request } from 'express';
import type { Traceparent } from './tracing';
import {
  buildTraceparent,
  extractAmazonTraceId,
  generateTraceId,
  getTraceId,
  normalizeTraceId,
  parseTraceparent,
} from './tracing';

describe('parseTraceparent', () => {
  const tp: Traceparent = {
    version: '00',
    traceId: '12345678901234567890123456789012',
    parentId: '3456789012345678',
    flags: '01',
  };

  it('parses traceparent spec', () => {
    expect(parseTraceparent(`${tp.version}-${tp.traceId}-${tp.parentId}-${tp.flags}`)).toStrictEqual(tp);
  });

  it('allows missing version', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-${tp.flags}`)).toStrictEqual({ ...tp, version: undefined });
  });

  it('allows missing flags', () => {
    expect(parseTraceparent(`${tp.version}-${tp.traceId}-${tp.parentId}`)).toStrictEqual({ ...tp, flags: undefined });
  });

  it('allows missing version and flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}`)).toStrictEqual({
      ...tp,
      version: undefined,
      flags: undefined,
    });
  });

  it('allows 1 character for flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-1`)).toStrictEqual({ ...tp, version: undefined, flags: '1' });
  });

  it('returns null for more than 2 characters for flags', () => {
    expect(parseTraceparent(`${tp.traceId}-${tp.parentId}-001`)).toStrictEqual(null);
  });

  it('reports invalid', () => {
    expect(parseTraceparent(`invalid-traceparent`)).toStrictEqual(null);
  });
});

const HEX_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const ZERO_TRACE_ID = '0'.repeat(32);

describe('normalizeTraceId', () => {
  test('passes through canonical hex', () => {
    expect(normalizeTraceId(HEX_TRACE_ID)).toBe(HEX_TRACE_ID);
  });

  test('lowercases hex', () => {
    expect(normalizeTraceId(HEX_TRACE_ID.toUpperCase())).toBe(HEX_TRACE_ID);
  });

  test('converts a UUID to hex', () => {
    expect(normalizeTraceId('4bf92f35-77b3-4da6-a3ce-929d0e0e4736')).toBe(HEX_TRACE_ID);
    expect(normalizeTraceId('4BF92F35-77B3-4DA6-A3CE-929D0E0E4736')).toBe(HEX_TRACE_ID);
  });

  test('converts an X-Ray trace ID to hex', () => {
    expect(normalizeTraceId('1-67891233-abcdef012345678912345678')).toBe('67891233abcdef012345678912345678');
  });

  test('normalizes every representation of the same trace to one value', () => {
    const uuid = '4bf92f35-77b3-4da6-a3ce-929d0e0e4736';
    expect(normalizeTraceId(uuid)).toBe(normalizeTraceId(HEX_TRACE_ID));
  });

  test('rejects the all-zero trace ID', () => {
    expect(normalizeTraceId(ZERO_TRACE_ID)).toBeUndefined();
    expect(normalizeTraceId('00000000-0000-0000-0000-000000000000')).toBeUndefined();
  });

  test('preserves other safe values that cannot be converted', () => {
    expect(normalizeTraceId('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(normalizeTraceId('13088165645273703951')).toBe('13088165645273703951');
  });

  test.each([
    ['empty', ''],
    ['too long', 'a'.repeat(65)],
    ['underscore, invalid in a FHIR id', 'TID_e0fbe3c75b3c5a45ab84fb156906649b'],
    ['whitespace', 'abc def'],
    ['newline, which could forge a log line', 'abc\ndef'],
    ['quote, which could break a JSON log field', 'abc"def'],
    ['slash', 'abc/def'],
  ])('rejects %s', (_name, value) => {
    expect(normalizeTraceId(value)).toBeUndefined();
  });

  test.each(['a'.repeat(64), '01ARZ3NDEKTSV4RRFFQ69G5FAV', '13088165645273703951'])('accepts %s', (value) => {
    expect(normalizeTraceId(value)).toBe(value);
  });
});

describe('generateTraceId', () => {
  test('generates a valid W3C trace ID', () => {
    const traceId = generateTraceId();
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(normalizeTraceId(traceId)).toBe(traceId);
  });

  test('generates a distinct value each time', () => {
    expect(generateTraceId()).not.toBe(generateTraceId());
  });
});

describe('buildTraceparent', () => {
  test('builds a parseable traceparent', () => {
    const traceparent = buildTraceparent(HEX_TRACE_ID) as string;
    expect(traceparent).toBeDefined();

    const parsed = parseTraceparent(traceparent);
    expect(parsed).toStrictEqual({
      version: '00',
      traceId: HEX_TRACE_ID,
      parentId: expect.stringMatching(/^[0-9a-f]{16}$/),
      flags: '01',
    });
  });

  test('generates a new span ID per call', () => {
    expect(buildTraceparent(HEX_TRACE_ID)).not.toBe(buildTraceparent(HEX_TRACE_ID));
  });

  test('returns undefined rather than a malformed traceparent', () => {
    expect(buildTraceparent(undefined)).toBeUndefined();
    expect(buildTraceparent('')).toBeUndefined();
    expect(buildTraceparent(ZERO_TRACE_ID)).toBeUndefined();
    // A UUID is 128 bits, but it is not the canonical form. Callers normalize first.
    expect(buildTraceparent('4bf92f35-77b3-4da6-a3ce-929d0e0e4736')).toBeUndefined();
    expect(buildTraceparent('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBeUndefined();
  });

  test('round-trips through getTraceId', () => {
    const traceparent = buildTraceparent(HEX_TRACE_ID) as string;
    expect(getTraceId(mockRequest({ traceparent }))).toBe(HEX_TRACE_ID);
  });
});

describe('getTraceId', () => {
  test('returns undefined when no header is present', () => {
    expect(getTraceId(mockRequest({}))).toBeUndefined();
  });

  test('extracts the trace ID field from traceparent, not the whole header', () => {
    const traceparent = `00-${HEX_TRACE_ID}-3456789012345678-01`;
    expect(getTraceId(mockRequest({ traceparent }))).toBe(HEX_TRACE_ID);
  });

  test('accepts a bare hex x-trace-id, as OpenTelemetry emits', () => {
    expect(getTraceId(mockRequest({ 'x-trace-id': HEX_TRACE_ID }))).toBe(HEX_TRACE_ID);
  });

  test('accepts a UUID x-trace-id and normalizes it', () => {
    expect(getTraceId(mockRequest({ 'x-trace-id': '4bf92f35-77b3-4da6-a3ce-929d0e0e4736' }))).toBe(HEX_TRACE_ID);
  });

  test('accepts and normalizes x-amzn-trace-id', () => {
    expect(getTraceId(mockRequest({ 'x-amzn-trace-id': 'Root=1-67891233-abcdef012345678912345678' }))).toBe(
      '67891233abcdef012345678912345678'
    );
  });

  test('prefers traceparent over x-trace-id', () => {
    const traceparent = `00-${HEX_TRACE_ID}-3456789012345678-01`;
    const other = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(getTraceId(mockRequest({ traceparent, 'x-trace-id': other }))).toBe(HEX_TRACE_ID);
  });

  test('prefers x-trace-id over x-amzn-trace-id', () => {
    expect(
      getTraceId(
        mockRequest({ 'x-trace-id': HEX_TRACE_ID, 'x-amzn-trace-id': 'Root=1-67891233-abcdef012345678912345678' })
      )
    ).toBe(HEX_TRACE_ID);
  });

  test('falls through a malformed header to the next source', () => {
    expect(getTraceId(mockRequest({ traceparent: 'foo', 'x-trace-id': HEX_TRACE_ID }))).toBe(HEX_TRACE_ID);
    expect(
      getTraceId(
        mockRequest({ 'x-trace-id': 'not a trace id', 'x-amzn-trace-id': 'Root=1-67891233-abcdef012345678912345678' })
      )
    ).toBe('67891233abcdef012345678912345678');
  });

  test('rejects unsafe values', () => {
    expect(getTraceId(mockRequest({ 'x-trace-id': 'abc\ndef' }))).toBeUndefined();
    expect(getTraceId(mockRequest({ 'x-trace-id': 'a'.repeat(65) }))).toBeUndefined();
    expect(getTraceId(mockRequest({ traceparent: 'foo' }))).toBeUndefined();
  });
});

describe('extractAmazonTraceId', () => {
  test.each([
    ['', undefined],
    ['Root=foo', 'foo'],
    ['Self=foo', 'foo'],
    ['Root=foo;Self=bar', 'foo'],
    ['Custom=x;Root=foo;Self=bar', 'foo'],
  ])('%s', (header, expected) => {
    expect(extractAmazonTraceId(header)).toBe(expected);
  });
});

function mockRequest(headers: Record<string, string>): Request {
  return {
    header(name: string): string | undefined {
      return headers[name];
    },
  } as unknown as Request;
}
