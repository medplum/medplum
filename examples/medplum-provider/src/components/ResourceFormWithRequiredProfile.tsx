import { Alert } from '@mantine/core';
import { InternalTypeSchema, normalizeErrorString, tryGetProfile } from '@medplum/core';
import { Loading, ResourceForm, ResourceFormProps, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { ReactNode, useEffect, useState } from 'react';

interface ResourceFormWithRequiredProfileProps extends ResourceFormProps {
  missingProfileMessage?: ReactNode;
}

export function ResourceFormWithRequiredProfile(props: ResourceFormWithRequiredProfileProps): JSX.Element {
  const { missingProfileMessage, ...resourceFormProps } = props;
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

  return <ResourceForm {...resourceFormProps} />;
}
