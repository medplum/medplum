// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import { AccessPolicy, UserConfiguration, ValueSet } from '@medplum/fhirtypes';

export const ExampleAccessPolicy: WithId<AccessPolicy> = {
  resourceType: 'AccessPolicy',
  id: '123',
  name: 'Example Access Policy',
};

export const ExampleStatusValueSet: WithId<ValueSet> = {
  resourceType: 'ValueSet',
  id: 'example-statuses',
  status: 'active',
  compose: {
    include: [
      {
        concept: [
          { code: 'ORDERED' },
          { code: 'SENT_TO_CUSTOMER' },
          { code: 'SENT_BACK_TO_LAB' },
          { code: 'LAB_PROCESSED' },
          { code: 'LAB_COMPLETE' },
        ],
      },
    ],
  },
};

export const ExampleUserConfiguration: WithId<UserConfiguration> = {
  resourceType: 'UserConfiguration',
  id: '123',
  name: 'Example User Configuration',
  option: [
    {
      id: 'statusValueSet',
      valueString: 'ValueSet/example-statuses',
    },
  ],
};
