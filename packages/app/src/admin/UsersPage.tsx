import { Group, Title } from '@mantine/core';
import { MedplumLink, useMedplum } from '@medplum/react';
import React from 'react';
import { getProjectId } from '../utils';
import { MemberTable, ProjectMember } from './MembersTable';

export function UsersPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = medplum.get(`admin/projects/${projectId}`).read();
  const roles = ['owner', 'admin', 'member'];

  return (
    <>
      <Title>Users</Title>
      <MemberTable
        members={result.members.filter((member: ProjectMember) => roles.includes(member.role))}
        showRole={true}
      />
      <Group position="right">
        <MedplumLink to={`/admin/invite`}>Invite new user</MedplumLink>
      </Group>
    </>
  );
}
