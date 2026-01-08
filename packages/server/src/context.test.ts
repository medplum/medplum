// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Request } from 'express';
import { loadTestConfig } from './config/loader';
import {
  RequestContext,
  buildTracingExtension,
  extractAmazonTraceId,
  getAuthenticatedContext,
  getRequestContext,
  getTraceId,
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

    withTestContext(() => {
      expect(() => getAuthenticatedContext()).toThrow('Request is not authenticated');
    });
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
