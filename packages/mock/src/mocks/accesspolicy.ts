import { AccessPolicy, Bundle } from '@medplum/fhirtypes';

export const ExampleAccessPolicy: AccessPolicy = {
  resourceType: 'AccessPolicy',
  id: '123',
  name: 'Example Access Policy',
};

export const ExampleAccessPolicySearchBundle: Bundle<AccessPolicy> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      resource: ExampleAccessPolicy,
    },
  ],
};
