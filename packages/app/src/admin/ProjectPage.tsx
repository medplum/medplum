import { Document, MedplumLink, ResourceBadge, useMedplum } from '@medplum/react';
import React from 'react';
import { getProjectId } from '../utils';

export function ProjectPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = medplum.get(`admin/projects/${projectId}`).read();

  return (
    <Document width={600}>
      <h1>Admin / Projects / {result.project.name}</h1>
      <h3>Members</h3>
      <table className="medplum-table">
        <colgroup>
          <col style={{ width: '60%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th className="medplum-center">Role</th>
            <th className="medplum-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.members
            .filter((member: any) => member.role !== 'bot' && member.role !== 'client')
            .map((member: any) => (
              <tr key={member.profile.reference}>
                <td>
                  <ResourceBadge value={member.profile} link={true} />
                </td>
                <td className="medplum-center">{member.role}</td>
                <td className="medplum-center">
                  <MedplumLink to={`/admin/project/members/${member.id}`}>Access</MedplumLink>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <div className="medplum-right">
        <MedplumLink to={`/admin/project/invite`}>Invite new user</MedplumLink>
      </div>
      <h3>Clients</h3>
      <table className="medplum-table">
        <colgroup>
          <col style={{ width: '80%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th className="medplum-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.members
            .filter((member: any) => member.role === 'client')
            .map((member: any) => (
              <tr key={member.profile.reference}>
                <td>
                  <ResourceBadge value={member.profile} link={true} />
                </td>
                <td className="medplum-center">
                  <MedplumLink to={`/admin/project/members/${member.id}`}>Access</MedplumLink>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <div className="medplum-right">
        <MedplumLink to={`/admin/project/client`}>Create new client</MedplumLink>
      </div>
      <h3>Bots</h3>
      <table className="medplum-table">
        <colgroup>
          <col style={{ width: '80%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th className="medplum-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.members
            .filter((member: any) => member.role === 'bot')
            .map((member: any) => (
              <tr key={member.profile.reference}>
                <td>
                  <ResourceBadge value={member.profile} link={true} />
                </td>
                <td className="medplum-center">
                  <MedplumLink to={`/admin/project/members/${member.id}`}>Access</MedplumLink>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <div className="medplum-right">
        <MedplumLink to={`/admin/project/bot`}>Create new bot</MedplumLink>
      </div>
    </Document>
  );
}
