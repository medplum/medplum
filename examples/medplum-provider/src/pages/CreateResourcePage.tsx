import { Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePatient } from '../hooks/usePatient';
import { prependPatientPath } from './patient/PatientPage.utils';

export function CreateResourcePage(): JSX.Element {
  const medplum = useMedplum();
  const patient = usePatient({ ignoreMissingPatientId: true });
  const navigate = useNavigate();
  const { resourceType } = useParams() as { resourceType: ResourceType };
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const defaultValue = { resourceType } as Partial<Resource>;

  const handleSubmit = (newResource: Resource): void => {
    if (outcome) {
      setOutcome(undefined);
    }
    medplum
      .createResource(newResource)
      .then((result) => navigate(prependPatientPath(patient, '/' + result.resourceType + '/' + result.id)))
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
    <Document shadow="xs">
      <Stack>
        <Text fw={500}>New&nbsp;{resourceType}</Text>
        <ResourceForm defaultValue={defaultValue} onSubmit={handleSubmit} outcome={outcome} />
      </Stack>
    </Document>
  );
}
