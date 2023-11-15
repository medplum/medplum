import { ClientStorage, IClientStorage } from '@medplum/core';

export class MockAsyncClientStorage extends ClientStorage implements IClientStorage {
  #initialized: boolean;
  #initPromise: Promise<void>;
  #initResolve: (value: void | PromiseLike<void>) => void;
  constructor() {
    super();
    this.#initialized = false;
    this.#initResolve = () => undefined;
    this.#initPromise = new Promise<void>((resolve) => {
      this.#initResolve = resolve;
    }).catch(console.error);
  }
  get isInitialized(): boolean {
    return this.#initialized;
  }
  getInitPromise(): Promise<void> {
    return this.#initPromise;
  }
  setInitialized(): void {
    if (!this.#initialized) {
      this.#initResolve();
      this.#initialized = true;
    }
  }
}
