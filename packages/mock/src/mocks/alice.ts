// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, lazy } from '@medplum/core';
import type { Organization, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { MOCK_ALICE_PRACTITIONER_ID, MOCK_TEST_ORGANIZATION_ID } from '../constants';

export const TestOrganization: WithId<Organization> = {
  resourceType: 'Organization',
  id: MOCK_TEST_ORGANIZATION_ID,
  meta: {
    versionId: '1',
  },
  name: 'Test Organization',
};

export const DifferentOrganization: WithId<Organization> = {
  resourceType: 'Organization',
  id: '456',
  meta: {
    versionId: '1',
  },
  name: 'Different',
};

export const DrAliceSmith: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: MOCK_ALICE_PRACTITIONER_ID,
  meta: {
    versionId: '2',
    lastUpdated: '2021-01-02T12:00:00Z',
    author: {
      reference: `Practitioner/${MOCK_ALICE_PRACTITIONER_ID}`,
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

export const DrAliceSmithPreviousVersion: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: MOCK_ALICE_PRACTITIONER_ID,
  meta: {
    versionId: '1',
    lastUpdated: '2021-01-01T12:00:00Z',
    author: {
      reference: `Practitioner/${MOCK_ALICE_PRACTITIONER_ID}`,
    },
  },
  name: [{ given: ['Medplum'], family: 'Admin' }],
};

export const DrAliceSmithSchedule: WithId<Schedule> = {
  resourceType: 'Schedule',
  id: 'alice-smith-schedule',
  actor: [
    {
      reference: `Practitioner/${MOCK_ALICE_PRACTITIONER_ID}`,
      display: 'Dr. Alice Smith',
    },
  ],
};

export const makeDrAliceSmithSlots = lazy((): WithId<Slot>[] => {
  const schedule = createReference(DrAliceSmithSchedule);
  const result: (Slot & { id: string })[] = [];
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
