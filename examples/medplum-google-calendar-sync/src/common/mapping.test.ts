// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Appointment, HealthcareService, Patient, Slot } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import type { AppointmentEventContext, GoogleCalendarEvent } from './mapping';
import { buildAppointmentEvent, buildSlotEvent, resolveDetailLevel, toGoogleEventId, toInitials } from './mapping';

const PROJECT_ID = '6827292a-013e-4056-a337-18a1be3a7c6b';
const APPOINTMENT_ID = '6f1c2a9e-4b7d-4c0e-9a3b-5d7f1e2c4a6b';
const BUSY_ONLY: AppointmentEventContext = { projectId: PROJECT_ID, level: 'busy-only' };

const jane: Patient = {
  resourceType: 'Patient',
  id: 'p1',
  name: [
    { use: 'nickname', given: ['Janie'] },
    { use: 'official', given: ['Jane', 'Q'], family: 'Smith', prefix: ['Ms.'] },
  ],
  telecom: [
    { system: 'email', value: 'old@example.com', use: 'old' },
    { system: 'email', value: 'Jane.Smith@example.com' },
  ],
};

const marcus: Patient = { resourceType: 'Patient', id: 'p2', name: [{ given: ['Marcus'], family: 'Lee' }] };

const service: HealthcareService = { resourceType: 'HealthcareService', id: 'hs1', name: 'Follow-up visit' };

const booked: Appointment = {
  resourceType: 'Appointment',
  id: APPOINTMENT_ID,
  status: 'booked',
  start: '2026-10-12T16:00:00.000Z',
  end: '2026-10-12T16:30:00.000Z',
  serviceType: [{ text: 'Office Visit', coding: [{ display: 'Office Visit (coded)' }] }],
  reasonCode: [{ text: 'Knee pain' }],
  comment: 'Bring prior imaging',
  participant: [
    { actor: { reference: 'Practitioner/dr-rivera' }, status: 'accepted' },
    { actor: { reference: 'Patient/p1' }, status: 'accepted' },
    { actor: { reference: 'Location/exam-1', display: 'Exam Room 1' }, status: 'accepted' },
  ],
};

const blocked: Slot = {
  resourceType: 'Slot',
  id: 'a152fbf8-aef5-450f-9868-0819bb06a1cd',
  status: 'busy-unavailable',
  schedule: { reference: 'Schedule/x' },
  start: '2026-10-13T00:00:00Z',
  end: '2026-10-14T00:00:00Z',
  comment: 'Therapy, private',
};

function mustBuild(appointment: Appointment, context: AppointmentEventContext): GoogleCalendarEvent {
  const event = buildAppointmentEvent(appointment, context);
  if (!event) {
    throw new Error('Expected an event');
  }
  return event;
}

function summary(
  level: AppointmentEventContext['level'],
  patients: Patient[],
  extra: Partial<Appointment> = {}
): string {
  return mustBuild({ ...booked, ...extra }, { projectId: PROJECT_ID, level, patients, service }).summary;
}

describe('toGoogleEventId', () => {
  test('strips hyphens and lowercases', () => {
    expect(toGoogleEventId(APPOINTMENT_ID)).toBe('6f1c2a9e4b7d4c0e9a3b5d7f1e2c4a6b');
    expect(toGoogleEventId(APPOINTMENT_ID.toUpperCase())).toBe('6f1c2a9e4b7d4c0e9a3b5d7f1e2c4a6b');
  });

  test('ids outside the Google alphabet are unusable', () => {
    expect(toGoogleEventId('appt-2026-w42')).toBeUndefined();
    expect(toGoogleEventId('123')).toBeUndefined();
  });
});

describe('resolveDetailLevel', () => {
  test('defaults to busy-only', () => {
    expect(resolveDetailLevel(undefined, undefined)).toBe('busy-only');
    expect(resolveDetailLevel('nonsense', undefined)).toBe('busy-only');
    expect(resolveDetailLevel('nonsense', 'full')).toBe('busy-only');
  });

  test('a practitioner may only choose a stricter level than the ceiling', () => {
    expect(resolveDetailLevel('full', 'initials')).toBe('initials');
    expect(resolveDetailLevel('initials', 'full')).toBe('initials');
    expect(resolveDetailLevel('full-with-invite', undefined)).toBe('busy-only');
    expect(resolveDetailLevel('full', 'full-with-invite')).toBe('full');
    expect(resolveDetailLevel('full', 'nonsense')).toBe('full');
  });
});

describe('toInitials', () => {
  test('first letters of the first given name and the family name', () => {
    expect(toInitials({ given: ['jane'], family: 'smith' })).toBe('J.S.');
    expect(toInitials({ given: ['Jane'] })).toBe('J.');
    expect(toInitials({ family: 'Smith' })).toBe('S.');
    expect(toInitials({ text: 'Jane Q Smith' })).toBeUndefined();
    expect(toInitials(undefined)).toBeUndefined();
  });
});

describe('summary', () => {
  test('busy-only never reveals anything', () => {
    expect(summary('busy-only', [jane])).toBe('Appointment');
  });

  test('initials uses the official name', () => {
    expect(summary('initials', [jane])).toBe('Appointment · J.S.');
  });

  test('full uses name and service, with fallbacks', () => {
    expect(summary('full', [jane])).toBe('Jane Q Smith · Follow-up visit');
    expect(mustBuild(booked, { projectId: PROJECT_ID, level: 'full', patients: [jane] }).summary).toBe(
      'Jane Q Smith · Office Visit'
    );
    expect(
      mustBuild(
        { ...booked, serviceType: [{ coding: [{ display: 'Coded' }] }] },
        { projectId: PROJECT_ID, level: 'full', patients: [jane] }
      ).summary
    ).toBe('Jane Q Smith · Coded');
    expect(
      mustBuild(
        { ...booked, serviceType: undefined, appointmentType: { text: 'Type' } },
        { projectId: PROJECT_ID, level: 'full', patients: [jane] }
      ).summary
    ).toBe('Jane Q Smith · Type');
    expect(
      mustBuild({ ...booked, serviceType: undefined }, { projectId: PROJECT_ID, level: 'full', patients: [jane] })
        .summary
    ).toBe('Jane Q Smith');
  });

  test('no patient or no usable name falls back to the busy-only title', () => {
    expect(summary('full', [])).toBe('Appointment');
    expect(summary('full', [{ resourceType: 'Patient' }])).toBe('Appointment');
    expect(summary('initials', [{ resourceType: 'Patient' }])).toBe('Appointment');
  });

  test('group visits show a count at initials and full', () => {
    expect(summary('initials', [jane, marcus])).toBe('Appointment · 2 patients');
    expect(summary('full', [jane, marcus])).toBe('Appointment · 2 patients');
  });
});

describe('buildAppointmentEvent', () => {
  test('busy-only body', () => {
    const event = mustBuild(booked, BUSY_ONLY);
    expect(event).toEqual({
      id: '6f1c2a9e4b7d4c0e9a3b5d7f1e2c4a6b',
      status: 'confirmed',
      summary: 'Appointment',
      description: `https://app.medplum.com/Appointment/${APPOINTMENT_ID}`,
      start: { dateTime: '2026-10-12T16:00:00.000Z' },
      end: { dateTime: '2026-10-12T16:30:00.000Z' },
      transparency: 'opaque',
      visibility: 'private',
      attendees: [],
      reminders: { useDefault: true },
      extendedProperties: { private: { medplumProject: PROJECT_ID, medplumSource: `Appointment/${APPOINTMENT_ID}` } },
    });
    expect(event.location).toBeUndefined();
  });

  test('url template, reason, notes and site at full', () => {
    const event = mustBuild(booked, {
      projectId: PROJECT_ID,
      level: 'full',
      appointmentUrlTemplate: 'https://ehr.example.com/appointments/{id}',
      patients: [jane],
      service,
    });
    expect(event.summary).toBe('Jane Q Smith · Follow-up visit');
    expect(event.description).toBe(
      `https://ehr.example.com/appointments/${APPOINTMENT_ID}\nReason: Knee pain\nNotes: Bring prior imaging`
    );
    expect(event.location).toBe('Exam Room 1');
    expect(event.attendees).toEqual([]);
  });

  test('initials level has no reason, notes or site', () => {
    const event = mustBuild(booked, { projectId: PROJECT_ID, level: 'initials', patients: [jane] });
    expect(event.summary).toBe('Appointment · J.S.');
    expect(event.description).toBe(`https://app.medplum.com/Appointment/${APPOINTMENT_ID}`);
    expect(event.location).toBeUndefined();
  });

  test.each(['busy-only', 'initials', 'full'] as const)('%s never adds patient attendees', (level) => {
    expect(mustBuild(booked, { projectId: PROJECT_ID, level, patients: [jane] }).attendees).toEqual([]);
  });

  test('nothing to mirror without a usable id, start and end', () => {
    expect(buildAppointmentEvent({ ...booked, start: undefined }, BUSY_ONLY)).toBeUndefined();
    expect(buildAppointmentEvent({ ...booked, end: undefined }, BUSY_ONLY)).toBeUndefined();
    expect(buildAppointmentEvent({ ...booked, start: 'garbage' }, BUSY_ONLY)).toBeUndefined();
    expect(buildAppointmentEvent({ ...booked, id: undefined }, BUSY_ONLY)).toBeUndefined();
    expect(buildAppointmentEvent({ ...booked, id: 'appt-w42' }, BUSY_ONLY)).toBeUndefined();
    expect(buildAppointmentEvent({ ...booked, end: booked.start }, BUSY_ONLY)).toBeUndefined();
    expect(buildAppointmentEvent({ ...booked, end: '2026-10-12T15:00:00Z' }, BUSY_ONLY)).toBeUndefined();
  });

  test('times are normalized to UTC', () => {
    const event = mustBuild(
      { ...booked, start: '2026-10-12T09:00:00-07:00', end: '2026-10-12T09:30:00-07:00' },
      BUSY_ONLY
    );
    expect(event.start.dateTime).toBe('2026-10-12T16:00:00.000Z');
    expect(event.end.dateTime).toBe('2026-10-12T16:30:00.000Z');
  });
});

describe('buildSlotEvent', () => {
  test('always Busy, tagged with the Slot source', () => {
    expect(buildSlotEvent(blocked, PROJECT_ID)).toEqual({
      id: 'a152fbf8aef5450f98680819bb06a1cd',
      status: 'confirmed',
      summary: 'Busy',
      start: { dateTime: '2026-10-13T00:00:00.000Z' },
      end: { dateTime: '2026-10-14T00:00:00.000Z' },
      transparency: 'opaque',
      visibility: 'private',
      attendees: [],
      reminders: { useDefault: true },
      extendedProperties: { private: { medplumProject: PROJECT_ID, medplumSource: `Slot/${blocked.id}` } },
    });
  });

  test('nothing to mirror without a usable id or times', () => {
    expect(buildSlotEvent({ ...blocked, id: undefined }, PROJECT_ID)).toBeUndefined();
    expect(buildSlotEvent({ ...blocked, id: 'block-w1' }, PROJECT_ID)).toBeUndefined();
    expect(buildSlotEvent({ ...blocked, end: 'garbage' }, PROJECT_ID)).toBeUndefined();
    expect(buildSlotEvent({ ...blocked, end: blocked.start }, PROJECT_ID)).toBeUndefined();
  });
});
