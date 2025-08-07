// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DOSESPOT_NOTIFICATION_COUNTS_BOT, DoseSpotNotificationCountsResponse } from './common';

export interface DoseSpotNotificationsOptions {
  readonly refreshIntervalMilliseconds?: number;
  readonly onChange?: (count: number) => void;
  readonly onError?: (err: unknown) => void;
}

const DEFAULT_REFRESH_INTERVAL_MILLISECONDS = 10000;

export function useDoseSpotNotifications(options?: DoseSpotNotificationsOptions): number | undefined {
  const medplum = useMedplum();
  const { onChange, onError } = options ?? {};
  const hasDoseSpot = medplum.getProjectMembership()?.identifier?.some((i) => i.system?.includes('dosespot'));
  const refreshInterval = options?.refreshIntervalMilliseconds ?? DEFAULT_REFRESH_INTERVAL_MILLISECONDS;
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState<number | undefined>(undefined);

  const stopTimer = useCallback(() => {
    const timerId = timerRef.current;
    if (timerId) {
      clearInterval(timerId);
    }
  }, []);

  const updateCount = useCallback(async () => {
    try {
      const result = (await medplum.executeBot(
        DOSESPOT_NOTIFICATION_COUNTS_BOT,
        {}
      )) as DoseSpotNotificationCountsResponse;

      let newCount = 0;
      if (result.PendingPrescriptionsCount) {
        newCount += result.PendingPrescriptionsCount;
      }
      if (result.PendingRxChangeCount) {
        newCount += result.PendingRxChangeCount;
      }
      if (result.RefillRequestsCount) {
        newCount += result.RefillRequestsCount;
      }
      if (result.TransactionErrorsCount) {
        newCount += result.TransactionErrorsCount;
      }
      if (newCount !== unreadCount) {
        setUnreadCount(newCount);
        onChange?.(newCount);
      }
    } catch (err: unknown) {
      onError?.(err);
      stopTimer();
    }
  }, [medplum, unreadCount, onChange, onError, stopTimer]);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      updateCount().catch(console.error);
    }, refreshInterval);
  }, [updateCount, refreshInterval]);

  useEffect(() => {
    // Start an interval timer to update the count every 5 seconds
    if (hasDoseSpot) {
      startTimer();
    }

    // Clear the interval timer when the component is unmounted
    return stopTimer;
  }, [hasDoseSpot, startTimer, stopTimer]);

  return unreadCount;
}
