import { lazy, ContentType, createReference } from '@medplum/core';
import { Organization, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';

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
      contentType: ContentType.PNG,
      url: 'https://www.medplum.com/img/cdc-femaledoc.png',
    },
  ],
};

export const DrAliceSmithPreviousVersion: Practitioner = {
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
};

export const DrAliceSmithSchedule: Schedule = {
  resourceType: 'Schedule',
  id: 'alice-smith-schedule',
  actor: [
    {
      reference: 'Practitioner/123',
      display: 'Dr. Alice Smith',
    },
  ],
};

export const makeDrAliceSmithSlots = lazy((): Slot[] => {
  const schedule = createReference(DrAliceSmithSchedule);
  const result: Slot[] = [];
  const slotDate = new Date();
  for (let day = 0; day < 60; day++) {
    for (const hour of [9, 10, 11, 13, 14, 15]) {
      slotDate.setHours(hour, 0, 0, 0);
      result.push({
        resourceType: 'Slot',
        id: `slot-${day}-${hour}`,
        status: 'free',
        start: slotDate.toISOString(),
        end: new Date(slotDate.getTime() + 60 * 60 * 1000).toISOString(),
        schedule,
      });
    }
    slotDate.setDate(slotDate.getDate() + 1);
  }
  return result;
});
