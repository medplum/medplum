// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Text } from '@mantine/core';
import {
  addProfileToResource,
  isNotFound,
  normalizeErrorString,
  normalizeOperationOutcome,
  tryGetProfile,
} from '@medplum/core';
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
  const [profileError, setProfileError] = useState<unknown>();
  const [profileMissing, setProfileMissing] = useState(false);

  useEffect(() => {
    if (!profileUrl) {
      return;
    }

    medplum
      .requestProfileSchema(profileUrl, { expandProfile: true })
      .finally(() => setLoadingProfile(false))
      .then(() => {
        // The request succeeded but no such profile is installed in this project.
        if (!tryGetProfile(profileUrl)) {
          setProfileMissing(true);
        }
      })
      .catch((reason) => {
        // Only a genuine "not found" means the profile is absent. Any other failure (500,
        // timeout, network blip) is likely transient, so surface the real error instead of
        // steering an admin toward installing a profile that may already be present.
        if (isNotFound(normalizeOperationOutcome(reason))) {
          setProfileMissing(true);
        } else {
          console.error(reason);
          setProfileError(reason);
        }
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

  // A failed profile request is surfaced as-is (it may be transient) rather than being mistaken
  // for a missing profile. The technical error is also logged above for engineers.
  if (profileUrl && profileError) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error loading profile" color="red">
        <Text>Server error: {normalizeErrorString(profileError)}</Text>
      </Alert>
    );
  }

  if (profileUrl && profileMissing) {
    // A caller-supplied message controls its own presentation and is rendered as-is. Callers that
    // pass no message fall back to a generic notice (unchanged behavior for the edit pages).
    if (missingProfileMessage) {
      return <>{missingProfileMessage}</>;
    }
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Not found" color="red">
        <Text>The required profile is not installed: {profileUrl}</Text>
      </Alert>
    );
  }

  return <ResourceForm onSubmit={handleSubmit} {...resourceFormProps} />;
}
