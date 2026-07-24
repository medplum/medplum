// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Extension, HealthcareService, HealthcareServiceAvailableTime, Schedule, Slot } from '@medplum/fhirtypes';
import { extractAvailability, SchedulingParametersURI, SchedulingTransientIdentifier } from './scheduling';

describe('SchedulingTransientIdentifier', () => {
  test('set', () => {
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
    };

    SchedulingTransientIdentifier.set(slot);
    expect(slot).toHaveProperty('identifier');
    expect(slot.identifier).toHaveLength(1);
    expect(slot.identifier?.[0]).toHaveProperty('system', 'https://medplum.com/fhir/scheduling-transient-id');
    expect(slot.identifier?.[0]).toHaveProperty('use', 'temp');
    expect(slot.identifier?.[0]).toHaveProperty('value');
    // naive check: does this look like a uuid
    expect(slot.identifier?.[0].value).toMatch(/[-0-9a-f]{36}/);
  });

  test('get on a resource that was not `set` upon returns undefined', () => {
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
    };

    expect(SchedulingTransientIdentifier.get(slot)).toBeUndefined();
  });

  test('get on a resource that was `set` upon returns the ID', () => {
    const id = 'cb103a82-f313-4b22-8918-ed8de4b4143d';
    const slot: Slot = {
      resourceType: 'Slot',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T00:00:00.000Z',
      schedule: { reference: 'Schedule/12345' },
      status: 'busy',
      identifier: [
        {
          system: 'https://medplum.com/fhir/scheduling-transient-id',
          value: id,
          use: 'temp',
        },
      ],
    };

    expect(SchedulingTransientIdentifier.get(slot)).toEqual(id);
  });
});

describe('extractAvailability', () => {
  const SERVICE_ID = 'svc-1';
  const service: WithId<HealthcareService> = {
    resourceType: 'HealthcareService',
    id: SERVICE_ID,
    availableTime: [
      { daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'], availableStartTime: '08:00:00', availableEndTime: '16:00:00' },
    ],
  };

  // Builds a single `availableTime` sub-extension from a HealthcareServiceAvailableTime.
  function availableTimeExtension(availableTime: HealthcareServiceAvailableTime): Extension {
    const extension: Extension[] = (availableTime.daysOfWeek ?? []).map((day) => ({
      url: 'daysOfWeek',
      valueCode: day,
    }));
    if (availableTime.allDay !== undefined) {
      extension.push({ url: 'allDay', valueBoolean: availableTime.allDay });
    }
    if (availableTime.availableStartTime !== undefined) {
      extension.push({ url: 'availableStartTime', valueTime: availableTime.availableStartTime });
    }
    if (availableTime.availableEndTime !== undefined) {
      extension.push({ url: 'availableEndTime', valueTime: availableTime.availableEndTime });
    }
    return { url: 'availableTime', extension };
  }

  // Builds a Schedule carrying a SchedulingParameters extension for the given service,
  // with the provided `availableTime` entries nested under a single `availability`.
  function scheduleWithAvailability(serviceRef: string, availableTimeExtensions: Extension[]): Schedule {
    return {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/prac-1' }],
      extension: [
        {
          url: SchedulingParametersURI,
          extension: [
            { url: 'service', valueReference: { reference: serviceRef } },
            { url: 'availability', extension: availableTimeExtensions },
          ],
        },
      ],
    };
  }

  test('returns the service availableTime when the schedule has no SchedulingParameters extension', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/prac-1' }],
    };
    expect(extractAvailability(service, schedule)).toEqual(service.availableTime);
  });

  test('returns the service availableTime when the schedule parameters target a different service', () => {
    const schedule = scheduleWithAvailability('HealthcareService/some-other-service', [
      availableTimeExtension({ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '10:00:00' }),
    ]);
    expect(extractAvailability(service, schedule)).toEqual(service.availableTime);
  });

  test('returns the service availableTime when the matching parameters have no availability sub-extension', () => {
    const schedule: Schedule = {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/prac-1' }],
      extension: [
        {
          url: SchedulingParametersURI,
          extension: [{ url: 'service', valueReference: { reference: `HealthcareService/${SERVICE_ID}` } }],
        },
      ],
    };
    expect(extractAvailability(service, schedule)).toEqual(service.availableTime);
  });

  test('returns the override with a start/end time when present', () => {
    const schedule = scheduleWithAvailability(`HealthcareService/${SERVICE_ID}`, [
      availableTimeExtension({
        daysOfWeek: ['mon', 'wed'],
        availableStartTime: '09:00:00',
        availableEndTime: '17:00:00',
      }),
    ]);
    expect(extractAvailability(service, schedule)).toEqual([
      { daysOfWeek: ['mon', 'wed'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('returns the override with allDay when present', () => {
    const schedule = scheduleWithAvailability(`HealthcareService/${SERVICE_ID}`, [
      availableTimeExtension({ daysOfWeek: ['sat', 'sun'], allDay: true }),
    ]);
    expect(extractAvailability(service, schedule)).toEqual([{ daysOfWeek: ['sat', 'sun'], allDay: true }]);
  });

  test('uses start/end time when allDay is false', () => {
    const schedule = scheduleWithAvailability(`HealthcareService/${SERVICE_ID}`, [
      availableTimeExtension({
        daysOfWeek: ['mon'],
        allDay: false,
        availableStartTime: '09:00:00',
        availableEndTime: '17:00:00',
      }),
    ]);
    expect(extractAvailability(service, schedule)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('returns multiple availableTime overrides', () => {
    const schedule = scheduleWithAvailability(`HealthcareService/${SERVICE_ID}`, [
      availableTimeExtension({ daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' }),
      availableTimeExtension({ daysOfWeek: ['tue'], allDay: true }),
    ]);
    expect(extractAvailability(service, schedule)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['tue'], allDay: true },
    ]);
  });

  test('filters out invalid daysOfWeek codes', () => {
    const schedule = scheduleWithAvailability(`HealthcareService/${SERVICE_ID}`, [
      {
        url: 'availableTime',
        extension: [
          { url: 'daysOfWeek', valueCode: 'mon' },
          { url: 'daysOfWeek', valueCode: 'funday' },
          { url: 'daysOfWeek', valueCode: 'fri' },
          { url: 'availableStartTime', valueTime: '09:00:00' },
          { url: 'availableEndTime', valueTime: '17:00:00' },
        ],
      },
    ]);
    expect(extractAvailability(service, schedule)).toEqual([
      { daysOfWeek: ['mon', 'fri'], availableStartTime: '09:00:00', availableEndTime: '17:00:00' },
    ]);
  });

  test('finds availableTime across multiple SchedulingParameters extensions', () => {
    const serviceRef = `HealthcareService/${SERVICE_ID}`;
    const schedule: Schedule = {
      resourceType: 'Schedule',
      actor: [{ reference: 'Practitioner/prac-1' }],
      extension: [
        {
          url: SchedulingParametersURI,
          extension: [
            { url: 'service', valueReference: { reference: serviceRef } },
            {
              url: 'availability',
              extension: [
                availableTimeExtension({
                  daysOfWeek: ['mon'],
                  availableStartTime: '09:00:00',
                  availableEndTime: '10:00:00',
                }),
              ],
            },
            {
              url: 'availability',
              extension: [availableTimeExtension({ daysOfWeek: ['tue'], allDay: true })],
            },
          ],
        },
        {
          url: SchedulingParametersURI,
          extension: [
            { url: 'service', valueReference: { reference: serviceRef } },
            {
              url: 'availability',
              extension: [
                availableTimeExtension({
                  daysOfWeek: ['wed'],
                  availableStartTime: '11:00:00',
                  availableEndTime: '12:00:00',
                }),
              ],
            },
            {
              url: 'availability',
              extension: [availableTimeExtension({ daysOfWeek: ['thu'], allDay: true })],
            },
          ],
        },
      ],
    };
    expect(extractAvailability(service, schedule)).toEqual([
      { daysOfWeek: ['mon'], availableStartTime: '09:00:00', availableEndTime: '10:00:00' },
      { daysOfWeek: ['tue'], allDay: true },
      { daysOfWeek: ['wed'], availableStartTime: '11:00:00', availableEndTime: '12:00:00' },
      { daysOfWeek: ['thu'], allDay: true },
    ]);
  });
});
