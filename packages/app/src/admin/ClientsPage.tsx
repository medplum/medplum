import { Group, Title } from '@mantine/core';
import { MedplumLink, useMedplum } from '@medplum/react';
import React from 'react';
import { getProjectId } from '../utils';
import { MemberTable } from './MembersTable';

export function ClientsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = medplum.get(`admin/projects/${projectId}`).read();

  return (
    <>
      <Title>Clients</Title>
      <MemberTable members={result.members.filter((member: any) => member.role === 'client')} />
      <Group position="right">
        <MedplumLink to={`/admin/clients/new`}>Create new client</MedplumLink>
      </Group>
    </>
  );
}
