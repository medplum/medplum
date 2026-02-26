// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import type { JSX } from 'react';
import { ResourceMemberTable } from './ResourceMemberTable';

export function ClientsPage(): JSX.Element {
  return (
    <>
      <Title>ProjectMemberships for ClientApplications</Title>
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
