import { randomUUID } from 'crypto';
import { Request } from 'express';
import { loadTestConfig } from './config/loader';
import {
  RequestContext,
  buildTracingExtension,
  extractAmazonTraceId,
  getAuthenticatedContext,
  getRequestContext,
  getTraceId,
  isValidTraceId,
  tryGetRequestContext,
  tryRunInRequestContext,
} from './context';
import { requestContextStore } from './request-context-store';
import { withTestContext } from './test.setup';

describe('RequestContext', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  test('tryGetRequestContext', async () => {
    expect(tryGetRequestContext()).toBeUndefined();
    withTestContext(() => expect(tryGetRequestContext()).toBeDefined());
  });

  test('getRequestContext', () => {
    expect(() => getRequestContext()).toThrow('No request context available');
    withTestContext(() => expect(getRequestContext()).toBeDefined());
  });

  test('getAuthenticatedContext', () => {
    expect(() => getAuthenticatedContext()).toThrow('No request context available');
    requestContextStore.run(new RequestContext('request', 'trace'), () => {
      expect(() => getAuthenticatedContext()).toThrow('Request is not authenticated');
    });
    withTestContext(() => expect(getAuthenticatedContext()).toBeDefined());
  });

  test('tryRunInRequestContext', () => {
    tryRunInRequestContext(undefined, undefined, () => {
      expect(tryGetRequestContext()).toBeUndefined();
    });
    tryRunInRequestContext('request', 'trace', () => {
      expect(tryGetRequestContext()).toBeDefined();
    });
  });

  test('getTraceId', () => {
    expect(getTraceId(mockRequest({}))).toBeUndefined();
    expect(getTraceId(mockRequest({ 'x-trace-id': 'foo' }))).toBeUndefined();
    expect(getTraceId(mockRequest({ traceparent: 'foo' }))).toBeUndefined();

    const uuid = '00000000-0000-0000-0000-000000000000';
    expect(getTraceId(mockRequest({ 'x-trace-id': uuid }))).toStrictEqual(uuid);

    const tpid = '00-12345678901234567890123456789012-3456789012345678-01';
    expect(getTraceId(mockRequest({ traceparent: tpid }))).toStrictEqual(tpid);
  });

  test('isValidTraceId', () => {
    // Invalid cases
    expect(isValidTraceId(undefined as unknown as string)).toBe(false);
    expect(isValidTraceId(null as unknown as string)).toBe(false);
    expect(isValidTraceId('')).toBe(false);
    expect(isValidTraceId('foo')).toBe(false); // Too short
    expect(isValidTraceId('1234567')).toBe(false); // Too short (7 chars)
    expect(isValidTraceId('0000000000')).toBe(false); // All zeros
    expect(isValidTraceId('0-0-0-0-0-0')).toBe(false); // All zeros with separators
    expect(isValidTraceId('0_0_0_0_0_0_0')).toBe(false); // All zeros with underscores
    expect(isValidTraceId('00-00_00-00')).toBe(false); // All zeros mixed separators
    expect(isValidTraceId('*invalid$chars#')).toBe(false); // Invalid characters
    expect(isValidTraceId('spaces not allowed')).toBe(false); // Has spaces
    expect(isValidTraceId('a'.repeat(65))).toBe(false); // Too long (65 chars)

    // Valid cases
    expect(isValidTraceId(randomUUID())).toBe(true); // Standard UUID
    expect(isValidTraceId('12345678')).toBe(true); // Minimum length (8 chars)
    expect(isValidTraceId('a'.repeat(64))).toBe(true); // Maximum length (64 chars)
    expect(isValidTraceId('abcdef123456')).toBe(true); // Alphanumeric
    expect(isValidTraceId('123-456-789')).toBe(true); // With dashes
    expect(isValidTraceId('abc_def_123')).toBe(true); // With underscores
    expect(isValidTraceId('00000000a')).toBe(true); // Mostly zeros but not all
    expect(isValidTraceId('trace-id_123456789')).toBe(true); // Mixed chars
    expect(isValidTraceId('4bf92f3577b34da6a3ce929d0e0e4736')).toBe(true); // W3C format
    expect(isValidTraceId('67bde5d7dcd81f84')).toBe(true); // B3 SpanId format
    expect(isValidTraceId('0c2cc9583f004a41-67bde5d7dcd81f84')).toBe(true); // Combined format
    expect(isValidTraceId('1-67891233-abcdef012345678912345678')).toBe(true); // AWS format
  });

  describe('buildTracingExtension', () => {
    test('outside of RequestContext', () => {
      expect(() => buildTracingExtension()).not.toThrow();
    });

    test('with both traceId and requestId', async () => {
      await withTestContext(
        () => {
          expect(buildTracingExtension()).toStrictEqual([
            {
              extension: [
                {
                  url: 'requestId',
                  valueId: 'a-request-id',
                },
                {
                  url: 'traceId',
                  valueId: 'a-trace-id',
                },
              ],
              url: 'https://medplum.com/fhir/StructureDefinition/tracing',
            },
          ]);
        },
        { requestId: 'a-request-id', traceId: 'a-trace-id' }
      );
    });

    test.each([
      ['a-request-id', ''],
      ['a-request-id', undefined],
    ])('with missing traceId', async (requestId: string | undefined, traceId: string | undefined) => {
      await withTestContext(
        () => {
          expect(buildTracingExtension()).toStrictEqual([
            {
              extension: [
                {
                  url: 'requestId',
                  valueId: requestId,
                },
              ],
              url: 'https://medplum.com/fhir/StructureDefinition/tracing',
            },
          ]);
        },
        { requestId, traceId }
      );
    });
    test.each([
      ['', 'a-trace-id'],
      [undefined, 'a-trace-id'],
    ])('with missing requestId', async (requestId: string | undefined, traceId: string | undefined) => {
      await withTestContext(
        () => {
          expect(buildTracingExtension()).toStrictEqual([
            {
              extension: [
                {
                  url: 'traceId',
                  valueId: traceId,
                },
              ],
              url: 'https://medplum.com/fhir/StructureDefinition/tracing',
            },
          ]);
        },
        { requestId, traceId }
      );
    });
    test.each([
      ['', ''],
      [undefined, undefined],
    ])(
      'with both traceId and requestId missing',
      async (requestId: string | undefined, traceId: string | undefined) => {
        await withTestContext(
          () => {
            expect(buildTracingExtension()).toBeUndefined();
          },
          { requestId, traceId }
        );
      }
    );
  });

  test('x-amzn-trace-id', () => {
    const amzn = '1-67891233-abcdef012345678912345678';
    expect(getTraceId(mockRequest({ 'x-amzn-trace-id': `Root=${amzn}` }))).toStrictEqual(amzn);

    // x-trace-id should take precedence
    const uuid = '00000000-0000-0000-0000-000000000000';
    expect(getTraceId(mockRequest({ 'x-amzn-trace-id': amzn, 'x-trace-id': uuid }))).toStrictEqual(uuid);
  });

  test('extractAmazonTraceId', () => {
    expect(extractAmazonTraceId('')).toBeUndefined();
    expect(extractAmazonTraceId('Root=foo')).toBe('foo');
    expect(extractAmazonTraceId('Self=foo')).toBe('foo');
    expect(extractAmazonTraceId('Root=foo;Self=bar')).toBe('foo');
    expect(extractAmazonTraceId('Custom=x;Root=foo;Self=bar')).toBe('foo');
  });
});

function mockRequest(headers: Record<string, string>): Request {
  return {
    header(name: string): string | undefined {
      return headers[name];
    },
  } as unknown as Request;
}
