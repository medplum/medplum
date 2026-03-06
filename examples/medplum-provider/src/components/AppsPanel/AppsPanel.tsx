// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowsDiagonal2, IconArrowsDiagonalMinimize2, IconX } from '@tabler/icons-react';
import type { JSX, ReactElement, ReactNode } from 'react';
import { useAppsPanel } from './AppsPanelContext';
import classes from './AppsPanel.module.css';


interface AppsPanelProps {
  readonly icon?: ReactElement;
  readonly title: ReactNode;
  readonly children: ReactNode;
}

export function AppsPanel({ icon, title, children }: AppsPanelProps): JSX.Element {
  const { panelMaximized, toggleMaximize, closePanel } = useAppsPanel();

  return (
    <div className={`${classes.panel} ${panelMaximized ? classes.panelMaximized : ''}`}>
      <div className={classes.panelHeader}>
        <Group gap={8}>
          {icon && <div className={classes.appIcon}>{icon}</div>}
          <Text fw={800} size="sm">
            {title}
          </Text>
        </Group>
        <Group gap={12}>
          <Tooltip
            label={panelMaximized ? 'View Smaller' : 'View Larger'}
            position="bottom"
            openDelay={600}
          >
            <ActionIcon
              variant="transparent"
              size={32}
              radius="xl"
              onClick={toggleMaximize}
              aria-label={panelMaximized ? 'View Smaller' : 'View Larger'}
              className={classes.panelActionIcon}
            >
              {panelMaximized ? (
                <IconArrowsDiagonalMinimize2 size={16} />
              ) : (
                <IconArrowsDiagonal2 size={16} />
              )}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close" position="bottom" openDelay={600}>
            <ActionIcon
              variant="transparent"
              size={32}
              radius="xl"
              onClick={closePanel}
              aria-label="Close"
              className={classes.panelActionIcon}
            >
              <IconX size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>
      <div className={classes.panelBody}>{children}</div>
    </div>
  );
}
