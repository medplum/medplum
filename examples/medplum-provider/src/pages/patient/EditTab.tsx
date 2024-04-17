import { showNotification } from '@mantine/notifications';
import {
  InternalTypeSchema,
  deepClone,
  normalizeErrorString,
  normalizeOperationOutcome,
  tryGetProfile,
} from '@medplum/core';
import { OperationOutcome, Resource } from '@medplum/fhirtypes';
import { Document, Loading, ResourceForm, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addProfileToResource, removeProfileFromResource } from '../../utils';
import { Alert, Anchor } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

const PATIENT_PROFILE_URL = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';

export function EditTab(): JSX.Element | null {
  const medplum = useMedplum();
  const { patientId } = useParams() as { patientId: string };
  const [value, setValue] = useState<Resource | undefined>();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<any>();
  const [profile, setProfile] = useState<InternalTypeSchema>();

  useEffect(() => {
    medplum
      .readResource('Patient', patientId)
      .then((resource) => setValue(deepClone(resource)))
      .catch((err) => {
        setOutcome(normalizeOperationOutcome(err));
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      });
  }, [medplum, patientId]);

  useEffect(() => {
    medplum
      .requestProfileSchema(PATIENT_PROFILE_URL, { expandProfile: true })
      .finally(() => setLoadingProfile(false))
      .then(() => {
        const patientProfile = tryGetProfile(PATIENT_PROFILE_URL);
        if (patientProfile) {
          setProfile(patientProfile);
        }
      })
      .catch((reason) => {
        console.error(reason);
        setProfileError(reason);
      });
  }, [medplum]);

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      if (profile) {
        addProfileToResource(newResource, PATIENT_PROFILE_URL);
      } else {
        removeProfileFromResource(newResource, PATIENT_PROFILE_URL);
      }
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
    [profile, medplum, navigate, patientId]
  );

  if (loadingProfile) {
    return <Loading />;
  }

  if (!profile) {
    const errorContent = (
      <>
        <p>
          Could not find the{' '}
          <Anchor href={PATIENT_PROFILE_URL} target="_blank">
            US Core Patient Profile
          </Anchor>
        </p>
        {profileError && <p>Server error: {normalizeErrorString(profileError)}</p>}
      </>
    );

    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Not found" color="red">
        {errorContent}
      </Alert>
    );
  }

  if (!value) {
    return null;
  }

  return (
    <Document>
      <ResourceForm defaultValue={value} onSubmit={handleSubmit} outcome={outcome} profileUrl={PATIENT_PROFILE_URL} />
    </Document>
  );
}
