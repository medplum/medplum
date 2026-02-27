// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, Tabs } from '@mantine/core';
import type { JSX } from 'react';
import type { PatientPageTabInfo } from './PatientPage.utils';

interface PatientTabsNavigationProps {
  tabs: PatientPageTabInfo[];
  currentTab: string;
  onTabChange: (value: string | null) => void;
}

export function PatientTabsNavigation({ tabs, currentTab, onTabChange }: PatientTabsNavigationProps): JSX.Element {
  return (
    <Paper w="100%">
      <Tabs value={currentTab.toLowerCase()} onChange={onTabChange}>
        <Tabs.List
          style={{
            display: 'flex',
            width: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            flexWrap: 'nowrap',
          }}
        >
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
