import { ClientStorage, IClientStorage } from '@medplum/core';

export class MockAsyncClientStorage extends ClientStorage implements IClientStorage {
  #isInitialized: boolean;
  #initPromise: Promise<void>;
  #initResolve: (value: void | PromiseLike<void>) => void;
  constructor() {
    super();
    this.#isInitialized = false;
    this.#initResolve = () => undefined;
    this.#initPromise = new Promise<void>((resolve) => {
      this.#initResolve = resolve;
    }).catch(console.error);
  }
  get isInitialized(): boolean {
    return this.#isInitialized;
  }
  getInitPromise(): Promise<void> {
    return this.#initPromise;
  }
  setInitialized(): void {
    if (!this.#isInitialized) {
      this.#initResolve();
      this.#isInitialized = true;
    }
  }
}
