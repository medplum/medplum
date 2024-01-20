import { Button, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { InternalSchemaElement, deepClone, getElementDefinition, normalizeOperationOutcome } from '@medplum/core';
import { ProjectSite } from '@medplum/fhirtypes';
import { ResourcePropertyInput, useMedplum } from '@medplum/react';
import { FormEvent, useEffect, useState } from 'react';
import { getProjectId } from '../utils';

export function SitesPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const projectDetails = medplum.get(`admin/projects/${projectId}`).read();
  const [schemaLoaded, setSchemaLoaded] = useState<boolean>(false);
  const [sites, setSites] = useState<ProjectSite[] | undefined>();

  useEffect(() => {
    medplum
      .requestSchema('Project')
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    if (projectDetails) {
      setSites(deepClone(projectDetails.project.site || []));
    }
  }, [medplum, projectDetails]);

  if (!schemaLoaded || !sites) {
    return <div>Loading...</div>;
  }

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        medplum
          .post(`admin/projects/${projectId}/sites`, sites)
          .then(() => medplum.get(`admin/projects/${projectId}`, { cache: 'reload' }))
          .then(() => showNotification({ color: 'green', message: 'Saved' }))
          .catch((err) => {
            const operationOutcome = normalizeOperationOutcome(err);
            // Only show the first error
            showNotification({
              color: 'red',
              message: `Error ${operationOutcome.issue?.[0].details?.text} ${operationOutcome.issue?.[0].expression?.[0]}`,
              autoClose: false,
            });
          });
      }}
    >
      <Title>Project Sites</Title>
      <p>Use project sites configure your project on a separate domain.</p>
      <ResourcePropertyInput
        property={getElementDefinition('Project', 'site') as InternalSchemaElement}
        name="site"
        path="Project.site"
        defaultValue={sites}
        onChange={setSites}
        outcome={undefined}
      />
      <Button type="submit">Save</Button>
    </form>
  );
}
