import { Anchor } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ResourceFormWithRequiredProfile } from '../../components/ResourceFormWithRequiredProfile';
import { RESOURCE_PROFILE_URLS } from '../resource/utils';

const missingProfileMessage = RESOURCE_PROFILE_URLS.Patient ? (
  <p>
    Could not find the{' '}
    <Anchor href={RESOURCE_PROFILE_URLS.Patient} target="_blank">
      US Core Patient Profile
    </Anchor>
  </p>
) : undefined;

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
    [medplum, navigate, patientId]
  );

  if (!value) {
    return null;
  }

  return (
    <Document>
      <ResourceFormWithRequiredProfile
        missingProfileMessage={missingProfileMessage}
        defaultValue={value}
        onSubmit={handleSubmit}
        outcome={outcome}
        profileUrl={RESOURCE_PROFILE_URLS.Patient}
      />
    </Document>
  );
}
