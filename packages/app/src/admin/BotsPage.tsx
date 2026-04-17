// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import type { JSX } from 'react';
import { ResourceMemberTable } from './ResourceMemberTable';

export function BotsPage(): JSX.Element {
  return (
    <>
      <Title>Bots</Title>
      <Text size="sm">This page lists all ProjectMemberships for Bots.</Text>
      // FIXME
      <ResourceMemberTable
        resourceType="Bot"
      <MemberTable
        profileTypeOptions={[{ label: 'Bot', value: 'Bot' }]}
        fields={['user', 'profile', 'accessPolicy', 'userConfiguration', 'active', 'admin']}
      />
      <Group justify="flex-end">
        <MedplumLink to={`/admin/bots/new`}>Create new bot</MedplumLink>
      </Group>
    </>
  );
}
