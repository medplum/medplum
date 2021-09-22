import { OperationOutcomeError, Resource } from '@medplum/core';
import { Document, ResourceForm, useMedplum } from '@medplum/ui';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';

export function CreateResourcePage() {
  const { resourceType } = useParams<{ resourceType: string }>();
  const medplum = useMedplum();
  const [error, setError] = useState<OperationOutcomeError | undefined>();

  return (
    <>
      <div style={{
        backgroundColor: 'white',
        borderBottom: '2px solid #eee',
        color: '#444',
        fontWeight: 'bold',
        padding: '15px 30px',
      }}>
        New&nbsp;{resourceType}
      </div>
      <Document>
        <ResourceForm
          defaultValue={{ resourceType } as Resource}
          onSubmit={(formData: Resource) => {
            setError(undefined);
            medplum.create(formData)
              .then(result => history.push('/' + result.resourceType + '/' + result.id))
              .catch(setError);
          }}
          outcome={(error as OperationOutcomeError | undefined)?.outcome}
        />
      </Document>
    </>
  );
}
