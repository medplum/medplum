import { OperationOutcome } from '@medplum/fhirtypes';
import { FetchLike } from './client';
import { ContentType } from './contenttype';
import { getStatus, isOperationOutcome } from './outcomes';
import { AsyncBackedClientStorage, ClientStorage } from './storage';
import { sleep } from './utils';

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

export class MockAsyncClientStorage extends ClientStorage implements AsyncBackedClientStorage {
  #isInitialized: boolean;
  constructor() {
    super();
    this.#isInitialized = false;
  }
  get isInitialized(): boolean {
    return this.#isInitialized;
  }
  get initialized(): Promise<void> {
    return new Promise((resolve) => {
      sleep(0)
        .then(() => {
          this.#isInitialized = true;
          resolve();
        })
        .catch(console.error);
    });
  }
}
