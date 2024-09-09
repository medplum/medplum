import { Group, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import { MemberTable } from './MembersTable';

export function BotsPage(): JSX.Element {
  return (
    <>
      <Title>Bots</Title>
      <MemberTable resourceType="Bot" fields={['user', 'profile', 'admin', '_lastUpdated']} />
      <Group justify="flex-end">
        <MedplumLink to={`/admin/bots/new`}>Create new bot</MedplumLink>
      </Group>
    </>
  );
}
