import { resolveId } from '@medplum/core';
import { RequestGroup, ResourceType } from '@medplum/fhirtypes';
import { Document, RequestGroupDisplay, useResource } from '@medplum/react';
import { useNavigate, useParams } from 'react-router-dom';

export function ChecklistPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const navigate = useNavigate();

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <RequestGroupDisplay
        value={resource as RequestGroup}
        onStart={(_task, taskInput) => navigate(`/forms/${resolveId(taskInput)}`)}
        onEdit={(_task, _taskInput, taskOutput) => navigate(`/${taskOutput.reference}}`)}
      />
    </Document>
  );
}
