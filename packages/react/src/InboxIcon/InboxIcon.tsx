// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { useMedplum, useSubscription } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import classes from './InboxIcon.module.css';

export interface InboxIconProps {
  readonly iconComponent: JSX.Element;
  readonly resourceType: ResourceType;
  readonly countCriteria: string;
  readonly subscriptionCriteria: string;
}

/**
 * A component that renders an icon with a count displayed on the right side.
 * Designed for use in navigation bars where the count should appear after the label.
 * Uses CSS order and margin-left: auto to position the count on the far right.
 * @param props - The component props.
 * @returns The rendered component.
 */
export function InboxIcon(props: InboxIconProps): JSX.Element {
  const medplum = useMedplum();
  const { resourceType, countCriteria, subscriptionCriteria } = props;
  const [count, setCount] = useState(0);

  const updateCount = useCallback(
    (cache: 'default' | 'reload') => {
      medplum
        .search(resourceType, countCriteria, { cache })
        .then((result) => setCount(result.total as number))
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

  if (count === 0) {
    return props.iconComponent;
  }

  return (
    <div className={classes.wrapper}>
      {props.iconComponent}
      <Text component="span" size="sm" fw={400} className={classes.count}>
        {count.toLocaleString()}
      </Text>
    </div>
  );
}
