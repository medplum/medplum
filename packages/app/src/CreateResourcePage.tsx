import { Badge, Group, Paper, ScrollArea, Tabs, Text, useMantineTheme } from '@mantine/core';
import { useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';

const tabs = ['Form', 'JSON', 'Profiles'] as const;
const BETA_TABS: (typeof tabs)[number][] = ['Profiles'];
const defaultTab = tabs[0].toLowerCase();

export function CreateResourcePage(): JSX.Element {
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const { resourceType } = useParams();
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tab = window.location.pathname.split('/').pop();
    return tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : defaultTab;
  });

  /**
   * Handles a tab change event.
   * @param newTabName - The new tab name.
   */
  function onTabChange(newTabName: string | null): void {
    if (!newTabName) {
      newTabName = defaultTab;
    }
    setCurrentTab(newTabName);
    navigate(`/${resourceType}/new/${newTabName}`);
  }

  return (
    <>
      <Paper>
        <Text p="md" fw={500}>
          New&nbsp;{resourceType}
        </Text>
        <ScrollArea>
          <Tabs defaultValue={defaultTab} value={currentTab} onChange={onTabChange}>
            <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
              {tabs.map((t) => (
                <Tabs.Tab key={t} value={t.toLowerCase()} px="md">
                  {BETA_TABS.includes(t) ? (
                    <Group gap="xs" wrap="nowrap">
                      {t}
                      <Badge color={theme.primaryColor} size="sm">
                        Beta
                      </Badge>
                    </Group>
                  ) : (
                    t
                  )}
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
