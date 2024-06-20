import { OperationOutcome, Practitioner, Resource } from '@medplum/fhirtypes';
import { FetchLike, MedplumClient } from './client';
import { ContentType } from './contenttype';
import { generateId } from './crypto';
import { OperationOutcomeError, badRequest, getStatus, isOperationOutcome } from './outcomes';
import { ReadablePromise } from './readablepromise';
import { ProfileResource, ensureNoLeadingSlash } from './utils';

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

export function mockFetchWithStatus(
  onFetch: (url: string, options?: any) => [number, any],
  contentType = ContentType.FHIR_JSON
): FetchLike & jest.Mock {
  return jest.fn((url: string, options?: any) => {
    const [status, response] = onFetch(url, options);
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
  let streamRead = false;
  const streamReader = async (): Promise<any> => {
    if (streamRead) {
      throw new Error('Stream already read');
    }
    streamRead = true;
    return body;
  };
  return {
    ok: status < 400,
    status,
    headers: headersMap,
    blob: streamReader,
    json: streamReader,
    text: streamReader,
  } as unknown as Response;
}

export class MockFhirRouter {
  routes: Map<string, () => Record<string, any>>;
  constructor() {
    this.routes = new Map();
  }

  makeKey(method: 'GET' | 'POST', path: string): string {
    return `${method} ${ensureNoLeadingSlash(path)}`;
  }

  addRoute(method: 'GET' | 'POST', path: string, callback: () => Record<string, any>): void {
    this.routes.set(this.makeKey(method, path), callback);
  }

  fetchRoute<T = Record<string, any>>(method: 'GET' | 'POST', path: string): T {
    const key = this.makeKey(method, path);
    if (!this.routes.has(key)) {
      throw new OperationOutcomeError(badRequest('Invalid route'));
    }
    return (this.routes.get(key) as () => T)();
  }
}

export interface MockClientOptions {
  fetch?: FetchLike;
}

export class MockMedplumClient extends MedplumClient {
  router: MockFhirRouter;
  profile: Practitioner;
  nextResourceId: string;

  constructor(options?: MockClientOptions) {
    // @ts-expect-error need to pass something for fetch otherwise MedplumClient ctor will complain
    super({ fetch: options?.fetch ?? (() => undefined) });
    this.router = new MockFhirRouter();
    this.profile = { resourceType: 'Practitioner', id: generateId() } as Practitioner;
    this.nextResourceId = 'DEFAULT_MOCK_ID';
  }

  get<T = any>(url: string | URL, _options?: RequestInit): ReadablePromise<T> {
    return new ReadablePromise<T>(Promise.resolve<T>(this.router.fetchRoute<T>('GET', url.toString())));
  }

  addNextResourceId(id: string): void {
    this.nextResourceId = id;
  }

  createResource<T extends Resource = Resource>(resource: T, _options?: RequestInit | undefined): Promise<T> {
    return Promise.resolve<T>({ ...resource, id: this.nextResourceId });
  }

  getProfile(): ProfileResource | undefined {
    return this.profile;
  }
}

export function createFakeJwt(claims: Record<string, string | number>): string {
  return 'header.' + window.btoa(JSON.stringify(claims)) + '.signature';
}
