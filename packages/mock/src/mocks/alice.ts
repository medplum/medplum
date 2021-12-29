import { Bundle, Organization, Practitioner } from '@medplum/fhirtypes';

export const TestOrganization: Organization = {
  resourceType: 'Organization',
  id: '123',
  meta: {
    versionId: '1',
  },
  name: 'Test Organization',
};

export const DifferentOrganization: Organization = {
  resourceType: 'Organization',
  id: '456',
  meta: {
    versionId: '1',
  },
  name: 'Different',
};

export const OrganizationSearchBundle: Bundle<Organization> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      resource: DifferentOrganization,
    },
  ],
};

export const DrAliceSmith: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  meta: {
    versionId: '2',
    lastUpdated: '2021-01-02T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  name: [
    {
      given: ['Alice'],
      family: 'Smith',
    },
  ],
};

export const DrAliceSmithHistoryBundle: Bundle<Practitioner> = {
  resourceType: 'Bundle',
  type: 'history',
  entry: [
    {
      resource: DrAliceSmith,
    },
    {
      resource: {
        resourceType: 'Practitioner',
        id: '123',
        meta: {
          versionId: '1',
          lastUpdated: '2021-01-01T12:00:00Z',
          author: {
            reference: 'Practitioner/123',
          },
        },
        name: [{ given: ['Medplum'], family: 'Admin' }],
      },
    },
  ],
};
