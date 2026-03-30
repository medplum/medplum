// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { HEALTHIE_APPOINTMENT_ID_SYSTEM, HEALTHIE_ENCOUNTER_ID_SYSTEM, HEALTHIE_PROVIDER_ID_SYSTEM } from './constants';
import { convertHealthieAppointmentToEncounter, mapContactTypeToClass } from './encounter';
import type { HealthieAppointment } from './appointment';

describe('convertHealthieAppointmentToEncounter', () => {
  const patientRef = { reference: 'Patient/123', display: 'Test Patient' } as const;

  test('converts a full fulfilled appointment to encounter', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-1',
      date: '2025-06-15T10:00:00.000Z',
      contact_type: 'Video Call',
      length: 30,
      pm_status: 'Occurred',
      provider: { id: 'prov-1', full_name: 'Dr Smith' },
      appointment_type: { id: 'type-1', name: 'Follow-up' },
      connected_chart_note_locked: true,
      connected_chart_note_string: 'Signed',
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);

    expect(result.resourceType).toBe('Encounter');
    expect(result.identifier).toEqual([{ system: HEALTHIE_ENCOUNTER_ID_SYSTEM, value: 'appt-1' }]);
    expect(result.status).toBe('finished');
    expect(result.class).toEqual({ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'VR', display: 'virtual' });
    expect(result.subject).toEqual(patientRef);
    expect(result.appointment).toEqual([{ identifier: { system: HEALTHIE_APPOINTMENT_ID_SYSTEM, value: 'appt-1' } }]);
    expect(result.period?.start).toBe('2025-06-15T10:00:00.000Z');
    expect(result.period?.end).toBe('2025-06-15T10:30:00.000Z');
    expect(result.length).toEqual({ value: 30, unit: 'minutes', system: 'http://unitsofmeasure.org', code: 'min' });
    expect(result.type).toEqual([{ text: 'Follow-up' }]);
    expect(result.participant).toHaveLength(1);
    expect(result.participant?.[0].individual).toEqual({
      identifier: { system: HEALTHIE_PROVIDER_ID_SYSTEM, value: 'prov-1' },
      display: 'Dr Smith',
    });
    expect(result.text?.status).toBe('additional');
    expect(result.text?.div).toContain('Signed and locked');
  });

  test('converts a minimal appointment', () => {
    const appointment: HealthieAppointment = { id: 'appt-2' };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);

    expect(result.resourceType).toBe('Encounter');
    expect(result.status).toBe('finished');
    expect(result.class.code).toBe('AMB');
    expect(result.subject).toEqual(patientRef);
    expect(result.period).toBeUndefined();
    expect(result.length).toBeUndefined();
    expect(result.participant).toBeUndefined();
    expect(result.type).toBeUndefined();
    expect(result.text).toBeUndefined();
  });

  test('computes period from date and length', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-3',
      date: '2025-01-01T09:00:00.000Z',
      length: 60,
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);

    expect(result.period?.start).toBe('2025-01-01T09:00:00.000Z');
    expect(result.period?.end).toBe('2025-01-01T10:00:00.000Z');
    expect(result.length?.value).toBe(60);
  });

  test('sets period without end when length is missing', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-4',
      date: '2025-01-01T09:00:00.000Z',
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);

    expect(result.period?.start).toBe('2025-01-01T09:00:00.000Z');
    expect(result.period?.end).toBeUndefined();
  });

  test('normalizes Healthie date format', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-5',
      date: '2025-03-26 12:00:00 -0700',
      length: 45,
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);

    expect(result.period?.start).toBe('2025-03-26T19:00:00.000Z');
    expect(result.period?.end).toBe('2025-03-26T19:45:00.000Z');
  });

  test('sets class to VR for Healthie Video Call', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-6',
      contact_type: 'Healthie Video Call',
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);
    expect(result.class.code).toBe('VR');
  });

  test('sets class to VR for Phone Call', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-7',
      contact_type: 'Phone Call',
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);
    expect(result.class.code).toBe('VR');
  });

  test('sets class to AMB for In Person', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-8',
      contact_type: 'In Person',
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);
    expect(result.class.code).toBe('AMB');
  });

  test('includes chart note status in narrative when unlocked', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-9',
      connected_chart_note_locked: false,
      connected_chart_note_string: 'In Progress',
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);

    expect(result.text?.status).toBe('generated');
    expect(result.text?.div).toContain('In Progress');
    expect(result.text?.div).not.toContain('Signed and locked');
  });

  test('does not set text when no chart note string', () => {
    const appointment: HealthieAppointment = { id: 'appt-10' };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);
    expect(result.text).toBeUndefined();
  });

  test('escapes HTML in chart note string', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-11',
      connected_chart_note_string: '<script>alert("xss")</script>',
    };

    const result = convertHealthieAppointmentToEncounter(appointment, patientRef);
    expect(result.text?.div).not.toContain('<script>');
    expect(result.text?.div).toContain('&lt;script&gt;');
  });
});

describe('mapContactTypeToClass', () => {
  test('maps Video Call to VR', () => {
    expect(mapContactTypeToClass('Video Call')).toEqual(
      expect.objectContaining({ code: 'VR' })
    );
  });

  test('maps Healthie Video Call to VR', () => {
    expect(mapContactTypeToClass('Healthie Video Call')).toEqual(
      expect.objectContaining({ code: 'VR' })
    );
  });

  test('maps Phone Call to VR', () => {
    expect(mapContactTypeToClass('Phone Call')).toEqual(
      expect.objectContaining({ code: 'VR' })
    );
  });

  test('maps In Person to AMB', () => {
    expect(mapContactTypeToClass('In Person')).toEqual(
      expect.objectContaining({ code: 'AMB' })
    );
  });

  test('maps Office to AMB', () => {
    expect(mapContactTypeToClass('Office')).toEqual(
      expect.objectContaining({ code: 'AMB' })
    );
  });

  test('maps undefined to AMB', () => {
    expect(mapContactTypeToClass(undefined)).toEqual(
      expect.objectContaining({ code: 'AMB' })
    );
  });

  test('maps unknown type to AMB', () => {
    expect(mapContactTypeToClass('Telehealth')).toEqual(
      expect.objectContaining({ code: 'AMB' })
    );
  });

  test('is case-insensitive', () => {
    expect(mapContactTypeToClass('video call')).toEqual(
      expect.objectContaining({ code: 'VR' })
    );
    expect(mapContactTypeToClass('PHONE CALL')).toEqual(
      expect.objectContaining({ code: 'VR' })
    );
    expect(mapContactTypeToClass('in person')).toEqual(
      expect.objectContaining({ code: 'AMB' })
    );
  });
});
