import { Document, Loading, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';

export function ProjectsPage() {
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<any>();
  const [error, setError] = useState();

  useEffect(() => {
    medplum.get('admin/projects')
      .then(response => {
        setResult(response);
        setLoading(false);
      })
      .catch(reason => setError(reason));
  }, []);

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
      <h1>Admin / Projects</h1>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
          </tr>
        </thead>
        <tbody>
          {result.projects.map((project: any) => (
            <tr key={project.id}>
              <td><a href={'/admin/projects/' + project.id}>{project.id}</a></td>
              <td><a href={'/admin/projects/' + project.id}>{project.name}</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Document>
  );
}
