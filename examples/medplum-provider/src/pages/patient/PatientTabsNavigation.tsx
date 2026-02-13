// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, Tabs, useMantineTheme } from '@mantine/core';
import type { JSX } from 'react';
import type { PatientPageTabInfo } from './PatientPage.utils';
import classes from './PatientTabsNavigation.module.css';

interface PatientTabsNavigationProps {
  tabs: PatientPageTabInfo[];
  currentTab: string;
  onTabChange: (value: string | null) => void;
}

export function PatientTabsNavigation({ tabs, currentTab, onTabChange }: PatientTabsNavigationProps): JSX.Element {
  const theme = useMantineTheme();
  const activeTab = currentTab.toLowerCase();

  return (
    <Paper w="100%" p={16} style={{ borderBottom: `1px solid ${theme.colors.gray[2]}` }}>
      <Tabs value={activeTab} onChange={onTabChange} variant="unstyled">
        <Tabs.List className={classes.list}>
          {tabs.map((t) => {
            const isActive = t.id === activeTab;
            return (
              <Tabs.Tab
                key={t.id}
                value={t.id}
                className={classes.tab}
                style={{
                  backgroundColor: isActive ? theme.colors.gray[1] : undefined,
                  color: isActive ? theme.colors.gray[9] : theme.colors.gray[7],
                }}
              >
                {t.label}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
      </Tabs>
    </Paper>
  );
}
