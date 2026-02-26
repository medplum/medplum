// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import { IconUserPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { MemberTable } from './MembersTable';

export function UsersPage(): JSX.Element {
  return (
    <>
      <Title>ProjectMemberships by User and Profile Type</Title>
      <MemberTable
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
