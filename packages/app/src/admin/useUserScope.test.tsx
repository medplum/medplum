// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { User } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';

import { useUserScope } from './useUserScope';

function makeWrapper(medplum: MockClient): (props: { children: ReactNode }) => JSX.Element {
  return ({ children }) => <MedplumProvider medplum={medplum}>{children}</MedplumProvider>;
}

describe('useUserScope', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('stays in loading when no userId', () => {
    const { result } = renderHook(() => useUserScope(undefined, 'project-1'), { wrapper: makeWrapper(medplum) });
    expect(result.current[0]).toBe('loading');
  });

  test('returns "project" when User.meta.project matches projectId', async () => {
    jest.spyOn(medplum, 'readResource').mockResolvedValueOnce({
      resourceType: 'User',
      id: 'user-1',
      meta: { project: 'project-1' },
    } as WithId<User>);

    const { result } = renderHook(() => useUserScope('user-1', 'project-1'), { wrapper: makeWrapper(medplum) });
    await waitFor(() => expect(result.current[0]).toBe('project'));
  });

  test('returns "global" when User has no meta.project', async () => {
    jest.spyOn(medplum, 'readResource').mockResolvedValueOnce({
      resourceType: 'User',
      id: 'user-1',
    } as WithId<User>);

    const { result } = renderHook(() => useUserScope('user-1', 'project-1'), { wrapper: makeWrapper(medplum) });
    await waitFor(() => expect(result.current[0]).toBe('global'));
  });

  test('returns "global" when User.meta.project differs from projectId', async () => {
    jest.spyOn(medplum, 'readResource').mockResolvedValueOnce({
      resourceType: 'User',
      id: 'user-1',
      meta: { project: 'other-project' },
    } as WithId<User>);

    const { result } = renderHook(() => useUserScope('user-1', 'project-1'), { wrapper: makeWrapper(medplum) });
    await waitFor(() => expect(result.current[0]).toBe('global'));
  });

  test('treats read failure as global scope', async () => {
    jest.spyOn(medplum, 'readResource').mockRejectedValueOnce(new Error('forbidden'));

    const { result } = renderHook(() => useUserScope('user-1', 'project-1'), { wrapper: makeWrapper(medplum) });
    await waitFor(() => expect(result.current[0]).toBe('global'));
  });

  test('refresh re-fetches the User and updates scope', async () => {
    const readSpy = jest
      .spyOn(medplum, 'readResource')
      .mockResolvedValueOnce({ resourceType: 'User', id: 'user-1', meta: { project: 'project-1' } } as WithId<User>)
      .mockResolvedValueOnce({ resourceType: 'User', id: 'user-1' } as WithId<User>);
    const invalidateSpy = jest.spyOn(medplum, 'invalidateSearches').mockImplementation(() => {});

    const { result } = renderHook(() => useUserScope('user-1', 'project-1'), { wrapper: makeWrapper(medplum) });
    await waitFor(() => expect(result.current[0]).toBe('project'));

    await act(async () => {
      result.current[1]();
    });

    await waitFor(() => expect(result.current[0]).toBe('global'));
    expect(invalidateSpy).toHaveBeenCalledWith('User');
    expect(readSpy).toHaveBeenCalledTimes(2);
  });
});
