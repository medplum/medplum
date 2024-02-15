import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function EditTab(): JSX.Element | null {
  const medplum = useMedplum();
  const { patientId } = useParams() as { patientId: string };
  const [value, setValue] = useState<Resource | undefined>();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();

  useEffect(() => {
    medplum
      .readResource('Patient', patientId)
      .then((resource) => setValue(deepClone(resource)))
      .catch((err) => {
        setOutcome(normalizeOperationOutcome(err));
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      });
  }, [medplum, patientId]);

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      medplum
        .updateResource(newResource)
        .then(() => {
          navigate(`/Patient/${patientId}/timeline`);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum, patientId, navigate]
  );

  if (!value) {
    return null;
  }

  return (
    <Document>
      <ResourceForm defaultValue={value} onSubmit={handleSubmit} outcome={outcome} />
    </Document>
  );
}
