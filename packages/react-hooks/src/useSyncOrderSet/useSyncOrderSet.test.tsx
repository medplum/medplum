// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcome } from '@medplum/fhirtypes';
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
    const post = jest.spyOn(medplum, 'post').mockResolvedValue({ resourceType: 'Parameters', parameter: [] });

    const { result } = renderHook(() => useSyncOrderSet(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await result.current('plan-def-123');
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = post.mock.calls[0];
    expect(calledUrl.toString()).toContain(OPERATION_URL);
    expect(body).toEqual({ planDefinitionId: 'plan-def-123' });
  });

  test('silently no-ops when operation is not deployed (not-found)', async () => {
    const medplum = new MockClient();
    const notFound: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Operation not found' }],
    };
    jest.spyOn(medplum, 'post').mockRejectedValue(notFound);

    const { result } = renderHook(() => useSyncOrderSet(), { wrapper: wrapper(medplum) });

    await act(async () => {
      // Should resolve without throwing
      await expect(result.current('plan-def-123')).resolves.toBeUndefined();
    });
  });

  test('re-throws non-not-found errors', async () => {
    const medplum = new MockClient();
    const serverError: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: 'Internal server error' }],
    };
    jest.spyOn(medplum, 'post').mockRejectedValue(serverError);

    const { result } = renderHook(() => useSyncOrderSet(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await expect(result.current('plan-def-123')).rejects.toMatchObject({ resourceType: 'OperationOutcome' });
    });
  });
});
