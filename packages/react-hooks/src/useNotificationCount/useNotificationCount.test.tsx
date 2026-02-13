// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook } from '@testing-library/react';
import 'jest-websocket-mock';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { useNotificationCount } from './useNotificationCount';

describe('useNotificationCount', () => {
  let medplum: MockClient;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Returns initial count of 0', () => {
    const { result } = renderHook(
      () =>
        useNotificationCount({
          resourceType: 'Communication',
          countCriteria: 'recipient=Practitioner/456&_summary=count',
          subscriptionCriteria: 'Communication?recipient=Practitioner/456',
        }),
      { wrapper }
    );

    expect(result.current).toBe(0);
  });

  test('Updates count on subscription event', async () => {
    const { result } = renderHook(
      () =>
        useNotificationCount({
          resourceType: 'Communication',
          countCriteria: 'recipient=Practitioner/456&_summary=count',
          subscriptionCriteria: 'Communication?recipient=Practitioner/456',
        }),
      { wrapper }
    );

    expect(result.current).toBe(0);

    // Create a resource that matches the criteria
    const communication = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      recipient: [{ reference: 'Practitioner/456' }],
    });

    // Emit subscription event to trigger re-fetch with cache: 'reload'
    await act(async () => {
      medplum.getSubscriptionManager().emitEventForCriteria<'message'>('Communication?recipient=Practitioner/456', {
        type: 'message',
        payload: { resourceType: 'Bundle', id: communication.id, type: 'history' },
      });
    });

    expect(result.current).toBe(1);
  });

  test('Handles search errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(medplum, 'search').mockRejectedValue(new Error('Search failed'));

    renderHook(
      () =>
        useNotificationCount({
          resourceType: 'Communication',
          countCriteria: 'bad-criteria',
          subscriptionCriteria: 'Communication',
        }),
      { wrapper }
    );

    await act(async () => {
      // Let promises settle
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
