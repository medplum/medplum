import { createReference, isResource } from '@medplum/core';
import { AccessPolicy, Reference } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';

export interface AccessPolicyInputProps {
  readonly name: string;
  readonly defaultValue?: AccessPolicy | Reference<AccessPolicy>;
  readonly onChange: (value: Reference<AccessPolicy> | undefined) => void;
}

export function AccessPolicyInput(props: AccessPolicyInputProps): JSX.Element {
  return (
    <ResourceInput
      resourceType="AccessPolicy"
      name="accessPolicy"
      defaultValue={props.defaultValue}
      placeholder="Access Policy"
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
