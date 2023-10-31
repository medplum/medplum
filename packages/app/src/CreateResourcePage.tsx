import { Paper, ScrollArea, Tabs, Text } from '@mantine/core';
import React, { useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';

const tabs = ['Form', 'JSON'];
const defaultTab = tabs[0].toLowerCase();

export function CreateResourcePage(): JSX.Element {
  const navigate = useNavigate();
  const { resourceType } = useParams();
  const tab = window.location.pathname.split('/').pop();
  const [currentTab, setCurrentTab] = useState<string>(tab ?? defaultTab);

  /**
   * Handles a tab change event.
   * @param newTabName - The new tab name.
   */
  function onTabChange(newTabName: string): void {
    setCurrentTab(newTabName);
    navigate(`/${resourceType}/new/${newTabName}`);
  }

  return (
    <>
      <Paper>
        <Text p="md" weight={500}>
          New&nbsp;{resourceType}
        </Text>
        <ScrollArea>
          <Tabs defaultValue="form" value={currentTab} onTabChange={onTabChange}>
            <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
              {tabs.map((t) => (
                <Tabs.Tab key={t} value={t.toLowerCase()} px="md">
                  {t}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        </ScrollArea>
      </Paper>
      <Outlet />
    </>
  );
}
