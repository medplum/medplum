import { Document, Loading, MedplumLink, ResourceBadge, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';

export function ProjectPage(): JSX.Element {
  const medplum = useMedplum();
  const id = medplum.getActiveLogin()?.project?.reference?.split('/')?.[1] as string;
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<any>();
  const [error, setError] = useState();

  useEffect(() => {
    medplum
      .get('admin/projects/' + id)
      .then((response) => {
        setResult(response);
        setLoading(false);
      })
      .catch((reason) => setError(reason));
  }, [id]);

  if (error) {
    return (
      <Document>
        <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>
      </Document>
    );
  }

  if (loading || !result) {
    return <Loading />;
  }

  return (
    <Document width={600}>
      <h1>Admin / Projects / {result.project.name}</h1>
      <h3>Members</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.members.map((member: any) => (
            <tr key={member.profile}>
              <td>
                <ResourceBadge value={{ reference: member.profile }} link={true} />
              </td>
              <td>{member.role}</td>
              <td>
                <MedplumLink to={`/admin/projects/${id}/members/${member.membershipId}`}>Edit</MedplumLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <MedplumLink to={`/admin/projects/${result.project.id}/invite`}>Invite</MedplumLink>
    </Document>
  );
}
