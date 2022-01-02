import { AccessPolicy, ElementDefinition, Reference } from '@medplum/fhirtypes';
import { ReferenceInput } from '@medplum/ui';
import React from 'react';

const accessPolicyProperty: ElementDefinition = {
  min: 0,
  max: '1',
  type: [
    {
      code: 'Reference',
      targetProfile: ['https://medplum.com/fhir/StructureDefinition/AccessPolicy'],
    },
  ],
};

export interface AccessPolicyInputProps {
  readonly name: string;
  readonly defaultValue?: Reference<AccessPolicy>;
}

export function AccessPolicyInput(props: AccessPolicyInputProps): JSX.Element {
  return <ReferenceInput name="accessPolicy" property={accessPolicyProperty} defaultValue={props.defaultValue} />;
}
