// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import type { JSX } from 'react';
import { ResourceMemberTable } from './ResourceMemberTable';

export function ClientsPage(): JSX.Element {
  return (
    <>
      <Title>ClientApps</Title>
      <Text size="sm">
        This page lists all ProjectMemberships for ClientApplications. 
      </Text>
      <ResourceMemberTable
        resourceType="ClientApplication"
        fields={['user', 'profile', 'accessPolicy', 'userConfiguration', 'active', 'admin']}
      />
      <Group justify="flex-end">
        <MedplumLink to={`/admin/clients/new`}>Create new client</MedplumLink>
      </Group>
    </>
  );
}
