// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { InternalSchemaElement } from '@medplum/core';
import { deepClone, getElementDefinition } from '@medplum/core';
import type { ProjectSetting } from '@medplum/fhirtypes';
import { ResourcePropertyInput, useMedplum } from '@medplum/react';
import type { FormEvent, JSX } from 'react';
import { useEffect, useState } from 'react';
import { getProjectId } from '../utils';

export function SettingsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const projectDetails = medplum.get(`admin/projects/${projectId}`).read();
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [settings, setSettings] = useState<ProjectSetting[] | undefined>();

  useEffect(() => {
    medplum
      .requestSchema('Project')
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    if (projectDetails) {
      setSettings(deepClone(projectDetails.project.setting || []));
    }
  }, [medplum, projectDetails]);

  if (!schemaLoaded || !settings) {
    return <div>Loading...</div>;
  }

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        medplum
          .post(`admin/projects/${projectId}/settings`, settings)
          .then(() => medplum.get(`admin/projects/${projectId}`, { cache: 'reload' }))
          .then(() => showNotification({ color: 'green', message: 'Saved' }))
          .catch(console.log);
      }}
    >
      <Title>Project Settings</Title>
      <p>
        Use project settings to store non-sensitive configuration visible to all project users. For example, set
        "aiModels" to a JSON array of {`{ "value", "label" }`} objects to control the models available in the Spaces AI
        assistant.
      </p>
      <ResourcePropertyInput
        property={getElementDefinition('Project', 'setting') as InternalSchemaElement}
        name="setting"
        path="Project.setting"
        defaultValue={settings}
        onChange={setSettings}
        outcome={undefined}
      />
      <Button type="submit">Save</Button>
    </form>
  );
}
