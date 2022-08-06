import { DescriptionList, DescriptionListEntry, useMedplum } from '@medplum/react';
import React from 'react';
import { getProjectId } from '../utils';

export function ProjectDetailsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = medplum.get(`admin/projects/${projectId}`).read();

  return (
    <>
      <h1>Details</h1>
      <DescriptionList>
        <DescriptionListEntry term="ID">{result.project.id}</DescriptionListEntry>
        <DescriptionListEntry term="Name">{result.project.name}</DescriptionListEntry>
        <DescriptionListEntry term="Members">{result.members?.length}</DescriptionListEntry>
      </DescriptionList>
    </>
  );
}
