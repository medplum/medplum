// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Group, Paper, ScrollArea, Tabs, Text, useMantineTheme } from '@mantine/core';
import type { JSX } from 'react';
import { Outlet, useParams } from 'react-router';
import { LinkTabs } from '../../react/src/LinkTabs/LinkTabs';

const tabs = ['Form', 'JSON', 'Profiles'];
const BETA_TABS: (typeof tabs)[number][] = ['Profiles'];

export function CreateResourcePage(): JSX.Element {
  const theme = useMantineTheme();
  const { resourceType } = useParams();

  return (
    <>
      <Paper>
        <Text p="md" fw={500}>
          New&nbsp;{resourceType}
        </Text>
        <ScrollArea>
          <LinkTabs baseUrl={`/${resourceType}/new`} tabs={tabs}>
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
          </LinkTabs>
        </ScrollArea>
      </Paper>
      <Outlet />
    </>
  );
}
