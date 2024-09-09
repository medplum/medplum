import { MedplumClient } from './client';
import { ContentType } from './contenttype';

export class MedplumKeyValueClient {
  constructor(readonly medplum: MedplumClient) {}

  /**
   * Gets the value for the given key from the keyvalue store.
   * @param key - The key to get the value for.
   * @returns The value for the given key.
   */
  async get(key: string): Promise<string | undefined> {
    return this.medplum.get(`keyvalue/v1/${key}`);
  }

  /**
   * Sets the value for the given key in the keyvalue store.
   * @param key - The key to set the value for.
   * @param value - The value to set.
   */
  async set(key: string, value: string): Promise<void> {
    await this.medplum.put(`keyvalue/v1/${key}`, value, ContentType.TEXT);
  }

  /**
   * Deletes the value for the given key from the keyvalue store.
   * @param key - The key to delete the value for.
   */
  async delete(key: string): Promise<void> {
    await this.medplum.delete(`keyvalue/v1/${key}`);
  }
}
