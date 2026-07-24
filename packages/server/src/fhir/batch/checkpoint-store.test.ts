// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import type { BatchInitialState } from '@medplum/fhir-router';
import type { Bundle, BundleEntry } from '@medplum/fhirtypes';
import { loadTestConfig } from '../../config/loader';
import { globalLogger } from '../../logger';
import { initBinaryStorage } from '../../storage/loader';
import { BatchCheckpointStore } from './checkpoint-store';

describe('BatchCheckpointStore', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initBinaryStorage(config.binaryStorage);
  });

  const logger: ILogger = globalLogger;

  function makeInitialState(): BatchInitialState {
    return {
      bundle: { resourceType: 'Bundle', type: 'batch', entry: [{ request: { method: 'GET', url: 'Patient' } }] },
      bundleInfo: { ordering: [0], resourceTypes: new Set(['Patient']), requiresStrongTransaction: false, updates: 0 },
      preprocessResults: {},
    };
  }

  test('Input bundle round-trips', async () => {
    const store = new BatchCheckpointStore('input-test', logger);
    const bundle: Bundle = { resourceType: 'Bundle', type: 'batch', entry: [] };
    await store.saveInputBundle(bundle);
    expect(await store.loadInputBundle()).toStrictEqual(bundle);
    await store.cleanup(0);
  });

  test('Initial state round-trips', async () => {
    const store = new BatchCheckpointStore('state-test', logger);
    const state = makeInitialState();
    await store.saveInitialState(state);
    const loaded = await store.loadInitialState();
    expect(loaded.state).toStrictEqual(state);
    // New-format state.json carries no resolved identities (they live in the identity chunk stream).
    expect(loaded.legacyResolvedIdentities).toBeUndefined();
    await store.cleanup(0);
  });

  test('Legacy state.json surfaces resolvedIdentities for back-compat', async () => {
    const store = new BatchCheckpointStore('legacy-state-test', logger);
    // Jobs preprocessed before identities moved to their own stream persisted resolvedIdentities
    // inside state.json. saveInitialState spreads its argument, so an object carrying that extra
    // key reproduces the old on-disk format.
    const legacy = { ...makeInitialState(), resolvedIdentities: { 'urn:uuid:abc': 'Patient/123' } };
    await store.saveInitialState(legacy);

    const loaded = await store.loadInitialState();
    expect(loaded.legacyResolvedIdentities).toStrictEqual({ 'urn:uuid:abc': 'Patient/123' });
    // The immutable state itself does not expose the legacy identities.
    expect(loaded.state).not.toHaveProperty('resolvedIdentities');
    await store.cleanup(0);
  });

  test('Result chunks accumulate and merge by index', async () => {
    const store = new BatchCheckpointStore('chunks-test', logger);
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

  test('Identity chunks accumulate and merge by placeholder', async () => {
    const store = new BatchCheckpointStore('identity-chunks-test', logger);
    const chunk0: Record<string, string> = { 'urn:uuid:a': 'Patient/1', 'urn:uuid:b': 'Patient/2' };
    const chunk1: Record<string, string> = { 'urn:uuid:c': 'Observation/3' };
    await store.saveIdentityChunk(0, chunk0);
    await store.saveIdentityChunk(1, chunk1);

    const all = await store.loadAllIdentities(2);
    // loadAllIdentities merges into a null-prototype object; compare structurally.
    expect(all).toEqual({ ...chunk0, ...chunk1 });
    await store.cleanup(0, 2);
  });

  test('loadAllIdentities returns empty when no identity chunks were written', async () => {
    const store = new BatchCheckpointStore('identity-empty-test', logger);
    // A job that never diverged (or predates identity chunks) has identitySeq 0.
    expect(await store.loadAllIdentities(0)).toEqual({});
  });

  test('cleanup removes all objects and is safe to call again', async () => {
    const store = new BatchCheckpointStore('cleanup-test', logger);
    await store.saveInputBundle({ resourceType: 'Bundle', type: 'batch' });
    await store.saveInitialState(makeInitialState());
    await store.saveResultChunk(0, { 0: { response: { status: '201' } } });
    await store.saveIdentityChunk(0, { 'urn:uuid:a': 'Patient/1' });

    await store.cleanup(1, 1);

    // Objects are gone after cleanup.
    await expect(store.loadInitialState()).rejects.toThrow();
    await expect(store.loadAllIdentities(1)).rejects.toThrow();
    // Cleanup is idempotent, including the default identity-chunk count for legacy callers.
    await expect(store.cleanup(1)).resolves.toBeUndefined();
  });
});
