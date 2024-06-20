import { Alert } from '@mantine/core';
import { InternalTypeSchema, addProfileToResource, normalizeErrorString, tryGetProfile } from '@medplum/core';
import { Loading, ResourceForm, ResourceFormProps, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Resource } from '@medplum/fhirtypes';

interface ResourceFormWithRequiredProfileProps extends ResourceFormProps {
  /** (optional) If specified, an error is shown in place of `ResourceForm` if the profile cannot be loaded.  */
  readonly profileUrl?: string; // Also part of ResourceFormProps, but list here incase its type changes in the future
  /** (optiona) A short error message to show if `profileUrl` cannot be found. */
  readonly missingProfileMessage?: ReactNode;
}

export function ResourceFormWithRequiredProfile(props: ResourceFormWithRequiredProfileProps): JSX.Element {
  const { missingProfileMessage, onSubmit, ...resourceFormProps } = props;
  const profileUrl = props.profileUrl;

  const medplum = useMedplum();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<any>();
  const [profile, setProfile] = useState<InternalTypeSchema>();

  useEffect(() => {
    if (!profileUrl) {
      return;
    }

    medplum
      .requestProfileSchema(profileUrl, { expandProfile: true })
      .finally(() => setLoadingProfile(false))
      .then(() => {
        const resourceProfile = tryGetProfile(profileUrl);
        if (resourceProfile) {
          setProfile(resourceProfile);
        }
      })
      .catch((reason) => {
        console.error(reason);
        setProfileError(reason);
      });
  }, [medplum, profileUrl]);

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      if (!onSubmit) {
        return;
      }
      if (profileUrl) {
        addProfileToResource(newResource, profileUrl);
      }
      onSubmit(newResource);
    },
    [onSubmit, profileUrl]
  );

  if (profileUrl && loadingProfile) {
    return <Loading />;
  }

  if (profileUrl && !profile) {
    const errorContent = (
      <>
        {missingProfileMessage && <p>{missingProfileMessage}</p>}
        {profileError && <p>Server error: {normalizeErrorString(profileError)}</p>}
      </>
    );

    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Not found" color="red">
        {errorContent}
      </Alert>
    );
  }

  return <ResourceForm onSubmit={handleSubmit} {...resourceFormProps} />;
}
