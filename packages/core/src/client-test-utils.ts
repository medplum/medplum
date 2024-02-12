import { OperationOutcome } from '@medplum/fhirtypes';
import { FetchLike } from './client';
import { ContentType } from './contenttype';
import { getStatus, isOperationOutcome } from './outcomes';

export function mockFetch(
  status: number,
  body: OperationOutcome | Record<string, unknown> | ((url: string, options?: any) => any),
  contentType = ContentType.FHIR_JSON
): FetchLike & jest.Mock {
  const bodyFn = typeof body === 'function' ? body : () => body;
  return jest.fn((url: string, options?: any) => {
    const response = bodyFn(url, options);
    const responseStatus = isOperationOutcome(response) ? getStatus(response) : status;
    return Promise.resolve(mockFetchResponse(responseStatus, response, { 'content-type': contentType }));
  });
}

export function mockFetchResponse(status: number, body: any, headers?: Record<string, string>): Response {
  const headersMap = new Map<string, string>();
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      headersMap.set(key, value);
    }
  }
  if (!headersMap.has('content-type')) {
    headersMap.set('content-type', ContentType.FHIR_JSON);
  }
  return {
    ok: status < 400,
    status,
    headers: headersMap,
    blob: () => Promise.resolve(body),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}
