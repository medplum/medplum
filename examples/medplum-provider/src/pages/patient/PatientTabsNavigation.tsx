// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, Tabs } from '@mantine/core';
import type { JSX } from 'react';
import type { PatientPageTabInfo } from './PatientPage.utils';
import classes from './PatientTabsNavigation.module.css';

interface PatientTabsNavigationProps {
  tabs: PatientPageTabInfo[];
  currentTab: string;
  onTabChange: (value: string | null) => void;
}

export function PatientTabsNavigation({ tabs, currentTab, onTabChange }: PatientTabsNavigationProps): JSX.Element {
  const activeTab = currentTab.toLowerCase();

  return (
    <Paper
      w="100%"
      pt={16}
      pb={0}
      px={0}
      radius={0}
      style={{ borderBottom: '1px solid var(--app-shell-border-color)' }}
    >
      <Tabs value={activeTab} onChange={onTabChange} variant="unstyled" className="pill-tabs">
        <Tabs.List className={classes.list}>
          {tabs.map((t) => (
            <Tabs.Tab key={t.id} value={t.id}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </Paper>
  );
}
