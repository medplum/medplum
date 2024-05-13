import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { ResourceFormWithRequiredProfile } from '../components/ResourceFormWithRequiredProfile';
import { RESOURCE_PROFILE_URLS } from './resource/utils';
import { showNotification } from '@mantine/notifications';
import { normalizeOperationOutcome, normalizeErrorString, addProfileToResource } from '@medplum/core';
import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function OnboardingPage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const defaultValue = useMemo<Resource>(() => ({ resourceType: 'Patient' }), []);

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      if (RESOURCE_PROFILE_URLS.Patient) {
        addProfileToResource(newResource, RESOURCE_PROFILE_URLS.Patient);
      }
      medplum
        .createResource(newResource)
        .then((newPatient) => {
          navigate(`/Patient/${newPatient.id}/timeline`);
        })
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
    },
    [medplum, navigate]
  );

  return (
    <Document>
      <ResourceFormWithRequiredProfile
        defaultValue={defaultValue}
        onSubmit={handleSubmit}
        outcome={outcome}
        profileUrl={RESOURCE_PROFILE_URLS.Patient}
      />
    </Document>
  );
}
