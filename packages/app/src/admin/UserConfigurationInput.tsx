import { createReference } from '@medplum/core';
import { Reference, UserConfiguration } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/ui';
import React from 'react';

export interface UserConfigurationInputProps {
  readonly name: string;
  readonly defaultValue?: UserConfiguration | Reference<UserConfiguration>;
  readonly onChange: (value: Reference<UserConfiguration> | undefined) => void;
}

export function UserConfigurationInput(props: UserConfigurationInputProps): JSX.Element {
  return (
    <ResourceInput
      resourceType="UserConfiguration"
      name="userConfiguration"
      defaultValue={props.defaultValue}
      placeholder="User Configuration"
      onChange={(newValue) => {
        if (newValue && 'resourceType' in newValue) {
          props.onChange(createReference(newValue));
        } else {
          props.onChange(undefined);
        }
      }}
    />
  );
}
