import { ActionIcon, Indicator, Tooltip } from '@mantine/core';
import { ResourceType } from '@medplum/fhirtypes';
import { useMedplum, useSubscription } from '@medplum/react-hooks';
import { useCallback, useEffect, useState } from 'react';

export interface NotificationIconProps {
  readonly iconComponent: JSX.Element;
  readonly label: string;
  readonly resourceType: ResourceType;
  readonly countCriteria: string;
  readonly subscriptionCriteria: string;
  readonly onClick: () => void;
}

export function NotificationIcon(props: NotificationIconProps): JSX.Element {
  const medplum = useMedplum();
  const { label, resourceType, countCriteria, subscriptionCriteria, onClick } = props;
  const [unreadCount, setUnreadCount] = useState(0);

  const updateCount = useCallback(
    (cache: 'default' | 'reload') => {
      medplum
        .search(resourceType, countCriteria, { cache })
        .then((result) => setUnreadCount(result.total as number))
        .catch(console.error);
    },
    [medplum, resourceType, countCriteria]
  );

  // Initial count
  useEffect(() => {
    // Cache=default to use the default cache policy, and accept most recent data
    updateCount('default');
  }, [updateCount]);

  // Subscribe to the criteria
  useSubscription(subscriptionCriteria, () => {
    // Cache=reload to force a reload
    updateCount('reload');
  });

  const icon = (
    <Tooltip label={label}>
      <ActionIcon variant="subtle" color="gray" size="lg" aria-label={label} onClick={onClick}>
        {props.iconComponent}
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
