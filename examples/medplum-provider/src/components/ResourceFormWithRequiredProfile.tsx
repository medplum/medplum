// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Text } from '@mantine/core';
import {
  addProfileToResource,
  getStatus,
  normalizeErrorString,
  OperationOutcomeError,
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

type ProfileResult =
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'missing' }
  | { readonly status: 'error'; readonly error: unknown };

const LOADING: ProfileResult = { status: 'loading' };

/**
 * Returns true if a failed profile schema request means the profile is absent rather than
 * temporarily unreachable. `StructureDefinition/$expand-profile` reports an uninstalled profile as
 * a 400, so both 400 and 404 count as missing. Anything else — a 5xx, or a bare `Error` from a
 * network blip — is treated as transient and surfaced as a real error, so an admin is never
 * steered toward installing a profile that is already present.
 * @param reason - The error thrown by `requestProfileSchema`.
 * @returns True when the profile is definitively absent.
 */
function isProfileMissingError(reason: unknown): boolean {
  if (!(reason instanceof OperationOutcomeError)) {
    return false;
  }
  const status = getStatus(reason.outcome);
  return status === 400 || status === 404;
}

export function ResourceFormWithRequiredProfile(props: ResourceFormWithRequiredProfileProps): JSX.Element {
  const { missingProfileMessage, onSubmit, ...resourceFormProps } = props;
  const profileUrl = props.profileUrl;

  const medplum = useMedplum();
  const [state, setState] = useState<{ profileUrl: string | undefined; result: ProfileResult }>({
    profileUrl,
    result: LOADING,
  });
  // A verdict only describes the profile it was fetched for, so a change of `profileUrl` puts us
  // back into loading until the new probe settles.
  const result = state.profileUrl === profileUrl ? state.result : LOADING;

  useEffect(() => {
    if (!profileUrl) {
      return undefined;
    }

    let cancelled = false;
    medplum
      .requestProfileSchema(profileUrl, { expandProfile: true })
      .then(() => {
        if (!cancelled) {
          // The request succeeded, but the profile may still not be installed in this project.
          setState({ profileUrl, result: tryGetProfile(profileUrl) ? { status: 'ready' } : { status: 'missing' } });
        }
      })
      .catch((reason) => {
        if (cancelled) {
          return;
        }
        if (isProfileMissingError(reason)) {
          setState({ profileUrl, result: { status: 'missing' } });
        } else {
          console.error(reason);
          setState({ profileUrl, result: { status: 'error', error: reason } });
        }
      });

    return () => {
      cancelled = true;
    };
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

  if (profileUrl && result.status === 'loading') {
    return <Loading />;
  }

  // A failed profile request is surfaced as-is (it may be transient) rather than being mistaken
  // for a missing profile. The technical error is also logged above for engineers.
  if (profileUrl && result.status === 'error') {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error loading profile" color="red">
        <Text>Server error: {normalizeErrorString(result.error)}</Text>
      </Alert>
    );
  }

  if (profileUrl && result.status === 'missing') {
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
