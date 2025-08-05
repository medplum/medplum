// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, isResource } from '@medplum/core';
import { Reference, UserConfiguration } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';
import { JSX } from 'react';

export interface UserConfigurationInputProps {
  readonly name: string;
  readonly defaultValue?: UserConfiguration | Reference<UserConfiguration>;
  readonly onChange: (value: Reference<UserConfiguration> | undefined) => void;
}

export function UserConfigurationInput(props: UserConfigurationInputProps): JSX.Element {
  return (
    <ResourceInput
      resourceType="UserConfiguration"
      name={props.name}
      defaultValue={props.defaultValue}
      placeholder="User Configuration"
      onChange={(newValue) => {
        if (isResource(newValue)) {
          props.onChange(createReference(newValue));
        } else {
          props.onChange(undefined);
        }
      }}
    />
  );
}
