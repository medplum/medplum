import { Request } from 'express';
import { loadTestConfig } from './config';
import {
  RequestContext,
  buildTracingExtension,
  getAuthenticatedContext,
  getRequestContext,
  getTraceId,
  requestContextStore,
  tryGetRequestContext,
  tryRunInRequestContext,
} from './context';
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
    expect(getTraceId(mockRequest({ 'x-trace-id': uuid }))).toEqual(uuid);

    const tpid = '00-12345678901234567890123456789012-3456789012345678-01';
    expect(getTraceId(mockRequest({ traceparent: tpid }))).toEqual(tpid);
  });

  describe('buildTracingExtension', () => {
    test('outside of RequestContext', () => {
      expect(() => buildTracingExtension()).not.toThrow();
    });

    test('with both traceId and requestId', async () => {
      await withTestContext(
        () => {
          expect(buildTracingExtension()).toEqual([
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
          expect(buildTracingExtension()).toEqual([
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
          expect(buildTracingExtension()).toEqual([
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
});

function mockRequest(headers: Record<string, string>): Request {
  return {
    header(name: string): string | undefined {
      return headers[name];
    },
  } as unknown as Request;
}
