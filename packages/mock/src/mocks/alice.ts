import { Bundle, Organization, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';

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
  photo: [
    {
      contentType: 'image/png',
      url: 'https://docs.medplum.com/img/cdc-femaledoc.png',
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

export const DrAliceSmithSchedule: Schedule = {
  resourceType: 'Schedule',
  id: '123',
  actor: [
    {
      reference: 'Practitioner/123',
      display: 'Dr. Alice Smith',
    },
  ],
};

export const DrAliceSmithSlots: Bundle<Slot> = {
  resourceType: 'Bundle',
  type: 'searchset',
  entry: [
    {
      resource: {
        resourceType: 'Slot',
        start: (() => {
          // Generate start time for "15th of next month"
          // Add a slot on the 15th of next month
          const startTime = new Date();
          startTime.setMonth(startTime.getMonth() + 1);
          startTime.setDate(15);
          startTime.setHours(12, 0, 0, 0);
          return startTime.toISOString();
        })(),
      },
    },
  ],
};
