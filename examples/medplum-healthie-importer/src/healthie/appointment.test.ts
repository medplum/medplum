// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HealthieClient } from './client';
import { HEALTHIE_APPOINTMENT_ID_SYSTEM, HEALTHIE_PROVIDER_ID_SYSTEM } from './constants';
import {
  convertHealthieAppointmentToFhir,
  fetchAppointments,
  mapPmStatusToFhirStatus,
} from './appointment';
import type { HealthieAppointment } from './appointment';

type MockResponse = {
  json: () => Promise<any>;
  ok: boolean;
  status: number;
};

describe('fetchAppointments', () => {
  let healthieClient: HealthieClient;
  const mockBaseUrl = 'https://api.example.com/graphql';
  const mockClientSecret = 'test-secret';
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    healthieClient = new HealthieClient(mockBaseUrl, mockClientSecret);
    mockFetch = vi.fn().mockImplementation((): Promise<MockResponse> => {
      return Promise.resolve({
        json: () => Promise.resolve({}),
        ok: true,
        status: 200,
      });
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('returns appointments for a patient', async () => {
    const mockAppointments: HealthieAppointment[] = [
      {
        id: 'appt-1',
        date: '2025-06-15T10:00:00Z',
        contact_type: 'Video Call',
        length: 30,
        pm_status: 'Occurred',
        provider: { id: 'prov-1', full_name: 'Dr Smith' },
        appointment_type: { id: 'type-1', name: 'Follow-up' },
      },
    ];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { appointments: mockAppointments } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchAppointments(healthieClient, 'patient-1');
    expect(result).toEqual(mockAppointments);
  });

  test('returns empty array when no appointments found', async () => {
    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { appointments: [] } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchAppointments(healthieClient, 'patient-1');
    expect(result).toEqual([]);
  });

  test('returns empty array when appointments is null', async () => {
    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { appointments: null } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchAppointments(healthieClient, 'patient-1');
    expect(result).toEqual([]);
  });

  test('paginates through multiple pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `appt-${i}` }));
    const page2 = [{ id: 'appt-100' }, { id: 'appt-101' }];

    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { appointments: page1 } }),
          ok: true,
          status: 200,
        })
    );
    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { appointments: page2 } }),
          ok: true,
          status: 200,
        })
    );

    const result = await fetchAppointments(healthieClient, 'patient-1');
    expect(result).toHaveLength(102);
    expect(result[0].id).toBe('appt-0');
    expect(result[101].id).toBe('appt-101');
  });

  test('passes filter parameter to query', async () => {
    mockFetch.mockImplementationOnce(
      (): Promise<MockResponse> =>
        Promise.resolve({
          json: () => Promise.resolve({ data: { appointments: [] } }),
          ok: true,
          status: 200,
        })
    );

    await fetchAppointments(healthieClient, 'patient-1', 'future');

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.variables.filter).toBe('future');
  });
});

describe('convertHealthieAppointmentToFhir', () => {
  const patientRef = { reference: 'Patient/123', display: 'Test Patient' } as const;

  test('converts a full appointment', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-1',
      date: '2025-06-15T10:00:00.000Z',
      contact_type: 'Video Call',
      length: 30,
      pm_status: 'Occurred',
      provider: { id: 'prov-1', full_name: 'Dr Smith' },
      appointment_type: { id: 'type-1', name: 'Follow-up' },
    };

    const result = convertHealthieAppointmentToFhir(appointment, patientRef);

    expect(result.resourceType).toBe('Appointment');
    expect(result.identifier).toEqual([{ system: HEALTHIE_APPOINTMENT_ID_SYSTEM, value: 'appt-1' }]);
    expect(result.status).toBe('fulfilled');
    expect(result.start).toBe('2025-06-15T10:00:00.000Z');
    expect(result.end).toBe('2025-06-15T10:30:00.000Z');
    expect(result.minutesDuration).toBe(30);
    expect(result.appointmentType).toEqual({ text: 'Follow-up' });
    expect(result.serviceType).toEqual([{ text: 'Video Call' }]);

    expect(result.participant).toHaveLength(2);
    expect(result.participant?.[0].type?.[0].coding?.[0].code).toBe('SBJ');
    expect(result.participant?.[0].actor).toEqual(patientRef);
    expect(result.participant?.[1].type?.[0].coding?.[0].code).toBe('ATND');
    expect(result.participant?.[1].actor).toEqual({
      identifier: { system: HEALTHIE_PROVIDER_ID_SYSTEM, value: 'prov-1' },
      display: 'Dr Smith',
    });
  });

  test('converts a minimal appointment', () => {
    const appointment: HealthieAppointment = { id: 'appt-2' };

    const result = convertHealthieAppointmentToFhir(appointment, patientRef);

    expect(result.resourceType).toBe('Appointment');
    expect(result.status).toBe('booked');
    expect(result.start).toBeUndefined();
    expect(result.end).toBeUndefined();
    expect(result.minutesDuration).toBeUndefined();
    expect(result.appointmentType).toBeUndefined();
    expect(result.serviceType).toBeUndefined();
    expect(result.participant).toHaveLength(1);
  });

  test('computes end time from date + length', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-3',
      date: '2025-01-01T09:00:00.000Z',
      length: 60,
    };

    const result = convertHealthieAppointmentToFhir(appointment, patientRef);

    expect(result.start).toBe('2025-01-01T09:00:00.000Z');
    expect(result.end).toBe('2025-01-01T10:00:00.000Z');
    expect(result.minutesDuration).toBe(60);
  });

  test('does not set end when length is missing', () => {
    const appointment: HealthieAppointment = {
      id: 'appt-4',
      date: '2025-01-01T09:00:00.000Z',
    };

    const result = convertHealthieAppointmentToFhir(appointment, patientRef);

    expect(result.start).toBe('2025-01-01T09:00:00.000Z');
    expect(result.end).toBeUndefined();
    expect(result.minutesDuration).toBeUndefined();
  });
});

describe('mapPmStatusToFhirStatus', () => {
  test('maps Occurred to fulfilled', () => {
    expect(mapPmStatusToFhirStatus('Occurred')).toBe('fulfilled');
  });

  test('maps No-Show to noshow', () => {
    expect(mapPmStatusToFhirStatus('No-Show')).toBe('noshow');
  });

  test('maps Cancelled to cancelled', () => {
    expect(mapPmStatusToFhirStatus('Cancelled')).toBe('cancelled');
  });

  test('maps Late Cancellation to cancelled', () => {
    expect(mapPmStatusToFhirStatus('Late Cancellation')).toBe('cancelled');
  });

  test('maps Re-Scheduled to cancelled', () => {
    expect(mapPmStatusToFhirStatus('Re-Scheduled')).toBe('cancelled');
  });

  test('maps Checked-In to checked-in', () => {
    expect(mapPmStatusToFhirStatus('Checked-In')).toBe('checked-in');
  });

  test('returns booked for undefined', () => {
    expect(mapPmStatusToFhirStatus(undefined)).toBe('booked');
  });

  test('returns booked for unknown status', () => {
    expect(mapPmStatusToFhirStatus('SomeNewStatus')).toBe('booked');
  });

  test('is case-insensitive', () => {
    expect(mapPmStatusToFhirStatus('occurred')).toBe('fulfilled');
    expect(mapPmStatusToFhirStatus('NO-SHOW')).toBe('noshow');
    expect(mapPmStatusToFhirStatus('cancelled')).toBe('cancelled');
    expect(mapPmStatusToFhirStatus('checked-in')).toBe('checked-in');
  });
});
