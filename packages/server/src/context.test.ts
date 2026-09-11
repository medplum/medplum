// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { loadTestConfig } from './config/loader';
import {
  RequestContext,
  buildTracingExtension,
  getAuthenticatedContext,
  getRequestContext,
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
    await withTestContext(() => expect(tryGetRequestContext()).toBeDefined());
  });

  test('getRequestContext', async () => {
    expect(() => getRequestContext()).toThrow('No request context available');
    await withTestContext(() => expect(getRequestContext()).toBeDefined());
  });

  test('getAuthenticatedContext', async () => {
    expect(() => getAuthenticatedContext()).toThrow('No request context available');

    requestContextStore.run(new RequestContext('request', 'trace'), () => {
      expect(() => getAuthenticatedContext()).toThrow('Request is not authenticated');
    });

    await withTestContext(() => {
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

  describe('buildTracingExtension', () => {
    test('outside of RequestContext', () => {
      expect(() => buildTracingExtension()).not.toThrow();
    });

    test('with both traceId and requestId', async () => {
      await withTestContext(
        () => {
          expect(buildTracingExtension()).toStrictEqual({
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
          });
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
          expect(buildTracingExtension()).toStrictEqual({
            extension: [
              {
                url: 'requestId',
                valueId: requestId,
              },
            ],
            url: 'https://medplum.com/fhir/StructureDefinition/tracing',
          });
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
          expect(buildTracingExtension()).toStrictEqual({
            extension: [
              {
                url: 'traceId',
                valueId: traceId,
              },
            ],
            url: 'https://medplum.com/fhir/StructureDefinition/tracing',
          });
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
