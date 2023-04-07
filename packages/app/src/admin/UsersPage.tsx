import { Group, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import React from 'react';
import { MemberTable } from './MembersTable';

export function UsersPage(): JSX.Element {
  return (
    <>
      <Title>Users</Title>
      <MemberTable resourceType="Practitioner" fields={['user', 'profile', 'admin', '_lastUpdated']} />
      <Group position="right">
        <MedplumLink to={`/admin/invite`}>Invite new user</MedplumLink>
      </Group>
    </>
  );
}
