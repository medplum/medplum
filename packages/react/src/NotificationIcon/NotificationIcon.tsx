// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Indicator, Tooltip } from '@mantine/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { useNotificationCount } from '@medplum/react-hooks';
import type { JSX } from 'react';

export interface NotificationIconProps {
  readonly iconComponent: JSX.Element;
  readonly label?: string;
  readonly tooltip?: string;
  readonly resourceType: ResourceType;
  readonly countCriteria: string;
  readonly subscriptionCriteria: string;
  readonly onClick?: () => void;
}

export function NotificationIcon(props: NotificationIconProps): JSX.Element {
  const { resourceType, countCriteria, subscriptionCriteria } = props;
  const unreadCount = useNotificationCount({ resourceType, countCriteria, subscriptionCriteria });

  // Start with the inner icon component
  let result: JSX.Element = props.iconComponent;

  // If there is an onClick handler, wrap the icon in an ActionIcon
  if (props.onClick) {
    result = (
      <ActionIcon variant="subtle" color="gray" size="lg" aria-label={props.label} onClick={props.onClick}>
        {result}
      </ActionIcon>
    );
  }

  // If there is a tooltip, wrap the icon in a Tooltip
  if (props.tooltip) {
    result = <Tooltip label={props.tooltip}>{result}</Tooltip>;
  }

  // If there is an unread count, add an Indicator
  if (unreadCount > 0) {
    result = (
      <Indicator inline label={unreadCount.toLocaleString()} size={16} offset={2} position="bottom-end" color="red">
        {result}
      </Indicator>
    );
  }

  return result;
}
