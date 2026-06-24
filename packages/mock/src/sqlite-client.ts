import { FhirRouter } from '@medplum/fhir-router';
import { SqliteRepository } from '@medplum/fhir-router/sqlite';
import type { MockClientOptions } from './client';
import { MockClient, MockFetchClient } from './client';

export type CreateSqliteMockClientOptions = Omit<MockClientOptions, 'mockFetchOverride'>;

/**
 * Creates a MockClient backed by SqliteRepository for Node.js tests.
 * Not exported from the main package entry to keep browser/jsdom bundles free of node:sqlite.
 * @param clientOptions - Optional mock client configuration.
 * @returns A MockClient instance backed by SQLite storage.
 */
export function createSqliteMockClient(clientOptions?: CreateSqliteMockClientOptions): MockClient {
  const baseUrl = clientOptions?.baseUrl ?? 'https://example.com/';
  const router = new FhirRouter();
  const repo = new SqliteRepository();
  const client = new MockFetchClient(router, repo, baseUrl, clientOptions?.debug);
  return new MockClient({
    ...clientOptions,
    mockFetchOverride: { router, repo, client },
  });
}
