import { Table } from '@mantine/core';
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
import { MedplumLink, ResourceBadge } from '@medplum/react';
import React from 'react';

export interface ProjectMember {
  id: string;
  project: Reference<Project>;
  user: Reference<Bot | ClientApplication | User>;
  profile: Reference<Bot | ClientApplication | Patient | Practitioner | RelatedPerson>;
  role: string;
}

export interface MemberTableProps {
  members: ProjectMember[];
  showRole?: boolean;
}

export function MemberTable(props: MemberTableProps): JSX.Element {
  return (
    <Table withBorder withColumnBorders>
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
              <MedplumLink to={`/admin/members/${member.id}`}>Access</MedplumLink>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function sortMembers(members: ProjectMember[]): ProjectMember[] {
  return members.sort((a: ProjectMember, b: ProjectMember) =>
    (a.profile.display as string).localeCompare(b.profile.display as string)
  );
}
