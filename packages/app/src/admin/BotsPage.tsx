// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Group, Paper, Text, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import type { JSX } from 'react';
import { MemberTable } from './MembersTable';

export function BotsPage(): JSX.Element {
  return (
    <>
      <Title>ProjectMemberships by Bot</Title>
      <MemberTable
        profileTypeOptions={[{ label: 'Bot', value: 'Bot' }]}
        fields={['user', 'profile', 'accessPolicy', 'userConfiguration', 'active', 'admin']}
        toolbarLeft={
          <>
            <Paper withBorder p="sm" radius="sm" maw={520}>
              <Text size="sm" c="dimmed">
                Please note that this list is limited to Bots that have a ProjectMembership. Bots that are run as user commonly do not have a ProjectMembership, and are not included, 
                such as most Bots in Medplum-managed integrations. For a complete list of Bots, see <MedplumLink to="/Bot">Bots</MedplumLink>.
                For more information, see <Anchor href="https://www.medplum.com/docs/bots/bot-run-as-user" target="_blank" rel="noopener noreferrer">running Bots as user</Anchor>.
              </Text>
            </Paper>
          </>
        }
        toolbarRight={
          <Anchor href="https://www.medplum.com/docs/bots" target="_blank" rel="noopener noreferrer" size="sm">
            Learn more about Bots
          </Anchor>
        }
      />
      <Group justify="flex-end">
        <MedplumLink to={`/admin/bots/new`}>Create new bot</MedplumLink>
      </Group>
    </>
  );
}
