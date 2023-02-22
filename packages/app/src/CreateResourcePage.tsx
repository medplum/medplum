import { Paper, Text } from '@mantine/core';
import { normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function CreateResourcePage(): JSX.Element {
  const navigate = useNavigate();
  const { resourceType } = useParams();
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();

  return (
    <>
      <Paper p="xl" shadow="xs" radius={0}>
        <Text weight={500}>New&nbsp;{resourceType}</Text>
      </Paper>
      <Document>
        <ResourceForm
          defaultValue={{ resourceType } as Resource}
          onSubmit={(formData: Resource) => {
            setOutcome(undefined);
            medplum
              .createResource(formData)
              .then((result) => navigate('/' + result.resourceType + '/' + result.id))
              .catch((err) => setOutcome(normalizeOperationOutcome(err)));
          }}
          outcome={outcome}
        />
      </Document>
    </>
  );
}
