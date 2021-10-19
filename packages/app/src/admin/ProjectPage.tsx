import { Document, Loading, MedplumLink, ResourceBadge, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<any>();
  const [error, setError] = useState();

  useEffect(() => {
    medplum.get('admin/projects/' + id)
      .then(response => {
        setResult(response);
        setLoading(false);
      })
      .catch(reason => setError(reason));
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {result.members.map((member: any) => (
            <tr key={member.profile}>
              <td>
                <ResourceBadge value={{ reference: member.profile }} link={true} />
              </td>
              <td>
                <MedplumLink to={`/admin/projects/${id}/members/${member.membershipId}`}>Edit</MedplumLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <a href={`/admin/projects/${result.project.id}/invite`}>Invite</a>
    </Document>
  );
}
