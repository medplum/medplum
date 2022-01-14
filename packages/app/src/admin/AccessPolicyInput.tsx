import { createReference } from '@medplum/core';
import { AccessPolicy, Reference } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/ui';
import React from 'react';

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
        if (newValue && 'resourceType' in newValue) {
          props.onChange(createReference(newValue));
        } else {
          props.onChange(undefined);
        }
      }}
    />
  );
}
