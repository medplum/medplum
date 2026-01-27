// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Indicator } from '@mantine/core';
import { useDoseSpotNotifications } from '@medplum/dosespot-react';
import { IconPill } from '@tabler/icons-react';
import type { JSX } from 'react';

export function DoseSpotIcon(): JSX.Element {
  const unreadCount = useDoseSpotNotifications();

  const icon = <IconPill size={20} />;

  return unreadCount ? (
    <Indicator inline label={unreadCount.toLocaleString()} size={16} offset={2} position="bottom-end" color="red">
      {icon}
    </Indicator>
  ) : (
    icon
  );
}
