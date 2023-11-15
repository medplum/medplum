import { OperationOutcome } from '@medplum/fhirtypes';
import { FetchLike } from './client';
import { ContentType } from './contenttype';
import { getStatus, isOperationOutcome } from './outcomes';
import { ClientStorage } from './storage';

export function mockFetch(
  status: number,
  body: OperationOutcome | Record<string, unknown> | ((url: string, options?: any) => any),
  contentType = ContentType.FHIR_JSON
): FetchLike & jest.Mock {
  const bodyFn = typeof body === 'function' ? body : () => body;
  return jest.fn((url: string, options?: any) => {
    const response = bodyFn(url, options);
    const responseStatus = isOperationOutcome(response) ? getStatus(response) : status;
    return Promise.resolve({
      ok: responseStatus < 400,
      status: responseStatus,
      headers: { get: () => contentType },
      blob: () => Promise.resolve(response),
      json: () => Promise.resolve(response),
    });
  });
}

export class MockAsyncClientStorage extends ClientStorage {
  #initialized: boolean;
  #initPromise: Promise<void>;
  #initResolve: () => void = () => undefined;

  constructor() {
    super();
    this.#initialized = false;
    this.#initPromise = new Promise((resolve) => {
      this.#initResolve = resolve;
    });
  }

  setInitialized(): void {
    this.#initialized = true;
    this.#initResolve();
  }

  getInitPromise(): Promise<void> {
    return this.#initPromise;
  }

  get isInitialized(): boolean {
    return this.#initialized;
  }
}
