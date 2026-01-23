// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Indicator, Text } from '@mantine/core';
import { useDoseSpotNotifications } from '@medplum/dosespot-react';
import type { ResourceType } from '@medplum/fhirtypes';
import { useMedplum, useSubscription } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import classes from './NavbarNotificationLink.module.css';

/**
 * Hook to get the notification count for a resource type.
 * @param resourceType - The FHIR resource type to query.
 * @param countCriteria - The search criteria for counting resources.
 * @param subscriptionCriteria - The subscription criteria to listen for updates.
 * @returns The current notification count.
 */
export function useNotificationCount(
  resourceType: ResourceType,
  countCriteria: string,
  subscriptionCriteria: string
): number {
  const medplum = useMedplum();
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
    updateCount('default');
  }, [updateCount]);

  // Subscribe to the criteria
  useSubscription(subscriptionCriteria, () => {
    updateCount('reload');
  });

  return count;
}

export interface NavbarLinkWithCountProps {
  readonly iconComponent: JSX.Element;
  readonly resourceType: ResourceType;
  readonly countCriteria: string;
  readonly subscriptionCriteria: string;
}

/**
 * A component that renders a navbar link icon with a text count displayed on the far right.
 * Uses a flex wrapper to position the count after the label.
 * @param props - The component props.
 * @returns The rendered component.
 */
export function NavbarLinkWithCount(props: NavbarLinkWithCountProps): JSX.Element {
  const count = useNotificationCount(props.resourceType, props.countCriteria, props.subscriptionCriteria);

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

export interface NavbarLinkWithBadgeProps {
  readonly iconComponent: JSX.Element;
  readonly count: number;
}

/**
 * A component that renders a navbar link icon with a badge indicator on the far right.
 * Used for DoseSpot notifications where we want to show a red badge instead of text count.
 * @param props - The component props.
 * @returns The rendered component.
 */
export function NavbarLinkWithBadge(props: NavbarLinkWithBadgeProps): JSX.Element {
  if (props.count === 0) {
    return props.iconComponent;
  }

  return (
    <div className={classes.wrapper}>
      {props.iconComponent}
      <Indicator
        inline
        label={props.count.toLocaleString()}
        size={16}
        color="red"
        className={classes.badge}
        classNames={{ indicator: classes.badgeIndicator }}
      >
        <span />
      </Indicator>
    </div>
  );
}

export interface DoseSpotNavbarLinkProps {
  readonly iconComponent: JSX.Element;
}

/**
 * A component that renders the DoseSpot navbar link icon with a badge indicator.
 * Uses the useDoseSpotNotifications hook to get the notification count.
 * @param props - The component props.
 * @returns The rendered component.
 */
export function DoseSpotNavbarLink(props: DoseSpotNavbarLinkProps): JSX.Element {
  const count = useDoseSpotNotifications() ?? 0;

  return <NavbarLinkWithBadge iconComponent={props.iconComponent} count={count} />;
}
