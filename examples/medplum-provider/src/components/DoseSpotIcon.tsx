// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Indicator, Tooltip } from '@mantine/core';
import { useDoseSpotNotifications } from '@medplum/dosespot-react';
import { useMedplumNavigate } from '@medplum/react';
import { IconPrescription } from '@tabler/icons-react';
import { JSX, useCallback } from 'react';

export function DoseSpotIcon(): JSX.Element {
  const navigate = useMedplumNavigate();
  const unreadCount = useDoseSpotNotifications();

  const handleClick = useCallback(async () => {
    navigate('/dosespot');
  }, [navigate]);

  const icon = (
    <Tooltip label="DoseSpot Notifications">
      <ActionIcon variant="subtle" color="gray" size="lg" aria-label="DoseSpot Notifications" onClick={handleClick}>
        <IconPrescription />
      </ActionIcon>
    </Tooltip>
  );

  return unreadCount ? (
    <Indicator inline label={unreadCount.toLocaleString()} size={16} offset={2} position="bottom-end" color="red">
      {icon}
    </Indicator>
  ) : (
    icon
  );
}
