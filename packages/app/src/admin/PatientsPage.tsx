import { MedplumLink, useMedplum } from '@medplum/react';
import React from 'react';
import { getProjectId } from '../utils';
import { MemberTable, ProjectMember } from './MembersTable';

export function PatientsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = medplum.get(`admin/projects/${projectId}`).read();

  return (
    <>
      <h1>Patients</h1>
      <MemberTable members={result.members.filter((member: ProjectMember) => member.role === 'patient')} />
      <div className="medplum-right">
        <MedplumLink to={`/admin/invite`}>Invite new patient</MedplumLink>
      </div>
    </>
  );
}
