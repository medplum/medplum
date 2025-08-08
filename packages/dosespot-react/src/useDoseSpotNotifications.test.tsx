// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '@testing-library/react';
import { JSX } from 'react';
import { vi } from 'vitest';
import { DoseSpotNotificationsOptions, useDoseSpotNotifications } from './useDoseSpotNotifications';

export function MyTestIcon(props?: DoseSpotNotificationsOptions): JSX.Element {
  const unreadCount = useDoseSpotNotifications(props);
  return <div>Count: {unreadCount}</div>;
}

describe('useDoseSpotNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  test('returns unread count', async () => {
    const medplum = new MockClient();

    medplum.getProjectMembership = vi.fn().mockReturnValue({
      identifier: [{ system: 'dosespot' }],
    });

    const executeBotMock = vi.fn().mockResolvedValue({
      PendingPrescriptionsCount: 3,
      PendingRxChangeCount: 0,
      RefillRequestsCount: 0,
      TransactionErrorsCount: 0,
    });

    medplum.executeBot = executeBotMock;

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MyTestIcon />
        </MedplumProvider>
      );
    });

    expect(screen.getByText('Count:')).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(executeBotMock).toHaveBeenCalled();

    expect(screen.getByText('Count: 3')).toBeDefined();

    executeBotMock.mockResolvedValueOnce({
      PendingPrescriptionsCount: 5,
      PendingRxChangeCount: 1,
      RefillRequestsCount: 0,
      TransactionErrorsCount: 0,
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Count: 6')).toBeDefined();
  });

  test('handles errors', async () => {
    const medplum = new MockClient();
    const onError = vi.fn();

    medplum.getProjectMembership = vi.fn().mockReturnValue({
      identifier: [{ system: 'dosespot' }],
    });

    medplum.executeBot = vi.fn().mockRejectedValue(new Error('API Error'));

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MyTestIcon onError={onError} />
        </MedplumProvider>
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Count:')).toBeDefined();
  });
});
