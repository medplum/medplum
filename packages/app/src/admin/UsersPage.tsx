// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Group, Text, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import type { JSX } from 'react';
import { MemberTable } from './MembersTable';

export function UsersPage(): JSX.Element {
  return (
    <>
      <Title>Members</Title>
      <Text size="sm">
        Project members are users with access to this project. Each member has a profile type (Practitioner, Patient, or
        RelatedPerson) that defines their role.{' '}
        <Anchor href="https://www.medplum.com/docs/user-management" target="_blank" rel="noopener noreferrer">
          Learn more about user management.
        </Anchor>
      </Text>
      <MemberTable fields={['user', 'profile', 'profile-type', 'accessPolicy', 'userConfiguration', 'active', 'admin']} />
      <Group justify="flex-end">
        <MedplumLink to={`/admin/invite`}>Invite new user</MedplumLink>
      </Group>
    </>
  );
}
