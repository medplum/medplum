import { createReference, isResource } from '@medplum/core';
import { Reference, UserConfiguration } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';

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
        if (isResource(newValue)) {
          props.onChange(createReference(newValue));
        } else {
          props.onChange(undefined);
        }
      }}
    />
  );
}
