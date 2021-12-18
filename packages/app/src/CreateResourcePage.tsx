import { OperationOutcomeError } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, TitleBar, useMedplum } from '@medplum/ui';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function CreateResourcePage() {
  const navigate = useNavigate();
  const { resourceType } = useParams();
  const medplum = useMedplum();
  const [error, setError] = useState<OperationOutcomeError | undefined>();

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
              .create(formData)
              .then((result) => navigate('/' + result.resourceType + '/' + result.id))
              .catch(setError);
          }}
          outcome={error?.outcome}
        />
      </Document>
    </>
  );
}
