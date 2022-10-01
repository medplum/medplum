import { Button } from '@mantine/core';
import { IndexedStructureDefinition } from '@medplum/core';
import { ProjectSecret } from '@medplum/fhirtypes';
import { ResourcePropertyInput, useMedplum } from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getProjectId } from '../utils';

export function SecretsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const projectDetails = medplum.get(`admin/projects/${projectId}`).read();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [secrets, setSecrets] = useState<ProjectSecret[] | undefined>();

  useEffect(() => {
    medplum.requestSchema('Project').then(setSchema).catch(console.log);
  }, [medplum]);

  useEffect(() => {
    if (projectDetails) {
      setSecrets(JSON.parse(JSON.stringify(projectDetails.project.secret || [])));
    }
  }, [medplum, projectDetails]);

  if (!schema || !secrets) {
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
          .then(() => toast.success('Saved'))
          .catch(console.log);
      }}
    >
      <h1>Project Secrets</h1>
      <p>Use project secrets to store sensitive information such as API keys or other access credentials.</p>
      <ResourcePropertyInput
        property={schema.types['Project'].properties['secret']}
        name="secret"
        defaultValue={secrets}
        onChange={setSecrets}
      />
      <Button type="submit">Save</Button>
    </form>
  );
}
