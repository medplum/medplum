import { Request } from 'express';
import {
  RequestContext,
  getAuthenticatedContext,
  getRequestContext,
  getTraceId,
  requestContextStore,
  tryGetRequestContext,
  tryRunInRequestContext,
} from './context';
import { withTestContext } from './test.setup';

describe('RequestContext', () => {
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
});

function mockRequest(headers: Record<string, string>): Request {
  return {
    header(name: string): string | undefined {
      return headers[name];
    },
  } as unknown as Request;
}
