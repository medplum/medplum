// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { TabsProps } from '@mantine/core';
import { Anchor, Tabs } from '@mantine/core';
import { isString, locationUtils } from '@medplum/core';
import { useMedplumNavigate } from '@medplum/react-hooks';
import type { JSX, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
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
  /** If true, redirects to the first tab when the current URL doesn't match any tab. Defaults to false. */
  readonly autoRedirectToFirstTab?: boolean;
}

export function LinkTabs(props: LinkTabsProps): JSX.Element {
  const { baseUrl, tabs: tabDefinitions, children, autoRedirectToFirstTab, ...rest } = props;
  const tabs = normalizeTabDefinitions(tabDefinitions);
  const navigate = useMedplumNavigate();

  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = getTabFromUrl(baseUrl);
    return tab && tabs.some((t) => t.value === tab) ? tab : tabs[0].value;
  });

  // navigate to currentTab if not in the URL (only when redirectToFirstTab is enabled)
  const effectFiredRef = useRef(false);
  useEffect(() => {
    if (!autoRedirectToFirstTab || effectFiredRef.current) {
      return;
    }
    effectFiredRef.current = true;

    const tab = getTabFromUrl(baseUrl);
    if (!tab || tab !== currentTab) {
      navigate(`${baseUrl}/${currentTab}`);
    }
  }, [baseUrl, currentTab, navigate, autoRedirectToFirstTab]);

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

function getTabFromUrl(_baseUrl: string): string | undefined {
  return locationUtils.getPathname().split('/').pop();
}

function normalizeTabDefinitions(tabs: string[] | TabDefinition[]): TabDefinition[] {
  return tabs.map((t) => (isString(t) ? { label: t, value: t.toLowerCase() } : t));
}

function onLinkClick(e: MouseEvent): void {
  if (!isAuxClick(e)) {
    e.preventDefault();
  }
}
