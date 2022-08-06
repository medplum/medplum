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
      <h1>Clients</h1>
      <MemberTable members={result.members.filter((member: any) => member.role === 'client')} />
      <div className="medplum-right">
        <MedplumLink to={`/admin/project/client`}>Create new client</MedplumLink>
      </div>
    </>
  );
}
