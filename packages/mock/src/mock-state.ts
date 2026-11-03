// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { deepClone, getReferenceString } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { MockClient } from './client';

/**
 * Resources for a screen preview, demo or story. References and screen-specific values are
 * supplied by the author. This format does not imply FHIR profile conformance.
 */
export interface MockStateJson {
  readonly resources: WithId<Resource>[];
  /** Named entry points, by reference string (`Patient/patient-1`). */
  readonly handles: Record<string, string>;
}

/**
 * Packages typed resources for reuse in any mock screen; never creates or links resources.
 * @param resources - Explicit resources with stable IDs.
 * @param handles - Named entry points included in the resource list.
 * @returns A copy of the resources and reference strings for the handles.
 */
export function createMockState<H extends Record<string, WithId<Resource>>>(
  resources: readonly WithId<Resource>[],
  handles: H
): Omit<MockStateJson, 'handles'> & { handles: { [K in keyof H]: string } } {
  const refs = new Set<string>();
  for (const resource of resources) {
    if (!resource.id) {
      throw new Error(`Missing ID for ${resource.resourceType}`);
    }
    const ref = getReferenceString(resource);
    if (refs.has(ref)) {
      throw new Error(`Duplicate mock resource: ${ref}`);
    }
    refs.add(ref);
  }
  const entries = Object.entries(handles).map(([name, resource]) => {
    const ref = getReferenceString(resource);
    if (!refs.has(ref)) {
      throw new Error(`Mock handle ${name} points to an undeclared resource: ${ref}`);
    }
    return [name, ref];
  });
  return {
    resources: deepClone([...resources]),
    handles: Object.fromEntries(entries) as { [K in keyof H]: string },
  };
}

/**
 * Creates an isolated client for an app preview, demo, test or Storybook story.
 * @param state - Resources and named entry points to load.
 * @returns A ready-to-use client with the supplied resources and no default mock patients.
 */
export async function createMockClient(state: MockStateJson): Promise<MockClient> {
  // Constructing a client must not silently replace duplicate records.
  const { resources } = createMockState(state.resources, {});
  const refs = new Set(resources.map(getReferenceString));
  for (const [name, ref] of Object.entries(state.handles)) {
    if (!refs.has(ref)) {
      throw new Error(`Mock handle ${name} points to an undeclared resource: ${ref}`);
    }
  }
  const client = new MockClient({ seedDefaultData: false });
  await client.mock.withSeeding(async () => {
    for (const resource of resources) {
      await client.createResource(resource);
    }
  });
  return client;
}
