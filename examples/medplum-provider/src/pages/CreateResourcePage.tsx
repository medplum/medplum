import { Paper, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function CreateResourcePage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { resourceType } = useParams() as { resourceType: ResourceType };
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const defaultValue = { resourceType } as Partial<Resource>;

  const handleSubmit = (newResource: Resource): void => {
    if (setOutcome) {
      setOutcome(undefined);
    }
    medplum
      .createResource(newResource)
      .then((result) => navigate('/' + result.resourceType + '/' + result.id))
      .catch((err) => {
        if (setOutcome) {
          setOutcome(normalizeOperationOutcome(err));
        }
        showNotification({
          color: 'red',
          message: normalizeErrorString(err),
          autoClose: false,
          styles: { description: { whiteSpace: 'pre-line' } },
        });
      });
  };

  return (
    <>
      <Paper>
        <Text p="md" fw={500}>
          New&nbsp;{resourceType}
        </Text>
      </Paper>
      <Document>
        <ResourceForm defaultValue={defaultValue} onSubmit={handleSubmit} outcome={outcome} />
      </Document>
    </>
  );
}
