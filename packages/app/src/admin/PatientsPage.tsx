import { Group, Title } from '@mantine/core';
import { MedplumLink } from '@medplum/react';
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
