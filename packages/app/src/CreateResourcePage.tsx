import { OperationOutcomeError, Resource } from '@medplum/core';
import { Document, ResourceForm, TitleBar, useMedplum } from '@medplum/ui';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';

export function CreateResourcePage() {
  const { resourceType } = useParams<{ resourceType: string }>();
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
            medplum.create(formData)
              .then(result => history.push('/' + result.resourceType + '/' + result.id))
              .catch(setError);
          }}
          outcome={error?.outcome}
        />
      </Document>
    </>
  );
}
