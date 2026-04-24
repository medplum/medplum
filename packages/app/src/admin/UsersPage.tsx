// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Group, Text, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import { IconUserPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { MemberTable } from './MembersTable';

const profileTypeOptions = [
  { label: 'All', value: 'Patient,Practitioner,RelatedPerson' },
  { label: 'Practitioner', value: 'Practitioner' },
  { label: 'Patient', value: 'Patient' },
  { label: 'RelatedPerson', value: 'RelatedPerson' },
];

export function UsersPage(): JSX.Element {
  return (
    <>
      // FIXME
      <Title>ProjectMemberships by User and Profile Type</Title>
      <Text size="sm">
        This page lists all ProjectMemberships by User and Profile Type. Each member has a profile type (Practitioner,
        Patient, or RelatedPerson) that defines their role.{' '}
        <Anchor href="https://www.medplum.com/docs/user-management" target="_blank" rel="noopener noreferrer">
          Learn more about user management.
        </Anchor>
      </Text>
      <MemberTable
        fields={['user', 'profile', 'profile-type', 'accessPolicy', 'userConfiguration', 'active', 'admin']}
      />
      <Group justify="flex-end">
        <MedplumLink to={`/admin/invite`}>Invite new user</MedplumLink>
      </Group>
      <MemberTable
        profileTypeOptions={profileTypeOptions}
        fields={['user', 'profile', 'profile-type', 'accessPolicy', 'userConfiguration', 'active', 'admin']}
        toolbarLeft={
          <Button
            component={MedplumLink}
            to="/admin/invite"
            variant="outline"
            color="blue"
            leftSection={<IconUserPlus size={14} />}
          >
            Invite New User
          </Button>
        }
        toolbarRight={
          <Anchor
            href="https://www.medplum.com/docs/user-management"
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            Learn more about roles and user management
          </Anchor>
        }
      />
    </>
  );
}
