// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildProposedAppointment } from '../stories/scheduling';
import { applyBookingDetails, buildCustomAppointment, findAppointmentAt } from './AppointmentFinder.assemble';
import { getActorsKey } from './AppointmentFinder.times';

describe('requested times', () => {
  const offered = [
    buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', actorReferences: ['Practitioner/dr-rivera'] }),
    buildProposedAppointment({ start: '2026-07-27T13:30:00.000Z', actorReferences: ['Device/ultrasound-1'] }),
  ];

  test('Recognises a requested time that was already offered', () => {
    const match = findAppointmentAt(
      offered,
      new Date('2026-07-27T13:00:00.000Z'),
      getActorsKey([{ reference: 'Practitioner/dr-rivera' }])
    );

    expect(match).toBe(offered[0]);
    expect(match?.contained).toHaveLength(1);
  });

  test('Does not confuse the same time with different actors', () => {
    expect(
      findAppointmentAt(
        offered,
        new Date('2026-07-27T13:00:00.000Z'),
        getActorsKey([{ reference: 'Device/ultrasound-1' }])
      )
    ).toBeUndefined();
    expect(findAppointmentAt(offered, new Date('2026-07-27T13:15:00.000Z'))).toBeUndefined();
  });

  test('Matches on time alone when no actors are given', () => {
    expect(findAppointmentAt(offered, new Date('2026-07-27T13:30:00.000Z'))).toBe(offered[1]);
  });

  test('Builds an appointment for a time nobody offered', () => {
    const appointment = buildCustomAppointment({
      start: new Date('2026-07-27T18:15:00.000Z'),
      durationMinutes: 45,
      actors: [{ reference: 'Practitioner/dr-rivera', display: 'Dr. Maya Rivera' }],
      schedules: [{ reference: 'Schedule/schedule-dr-rivera' }],
      serviceType: [{ text: 'Ultrasound Imaging' }],
    });

    expect(appointment.status).toBe('proposed');
    expect(appointment.start).toBe('2026-07-27T18:15:00.000Z');
    expect(appointment.end).toBe('2026-07-27T19:00:00.000Z');
    expect(appointment.participant?.[0].actor?.reference).toBe('Practitioner/dr-rivera');
    expect(appointment.serviceType?.[0].text).toBe('Ultrasound Imaging');
    // Slots to hold, for a caller that decides to write the booking anyway.
    expect(appointment.contained).toStrictEqual([
      {
        resourceType: 'Slot',
        status: 'busy',
        schedule: { reference: 'Schedule/schedule-dr-rivera' },
        start: '2026-07-27T18:15:00.000Z',
        end: '2026-07-27T19:00:00.000Z',
      },
    ]);
  });

  test('Leaves out Slots when there is no schedule to hold', () => {
    const appointment = buildCustomAppointment({
      start: new Date('2026-07-27T18:15:00.000Z'),
      durationMinutes: 30,
      actors: [{ reference: 'Practitioner/dr-rivera' }],
    });

    expect(appointment.contained).toBeUndefined();
  });
});

describe('applyBookingDetails', () => {
  const proposed = buildProposedAppointment({ start: '2026-07-27T16:30:00.000Z' });

  test('Adds the patient and the notes to the proposal', () => {
    const booked = applyBookingDetails(proposed, {
      patient: { reference: 'Patient/homer' },
      comment: 'Follow-up scan',
      patientInstruction: 'Drink water beforehand',
    });

    expect(booked.comment).toBe('Follow-up scan');
    expect(booked.patientInstruction).toBe('Drink water beforehand');
    expect(booked.participant?.map((participant) => participant.actor?.reference)).toContain('Patient/homer');
    // The proposal is otherwise untouched, Slots and all, because the server
    // validates what it produced.
    expect(booked.contained).toStrictEqual(proposed.contained);
    expect(booked.start).toBe(proposed.start);
    expect(proposed.participant).not.toContainEqual(expect.objectContaining({ actor: { reference: 'Patient/homer' } }));
  });

  test('Does not name the patient twice', () => {
    const withPatient = applyBookingDetails(proposed, { patient: { reference: 'Patient/homer' } });
    const again = applyBookingDetails(withPatient, { patient: { reference: 'Patient/homer' } });

    expect(again.participant?.filter((participant) => participant.actor?.reference === 'Patient/homer')).toHaveLength(
      1
    );
  });

  test('Leaves blank notes off rather than writing empty strings', () => {
    const booked = applyBookingDetails(proposed, { comment: '   ', patientInstruction: '' });

    expect(booked.comment).toBeUndefined();
    expect(booked.patientInstruction).toBeUndefined();
  });
});
