// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Text } from '@mantine/core';
import type { InternalTypeSchema } from '@medplum/core';
import { addProfileToResource, normalizeErrorString, tryGetProfile } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import type { ResourceFormProps } from '@medplum/react';
import { Loading, ResourceForm, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

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
    // A caller-supplied message controls its own presentation and is rendered as-is. Callers that
    // pass no message fall back to the raw server error in an alert (unchanged behavior for the edit
    // pages). The technical error is also logged above for engineers.
    if (missingProfileMessage) {
      return <>{missingProfileMessage}</>;
    }
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Not found" color="red">
        {profileError && <Text>Server error: {normalizeErrorString(profileError)}</Text>}
      </Alert>
    );
  }

  return <ResourceForm onSubmit={handleSubmit} {...resourceFormProps} />;
}
