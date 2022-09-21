import { Button } from '@mantine/core';
import { IndexedStructureDefinition } from '@medplum/core';
import { ProjectSite } from '@medplum/fhirtypes';
import { ResourcePropertyInput, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getProjectId } from '../utils';

export function SitesPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const projectDetails = medplum.get(`admin/projects/${projectId}`).read();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [sites, setSites] = useState<ProjectSite[] | undefined>();

  useEffect(() => {
    medplum.requestSchema('Project').then(setSchema).catch(console.log);
  }, [medplum]);

  useEffect(() => {
    if (projectDetails) {
      setSites(JSON.parse(JSON.stringify(projectDetails.project.site || [])));
    }
  }, [medplum, projectDetails]);

  if (!schema || !sites) {
    return <div>Loading...</div>;
  }

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        medplum
          .post(`admin/projects/${projectId}/sites`, sites)
          .then(() => medplum.get(`admin/projects/${projectId}`, { cache: 'reload' }))
          .then(() => toast.success('Saved'))
          .catch(console.log);
      }}
    >
      <h1>Project Sites</h1>
      <p>Use project sites configure your project on a separate domain.</p>
      <ResourcePropertyInput
        property={schema.types['Project'].properties['site']}
        name="site"
        defaultValue={sites}
        onChange={setSites}
      />
      <Button type="submit">Save</Button>
    </form>
  );
}
