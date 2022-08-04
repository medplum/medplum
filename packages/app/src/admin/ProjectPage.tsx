import {
  Bot,
  ClientApplication,
  Patient,
  Practitioner,
  Project,
  Reference,
  RelatedPerson,
  User,
} from '@medplum/fhirtypes';
import { Document, MedplumLink, ResourceBadge, useMedplum } from '@medplum/react';
import React from 'react';
import { getProjectId } from '../utils';

interface ProjectMember {
  id: string;
  project: Reference<Project>;
  user: Reference<Bot | ClientApplication | User>;
  profile: Reference<Bot | ClientApplication | Patient | Practitioner | RelatedPerson>;
  role: string;
}

export function ProjectPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = medplum.get(`admin/projects/${projectId}`).read();

  return (
    <Document width={600}>
      <h1>Admin / Projects / {result.project.name}</h1>
      <h3>Members</h3>
      <MemberTable
        members={result.members.filter((member: ProjectMember) => member.role !== 'bot' && member.role !== 'client')}
        showRole={true}
      />
      <div className="medplum-right">
        <MedplumLink to={`/admin/project/invite`}>Invite new user</MedplumLink>
      </div>
      <h3>Clients</h3>
      <MemberTable members={result.members.filter((member: any) => member.role === 'client')} />
      <div className="medplum-right">
        <MedplumLink to={`/admin/project/client`}>Create new client</MedplumLink>
      </div>
      <h3>Bots</h3>
      <MemberTable members={result.members.filter((member: any) => member.role === 'bot')} />
      <div className="medplum-right">
        <MedplumLink to={`/admin/project/bot`}>Create new bot</MedplumLink>
      </div>
    </Document>
  );
}

interface MemberTableProps {
  members: ProjectMember[];
  showRole?: boolean;
}

function MemberTable(props: MemberTableProps): JSX.Element {
  return (
    <table className="medplum-table">
      {props.showRole ? (
        <colgroup>
          <col style={{ width: '60%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
      ) : (
        <colgroup>
          <col style={{ width: '80%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
      )}
      <thead>
        <tr>
          <th>Name</th>
          {props.showRole && <th className="medplum-center">Role</th>}
          <th className="medplum-center">Actions</th>
        </tr>
      </thead>
      <tbody>
        {sortMembers(props.members).map((member: ProjectMember) => (
          <tr key={member.profile.reference}>
            <td>
              <ResourceBadge value={member.profile} link={true} />
            </td>
            {props.showRole && <td className="medplum-center">{member.role}</td>}
            <td className="medplum-center">
              <MedplumLink to={`/admin/project/members/${member.id}`}>Access</MedplumLink>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function sortMembers(members: ProjectMember[]): ProjectMember[] {
  return members.sort((a: ProjectMember, b: ProjectMember) =>
    (a.profile.display || '').localeCompare(b.profile.display || '')
  );
}
