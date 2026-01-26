// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { TabsProps } from '@mantine/core';
import { Anchor, Tabs } from '@mantine/core';
import { isString, locationUtils } from '@medplum/core';
import { useMedplumNavigate } from '@medplum/react-hooks';
import type { JSX, MouseEvent } from 'react';
import { useState } from 'react';
import { isAuxClick } from '../utils/dom';
import styles from './LinkTabs.module.css';

export interface TabDefinition {
  readonly label: string;
  readonly value: string;
}

export interface LinkTabsProps extends Omit<TabsProps, 'value' | 'onChange'> {
  readonly baseUrl: string;
  readonly tabs: string[] | TabDefinition[];
  readonly children?: React.ReactNode;
}

export function LinkTabs(props: LinkTabsProps): JSX.Element {
  const { baseUrl, tabs: tabDefinitions, children, ...rest } = props;
  const tabs = normalizeTabDefinitions(tabDefinitions);
  const navigate = useMedplumNavigate();

  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = locationUtils.getPathname().split('/').pop();
    return tab && tabs.some((t) => t.value === tab) ? tab : tabs[0].value;
  });

  function onTabChange(newTabName: string | null): void {
    newTabName = newTabName || tabs[0].value;
    setCurrentTab(newTabName);
    navigate(`${baseUrl}/${newTabName}`);
  }

  return (
    <Tabs value={currentTab.toLowerCase()} onChange={onTabChange} {...rest}>
      <Tabs.List className={styles.list}>
        {tabs.map((t) => (
          <Tabs.Tab key={t.value} value={t.value}>
            <Anchor className={styles.link} href={`${baseUrl}/${t.value}`} onClick={onLinkClick}>
              {t.label}
            </Anchor>
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {children}
    </Tabs>
  );
}

function normalizeTabDefinitions(tabs: string[] | TabDefinition[]): TabDefinition[] {
  return tabs.map((t) => (isString(t) ? { label: t, value: t.toLowerCase() } : t));
}

function onLinkClick(e: MouseEvent): void {
  if (!isAuxClick(e)) {
    e.preventDefault();
  }
}
