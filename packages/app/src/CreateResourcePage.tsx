import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, TitleBar, useMedplum } from '@medplum/react';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function CreateResourcePage(): JSX.Element {
  const navigate = useNavigate();
  const { resourceType } = useParams();
  const medplum = useMedplum();
  const [error, setError] = useState<OperationOutcome | undefined>();

  return (
    <>
      <TitleBar>
        <h1>New&nbsp;{resourceType}</h1>
      </TitleBar>
      <Document>
        <ResourceForm
          defaultValue={{ resourceType } as Resource}
          onSubmit={(formData: Resource) => {
            setError(undefined);
            medplum
              .createResource(formData)
              .then((result) => navigate('/' + result.resourceType + '/' + result.id))
              .catch(setError);
          }}
          outcome={error}
        />
      </Document>
    </>
  );
}
