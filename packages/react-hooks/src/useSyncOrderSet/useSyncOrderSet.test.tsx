// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useSyncOrderSet } from './useSyncOrderSet';

const OPERATION_URL = 'fhir/R4/PlanDefinition/$sync-orderset';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useSyncOrderSet', () => {
  test('POSTs planDefinitionId to $sync-orderset', async () => {
    const medplum = new MockClient();
    const post = vi.spyOn(medplum, 'post').mockResolvedValue({ resourceType: 'Parameters', parameter: [] });

    const { result } = renderHook(() => useSyncOrderSet(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await result.current('plan-def-123');
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = post.mock.calls[0];
    expect(calledUrl.toString()).toContain(OPERATION_URL);
    expect(body).toEqual({ planDefinitionId: 'plan-def-123' });
  });

  test('decodes per-action results and counts so partial failures surface', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Parameters',
      parameter: [
        { name: 'mode', valueCode: 'created' },
        { name: 'scriptSureOrdersetId', valueInteger: 379 },
        { name: 'syncedCount', valueInteger: 1 },
        { name: 'failedCount', valueInteger: 1 },
        {
          name: 'results',
          part: [
            { name: 'actionTitle', valueString: 'Jardiance' },
            { name: 'status', valueCode: 'synced' },
            { name: 'scriptSureSequenceId', valueInteger: 1011 },
          ],
        },
        {
          name: 'results',
          part: [
            { name: 'actionTitle', valueString: 'Ozempic' },
            { name: 'status', valueCode: 'failed' },
            { name: 'error', valueString: 'drug not in FDB' },
          ],
        },
      ],
    });

    const { result } = renderHook(() => useSyncOrderSet(), { wrapper: wrapper(medplum) });

    let response: Awaited<ReturnType<ReturnType<typeof useSyncOrderSet>>>;
    await act(async () => {
      response = await result.current('plan-def-123');
    });

    expect(response?.mode).toBe('created');
    expect(response?.scriptSureOrdersetId).toBe(379);
    expect(response?.syncedCount).toBe(1);
    expect(response?.failedCount).toBe(1);
    expect(response?.results).toHaveLength(2);
    expect(response?.results[0]).toMatchObject({ actionTitle: 'Jardiance', status: 'synced' });
    expect(response?.results[1]).toMatchObject({ actionTitle: 'Ozempic', status: 'failed', error: 'drug not in FDB' });
  });

  test('silently no-ops when operation is not deployed (not-found)', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockRejectedValue(
      new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Operation not found' }],
      })
    );

    const { result } = renderHook(() => useSyncOrderSet(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await expect(result.current('plan-def-123')).resolves.toBeUndefined();
    });
  });

  test('re-throws non-not-found errors', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockRejectedValue(
      new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: 'Internal server error' }],
      })
    );

    const { result } = renderHook(() => useSyncOrderSet(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await expect(result.current('plan-def-123')).rejects.toBeInstanceOf(OperationOutcomeError);
    });
  });
});
