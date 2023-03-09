import { Group, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import React from 'react';
import { MemberTable } from './MembersTable';

export function ClientsPage(): JSX.Element {
  return (
    <>
      <Title>Clients</Title>
      <MemberTable resourceType="ClientApplication" fields={['user', 'profile', 'admin', '_lastUpdated']} />
      <Group position="right">
        <MedplumLink to={`/admin/clients/new`}>Create new client</MedplumLink>
      </Group>
    </>
  );
}
