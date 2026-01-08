// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, ScrollArea, Text } from '@mantine/core';
import { LinkTabs } from '@medplum/react';
import type { JSX } from 'react';
import { Outlet, useParams } from 'react-router';

const tabs = ['Form', 'JSON', 'Profiles'];

export function CreateResourcePage(): JSX.Element {
  const { resourceType } = useParams();

  return (
    <>
      <Paper>
        <Text p="md" fw={500}>
          New&nbsp;{resourceType}
        </Text>
        <ScrollArea>
          <LinkTabs baseUrl={`/${resourceType}/new`} tabs={tabs} />
        </ScrollArea>
      </Paper>
      <Outlet />
    </>
  );
}
