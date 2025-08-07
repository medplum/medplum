// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicyInteraction, satisfiedAccessPolicy, tryGetProfile } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { JSX, useEffect, useMemo, useState } from 'react';
import { BackboneElementDisplay } from '../BackboneElementDisplay/BackboneElementDisplay';

export interface ResourceTableProps {
  /**
   * The input value either as a resource or a reference.
   */
  readonly value: Resource | Reference;

  /**
   * Optional flag to ignore missing values.
   * By default, missing values are displayed as empty strings.
   */
  readonly ignoreMissingValues?: boolean;

  /**
   * Optional flag to force use the input value.
   * This is useful when you want to display a specific version of the resource,
   * and not use the latest version.
   */
  readonly forceUseInput?: boolean;

  /** (optional) URL of the resource profile used to display the form. */
  readonly profileUrl?: string;
}

export function ResourceTable(props: ResourceTableProps): JSX.Element | null {
  const { profileUrl } = props;
  const medplum = useMedplum();
  const accessPolicy = medplum.getAccessPolicy();
  const value = useResource(props.value);
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  useEffect(() => {
    if (!value) {
      return;
    }

    if (profileUrl) {
      medplum
        .requestProfileSchema(profileUrl, { expandProfile: true })
        .then(() => {
          const profile = tryGetProfile(profileUrl);
          if (profile) {
            setSchemaLoaded(true);
          } else {
            console.error(`Schema not found for ${profileUrl}`);
          }
        })
        .catch((reason) => {
          console.error('Error in requestProfileSchema', reason);
        });
    } else {
      const schemaName = value.resourceType;
      medplum
        .requestSchema(schemaName)
        .then(() => {
          setSchemaLoaded(true);
        })
        .catch(console.error);
    }
  }, [medplum, profileUrl, value]);

  const accessPolicyResource = useMemo(() => {
    return value && satisfiedAccessPolicy(value, AccessPolicyInteraction.READ, accessPolicy);
  }, [accessPolicy, value]);

  if (!schemaLoaded || !value) {
    return null;
  }

  return (
    <BackboneElementDisplay
      path={value.resourceType}
      value={{
        type: value.resourceType,
        value: props.forceUseInput ? props.value : value,
      }}
      profileUrl={profileUrl}
      ignoreMissingValues={props.ignoreMissingValues}
      accessPolicyResource={accessPolicyResource}
    />
  );
}
