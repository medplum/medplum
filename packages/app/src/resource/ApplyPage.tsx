import { PlanDefinition, ResourceType } from '@medplum/fhirtypes';
import { Document, useResource } from '@medplum/react';
import { useParams } from 'react-router-dom';
import { PlanDefinitionApplyForm } from './PlanDefinitionApplyForm';

export function ApplyPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <PlanDefinitionApplyForm planDefinition={resource as PlanDefinition} />
    </Document>
  );
}
