// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { useAppNavigate } from './useAppNavigate';

const routerNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => routerNavigate,
  };
});

describe('useAppNavigate', () => {
  test('Forwards navigations and reports rejected ones', async () => {
    const onError = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <MedplumProvider medplum={new MockClient()} onError={onError}>
        {children}
      </MedplumProvider>
    );
    const { result } = renderHook(() => useAppNavigate(), { wrapper });

    routerNavigate.mockResolvedValue(undefined);
    result.current('/Patient', { replace: true });
    result.current('/Practitioner');
    result.current(-1);
    expect(routerNavigate.mock.calls).toEqual([['/Patient', { replace: true }], ['/Practitioner'], [-1]]);

    const error = new Error('Navigation failed');
    routerNavigate.mockRejectedValue(error);
    result.current('/Observation');
    await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith(error, { source: 'useAppNavigate' }));
  });
});
