import { Title } from '@mantine/core';
import { DescriptionList, DescriptionListEntry, useMedplum } from '@medplum/react';
import { getProjectId } from '../utils';

export function ProjectDetailsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = medplum.get(`admin/projects/${projectId}`).read();

  return (
    <>
      <Title>Details</Title>
      <DescriptionList>
        <DescriptionListEntry term="ID">{result.project.id}</DescriptionListEntry>
        <DescriptionListEntry term="Name">{result.project.name}</DescriptionListEntry>
      </DescriptionList>
    </>
  );
}
