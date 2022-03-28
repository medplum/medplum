import { AccessPolicy, UserConfiguration } from '@medplum/fhirtypes';

export const ExampleAccessPolicy: AccessPolicy = {
  resourceType: 'AccessPolicy',
  id: '123',
  name: 'Example Access Policy',
};

export const ExampleUserConfiguration: UserConfiguration = {
  resourceType: 'UserConfiguration',
  id: '123',
  name: 'Example User Configuration',
};
