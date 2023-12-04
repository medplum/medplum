import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, ResourceForm } from '@medplum/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateResource } from './useCreateResource';

export function FormCreatePage(): JSX.Element {
  const { resourceType } = useParams();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { defaultValue, handleSubmit } = useCreateResource(resourceType, setOutcome);

  return (
    <Document>
      <ResourceForm defaultValue={defaultValue} onSubmit={handleSubmit} outcome={outcome} />
    </Document>
  );
}
