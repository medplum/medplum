// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BatchInitialState } from '@medplum/fhir-router';
import type { Bundle, BundleEntry } from '@medplum/fhirtypes';
import { loadTestConfig } from '../../config/loader';
import { initBinaryStorage } from '../../storage/loader';
import { BatchCheckpointStore } from './checkpoint-store';

describe('BatchCheckpointStore', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initBinaryStorage(config.binaryStorage);
  });

  function makeInitialState(): BatchInitialState {
    return {
      bundle: { resourceType: 'Bundle', type: 'batch', entry: [{ request: { method: 'GET', url: 'Patient' } }] },
      bundleInfo: { ordering: [0], requiresStrongTransaction: false, updates: 0, resourceTypes: ['Patient'] },
      resolvedIdentities: { 'urn:uuid:abc': 'Patient/123' },
      preprocessResults: {},
    };
  }

  test('Input bundle round-trips', async () => {
    const store = new BatchCheckpointStore('input-test');
    const bundle: Bundle = { resourceType: 'Bundle', type: 'batch', entry: [] };
    await store.saveInputBundle(bundle);
    expect(await store.loadInputBundle()).toStrictEqual(bundle);
    await store.cleanup(0);
  });

  test('Initial state round-trips', async () => {
    const store = new BatchCheckpointStore('state-test');
    const state = makeInitialState();
    await store.saveInitialState(state);
    expect(await store.loadInitialState()).toStrictEqual(state);
    await store.cleanup(0);
  });

  test('Result chunks accumulate and merge by index', async () => {
    const store = new BatchCheckpointStore('chunks-test');
    const chunk0: Record<number, BundleEntry> = {
      0: { response: { status: '201' } },
      2: { response: { status: '200' } },
    };
    const chunk1: Record<number, BundleEntry> = { 1: { response: { status: '404' } } };
    await store.saveResultChunk(0, chunk0);
    await store.saveResultChunk(1, chunk1);

    const all = await store.loadAllResults(2);
    // loadAllResults merges into a null-prototype object; compare structurally.
    expect(all).toEqual({ ...chunk0, ...chunk1 });
    await store.cleanup(2);
  });

  test('cleanup removes all objects and is safe to call again', async () => {
    const store = new BatchCheckpointStore('cleanup-test');
    await store.saveInputBundle({ resourceType: 'Bundle', type: 'batch' });
    await store.saveInitialState(makeInitialState());
    await store.saveResultChunk(0, { 0: { response: { status: '201' } } });

    await store.cleanup(1);

    // Objects are gone after cleanup.
    await expect(store.loadInitialState()).rejects.toThrow();
    // Cleanup is idempotent.
    await expect(store.cleanup(1)).resolves.toBeUndefined();
  });
});
