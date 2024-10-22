import { ActionIcon, Indicator, Tooltip } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Identifier } from '@medplum/fhirtypes';
import { useMedplumNavigate } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import { IconPrescription } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const MEDPLUM_BOT_SYSTEM = 'https://www.medplum.com/bots';
const REFRESH_INTERVAL_MILLISECONDS = 10000;

const DOSESPOT_NOTIFICATION_COUNTS_BOT: Identifier = {
  system: MEDPLUM_BOT_SYSTEM,
  value: 'dosespot-notification-counts-bot',
};

interface DoseSpotNotificationCountsResponse {
  PendingPrescriptionsCount: number;
  PendingRxChangeCount: number;
  RefillRequestsCount: number;
  TransactionErrorsCount: number;
}

export function DoseSpotIcon(): JSX.Element {
  const medplum = useMedplum();
  const hasDoseSpot = medplum.getProjectMembership()?.identifier?.some((i) => i.system?.includes('dosespot'));
  const navigate = useMedplumNavigate();
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleClick = useCallback(async () => {
    navigate('/dosespot');
  }, [navigate]);

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
      if (result.PendingPrescriptionsCount !== undefined) {
        newCount += result.PendingPrescriptionsCount;
      }
      if (result.PendingRxChangeCount !== undefined) {
        newCount += result.PendingRxChangeCount;
      }
      if (result.RefillRequestsCount !== undefined) {
        newCount += result.RefillRequestsCount;
      }
      if (result.TransactionErrorsCount !== undefined) {
        newCount += result.TransactionErrorsCount;
      }
      setUnreadCount(newCount);
    } catch (err: unknown) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
      stopTimer();
    }
  }, [medplum, stopTimer]);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      updateCount().catch(console.error);
    }, REFRESH_INTERVAL_MILLISECONDS);
  }, [updateCount]);

  useEffect(() => {
    // Start an interval timer to update the count every 5 seconds
    if (hasDoseSpot) {
      startTimer();
    }

    // Clear the interval timer when the component is unmounted
    return stopTimer;
  }, [hasDoseSpot, startTimer, stopTimer]);

  const icon = (
    <Tooltip label="DoseSpot Notifications">
      <ActionIcon variant="subtle" color="gray" size="lg" aria-label="DoseSpot Notifications" onClick={handleClick}>
        <IconPrescription />
      </ActionIcon>
    </Tooltip>
  );

  return unreadCount > 0 ? (
    <Indicator inline label={unreadCount.toLocaleString()} size={16} offset={2} position="bottom-end" color="red">
      {icon}
    </Indicator>
  ) : (
    icon
  );
}
