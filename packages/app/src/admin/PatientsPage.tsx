// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
import { JSX } from 'react';
import { MemberTable } from './MembersTable';

export function PatientsPage(): JSX.Element {
  return (
    <>
      <Title>Patients</Title>
      <MemberTable resourceType="Patient" fields={['user', 'profile', '_lastUpdated']} />
      <Group justify="flex-end">
        <MedplumLink to={`/admin/invite`}>Invite new patient</MedplumLink>
      </Group>
    </>
  );
}
