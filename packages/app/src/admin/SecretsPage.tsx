import { Button, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { deepClone, getElementDefinition } from '@medplum/core';
import { ElementDefinition, ProjectSecret } from '@medplum/fhirtypes';
import { ResourcePropertyInput, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { getProjectId } from '../utils';

export function SecretsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const projectDetails = medplum.get(`admin/projects/${projectId}`).read();
  const [schemaLoaded, setSchemaLoaded] = useState<boolean>(false);
  const [secrets, setSecrets] = useState<ProjectSecret[] | undefined>();

  useEffect(() => {
    medplum
      .requestSchema('Project')
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    if (projectDetails) {
      setSecrets(deepClone(projectDetails.project.secret || []));
    }
  }, [medplum, projectDetails]);

  if (!schemaLoaded || !secrets) {
    return <div>Loading...</div>;
  }

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        medplum
          .post(`admin/projects/${projectId}/secrets`, secrets)
          .then(() => medplum.get(`admin/projects/${projectId}`, { cache: 'reload' }))
          .then(() => showNotification({ color: 'green', message: 'Saved' }))
          .catch(console.log);
      }}
    >
      <Title>Project Secrets</Title>
      <p>Use project secrets to store sensitive information such as API keys or other access credentials.</p>
      <ResourcePropertyInput
        property={getElementDefinition('Proejct', 'secret') as ElementDefinition}
        name="secret"
        defaultValue={secrets}
        onChange={setSecrets}
      />
      <Button type="submit">Save</Button>
    </form>
  );
}
