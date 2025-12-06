// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { TabsProps } from '@mantine/core';
import { Tabs } from '@mantine/core';
import { locationUtils } from '@medplum/core';
import { useMedplumNavigate } from '@medplum/react-hooks';
import type { JSX, SyntheticEvent } from 'react';
import { useState } from 'react';

export interface LinkTabsProps extends Omit<TabsProps, 'value' | 'onChange' | 'onAuxClick'> {
  readonly baseUrl: string;
  readonly tabs: string[];
  readonly children?: React.ReactNode;
}

export function LinkTabs(props: LinkTabsProps): JSX.Element {
  const navigate = useMedplumNavigate();
  const { baseUrl, tabs, children, ...rest } = props;

  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = locationUtils.getPathname().split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();
  });

  function onTabChange(newTabName: string | null): void {
    if (!newTabName) {
      newTabName = tabs[0].toLowerCase();
    }
    setCurrentTab(newTabName);
    navigate(`${baseUrl}/${newTabName}`);
  }

  function onAuxClick(e: SyntheticEvent): void {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const tabName = target.innerText.toLowerCase();
    window.open(`${baseUrl}/${tabName}`, '_blank');
  }

  return (
    <Tabs value={currentTab.toLowerCase()} onChange={onTabChange} onAuxClick={onAuxClick} {...rest}>
      {children}
    </Tabs>
  );
}
