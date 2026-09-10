// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  createReference,
  getReferenceString,
  isDefined,
  isResource,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type {
  AccessPolicy,
  Appointment,
  Bundle,
  CodeableConcept,
  HealthcareService,
  Location,
  Patient,
  Practitioner,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getGlobalSystemRepo } from '../../fhir/repo';
import type { TestProjectResult } from '../../test.setup';
import { addTestUser, createTestProject } from '../../test.setup';
import type {
  SchedulingParametersExtension,
  SchedulingParametersExtensionExtension,
} from './utils/scheduling-parameters';

const systemRepo = getGlobalSystemRepo();
const app = express();
const request = supertest(app);

const weekdayAvailability: SchedulingParametersExtensionExtension = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'availableStartTime', valueTime: '09:00:00' },
        { url: 'availableEndTime', valueTime: '17:00:00' },
      ],
    },
  ],
};

describe('Appointment/:id/$reschedule', () => {
  let project: TestProjectResult<{ withAccessToken: true }>;
  let practitioner: WithId<Practitioner>;
  let roomOne: WithId<Location>;
  let roomTwo: WithId<Location>;
  let patient: WithId<Patient>;
  let officeVisitService: WithId<HealthcareService>;

  const officeVisit: CodeableConcept = {
    coding: [{ system: 'https://example.com/fhir', code: 'office-visit' }],
  };

  beforeAll(async () => {
    const config = await loadTestConfig();
    // try to be more resilient to concurrent tests touching the same tables
    config.transactionAttempts = 5;
    await initApp(app, config);
    project = await createTestProject({ withAccessToken: true });

    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
    roomOne = await makeRoom();
    roomTwo = await makeRoom();
    patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      meta: { project: project.project.id },
    });

    officeVisitService = await systemRepo.createResource<HealthcareService>({
      resourceType: 'HealthcareService',
      name: 'Office Visit',
      type: [officeVisit],
      meta: { project: project.project.id },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function makeRoom(): Promise<WithId<Location>> {
    return systemRepo.createResource<Location>({
      resourceType: 'Location',
      meta: { project: project.project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
  }

  function makeSchedulingExtension(opts?: { duration?: number; bufferBefore?: number }): SchedulingParametersExtension {
    const extension: SchedulingParametersExtension = {
      url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
      extension: [
        weekdayAvailability,
        { url: 'duration', valueDuration: { value: opts?.duration ?? 60, unit: 'min' } },
        { url: 'service', valueReference: createReference(officeVisitService) },
      ],
    };
    if (opts?.bufferBefore) {
      extension.extension.push({ url: 'bufferBefore', valueDuration: { value: opts.bufferBefore, unit: 'min' } });
    }
    return extension;
  }

  async function makeSchedule(
    actor: Practitioner | Location,
    opts?: { duration?: number; bufferBefore?: number }
  ): Promise<WithId<Schedule>> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(actor)],
      serviceType: toServiceTypeCodeableConcepts(officeVisitService),
      extension: [makeSchedulingExtension(opts)],
    });
  }

  function makeProposal(opts: {
    start: string;
    end: string;
    schedules: WithId<Schedule>[];
    bufferBefore?: number;
  }): Appointment {
    const contained: Slot[] = opts.schedules.flatMap((schedule) => {
      const slots: Slot[] = [
        {
          resourceType: 'Slot',
          status: 'busy',
          schedule: createReference(schedule),
          start: opts.start,
          end: opts.end,
        },
      ];
      if (opts.bufferBefore) {
        slots.push({
          resourceType: 'Slot',
          status: 'busy-unavailable',
          schedule: createReference(schedule),
          start: new Date(new Date(opts.start).getTime() - opts.bufferBefore * 60_000).toISOString(),
          end: opts.start,
        });
      }
      return slots;
    });

    // Shaped exactly like an Appointment/$find result: schedule actors only, no patient
    return {
      resourceType: 'Appointment',
      status: 'proposed',
      start: opts.start,
      end: opts.end,
      serviceType: toServiceTypeCodeableConcepts(officeVisitService),
      participant: opts.schedules.map(
        (schedule) => ({ actor: schedule.actor[0], required: 'required', status: 'needs-action' }) as const
      ),
      contained,
    };
  }

  // Books a proposal the way a caller would: the patient participant and any clinical detail
  // are added on top of what $find returned.
  async function book(proposal: Appointment, extra?: Partial<Appointment>): Promise<Appointment> {
    const appointment: Appointment = {
      ...proposal,
      participant: [{ actor: createReference(patient), status: 'accepted' }, ...proposal.participant],
      ...extra,
    };
    const response = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'appointment', resource: appointment }] });
    expect(response).toHaveStatus(201);
    const booked = ((response.body as Bundle).entry ?? [])
      .map((entry) => entry.resource)
      .find((resource) => isResource<Appointment>(resource, 'Appointment'));
    expect(booked).toBeDefined();
    return booked as Appointment;
  }

  // $reschedule takes the same schedule / service-type-reference used to search with $find,
  // plus the chosen start. The Slot resources are derived server-side.
  function reschedule(
    appointmentId: string,
    opts: { start: string; schedules: WithId<Schedule>[]; service?: WithId<HealthcareService>; accessToken?: string }
  ): ReturnType<typeof request.post> {
    return request
      .post(`/fhir/R4/Appointment/${appointmentId}/$reschedule`)
      .set('Authorization', `Bearer ${opts.accessToken ?? project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'start', valueDateTime: opts.start },
          { name: 'service-type-reference', valueReference: createReference(opts.service ?? officeVisitService) },
          ...opts.schedules.map((schedule) => ({ name: 'schedule', valueReference: createReference(schedule) })),
        ],
      });
  }

  function bundleResources(body: unknown): (Appointment | Slot)[] {
    return ((body as Bundle).entry ?? []).map((entry) => entry.resource).filter(isDefined) as (Appointment | Slot)[];
  }

  test('reassigning a subset of schedules without changing the scheduled time', async () => {
    // In this test, we are changing from an original booking with a practitioner and room-1
    // to the same practitioner and room-2.
    const practitionerSchedule = await makeSchedule(practitioner);
    const roomOneSchedule = await makeSchedule(roomOne);
    const roomTwoSchedule = await makeSchedule(roomTwo);
    const start = '2026-01-13T16:00:00.000Z'; // 11am EST
    const end = '2026-01-13T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule, roomOneSchedule] }), {
      comment: 'Patient prefers the morning',
      reasonCode: [{ text: 'Annual physical' }],
    });
    const originalSlotIds = (booked.slot ?? []).map((ref) => ref.reference);
    expect(originalSlotIds).toHaveLength(2);

    // $book would consider the practitioner busy at 11am due to the appointment we are
    // modifying already existing, but $reschedule will allow it. The proposal is passed
    // through exactly as $find returned it.
    const response = await reschedule(booked.id as string, {
      start,
      schedules: [practitionerSchedule, roomTwoSchedule],
    });

    expect(response).toHaveStatus(200);

    const resources = bundleResources(response.body);
    const appointments = resources.filter((r) => isResource<Appointment>(r, 'Appointment'));
    const slots = resources.filter((r) => isResource<Slot>(r, 'Slot'));

    // The same Appointment resource is updated in place
    expect(appointments).toHaveLength(1);
    expect(appointments[0].id).toStrictEqual(booked.id);
    expect(appointments[0]).toMatchObject({ status: 'booked', start, end });

    // Attributes that the request never mentioned survive the reschedule
    expect(appointments[0]).toMatchObject({
      comment: 'Patient prefers the morning',
      reasonCode: [{ text: 'Annual physical' }],
    });

    // Room one is swapped for room two; the patient and the practitioner are left alone,
    // and the patient keeps the participant status they had already responded with
    const actors = (appointments[0].participant ?? []).map((p) => p.actor?.reference);
    expect(actors).toContainExactly([
      getReferenceString(patient),
      getReferenceString(practitioner),
      getReferenceString(roomTwo),
    ]);
    expect(appointments[0].participant).toContainEqual({ actor: createReference(patient), status: 'accepted' });

    // New slots point at the practitioner and the new room
    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => slot.schedule.reference)).toContainExactly([
      `Schedule/${practitionerSchedule.id}`,
      `Schedule/${roomTwoSchedule.id}`,
    ]);
    expect(appointments[0].slot?.map((ref) => ref.reference)).toContainExactly(slots.map((slot) => `Slot/${slot.id}`));

    // The slots held before the reschedule are gone
    for (const reference of originalSlotIds) {
      await expect(systemRepo.readReference<Slot>({ reference })).rejects.toThrow();
    }
  });

  test('rescheduling an appointment with the same schedules to a new time', async () => {
    // In this test we are changing the time of the appointment without adjusting what
    // resources we are scheduling.
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-01-14T16:00:00.000Z'; // Wed 11am EST
    const end = '2026-01-14T17:00:00.000Z';
    const newStart = '2026-01-14T19:00:00.000Z'; // Wed 2pm EST
    const newEnd = '2026-01-14T20:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));

    const response = await reschedule(booked.id as string, { start: newStart, schedules: [practitionerSchedule] });

    expect(response).toHaveStatus(200);
    const resources = bundleResources(response.body);
    const appointment = resources.find((r) => isResource<Appointment>(r, 'Appointment')) as Appointment;
    // `end` is not an input: it is derived from the schedule's 60 minute duration
    expect(appointment).toMatchObject({ id: booked.id, status: 'booked', start: newStart, end: newEnd });

    // The patient participant is preserved without the request having to resubmit it
    expect(appointment.participant).toContainEqual({ actor: createReference(patient), status: 'accepted' });

    // The vacated time is bookable again
    const rebooked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));
    expect(rebooked.id).not.toStrictEqual(booked.id);
  });

  test('keeps the original slots when the new time is unavailable', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-01-20T16:00:00.000Z'; // Tue 11am EST
    const end = '2026-01-20T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));
    const originalSlotRefs = (booked.slot ?? []).map((ref) => ref.reference as string);

    // 3am EST on a Tuesday is outside the 9am-5pm availability window
    const badStart = '2026-01-20T08:00:00.000Z';
    const response = await reschedule(booked.id as string, { start: badStart, schedules: [practitionerSchedule] });

    expect(response).toHaveStatus(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [{ details: { text: 'Requested time slot is not available' } }],
    });

    // The transaction rolled back, so the appointment still holds its original slots
    const unchanged = await systemRepo.readResource<Appointment>('Appointment', booked.id as string);
    expect(unchanged.slot?.map((ref) => ref.reference)).toContainExactly(originalSlotRefs);
    for (const reference of originalSlotRefs) {
      await expect(systemRepo.readReference<Slot>({ reference })).resolves.toMatchObject({ start, end });
    }
  });

  test('a pending appointment keeps holding its time tentatively', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-01-21T16:00:00.000Z'; // Wed 11am EST
    const end = '2026-01-21T17:00:00.000Z';
    const newStart = '2026-01-21T19:00:00.000Z';
    const newEnd = '2026-01-21T20:00:00.000Z';

    const holdResponse = await request
      .post('/fhir/R4/Appointment/$hold')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: makeProposal({ start, end, schedules: [practitionerSchedule] }) }],
      });
    expect(holdResponse).toHaveStatus(201);
    const held = bundleResources(holdResponse.body).find((r) =>
      isResource<Appointment>(r, 'Appointment')
    ) as Appointment;

    const response = await reschedule(held.id as string, { start: newStart, schedules: [practitionerSchedule] });

    expect(response).toHaveStatus(200);
    const resources = bundleResources(response.body);
    expect(resources.find((r) => isResource<Appointment>(r, 'Appointment'))).toMatchObject({ status: 'pending' });
    const slots = resources.filter((r) => isResource<Slot>(r, 'Slot'));
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ status: 'busy-tentative', start: newStart, end: newEnd });

    // $confirm walks Appointment.slot, so it must pick up the Slots created by the reschedule
    const confirmResponse = await request
      .post(`/fhir/R4/Appointment/${held.id}/$confirm`)
      .set('Authorization', `Bearer ${project.accessToken}`);
    expect(confirmResponse).toHaveStatus(200);
    const confirmed = bundleResources(confirmResponse.body);
    expect(confirmed.find((r) => isResource<Appointment>(r, 'Appointment'))).toMatchObject({ status: 'booked' });
    expect(confirmed.filter((r) => isResource<Slot>(r, 'Slot'))).toStrictEqual([
      expect.objectContaining({ id: slots[0].id, status: 'busy', start: newStart, end: newEnd }),
    ]);
  });

  test('carries buffer slots over to the new time', async () => {
    const practitionerSchedule = await makeSchedule(practitioner, { bufferBefore: 30 });
    const start = '2026-01-27T16:00:00.000Z'; // Tue 11am EST
    const end = '2026-01-27T17:00:00.000Z';
    const newStart = '2026-01-27T19:00:00.000Z';
    const newEnd = '2026-01-27T20:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule], bufferBefore: 30 }));
    expect(booked.slot).toHaveLength(2);

    // The buffer Slot is derived from the schedule's bufferBefore, not submitted by the caller
    const response = await reschedule(booked.id as string, { start: newStart, schedules: [practitionerSchedule] });

    expect(response).toHaveStatus(200);
    const slots = bundleResources(response.body).filter((r) => isResource<Slot>(r, 'Slot'));
    expect(slots).toHaveLength(2);
    expect(slots.find((slot) => slot.status === 'busy')).toMatchObject({ start: newStart, end: newEnd });
    expect(slots.find((slot) => slot.status === 'busy-unavailable')).toMatchObject({
      start: '2026-01-27T18:30:00.000Z',
      end: newStart,
    });
  });

  test('rejects an appointment that is not pending or booked', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-01-28T16:00:00.000Z'; // Wed 11am EST
    const end = '2026-01-28T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));
    const cancelResponse = await request
      .post(`/fhir/R4/Appointment/${booked.id}/$cancel`)
      .set('Authorization', `Bearer ${project.accessToken}`);
    expect(cancelResponse).toHaveStatus(200);

    const response = await reschedule(booked.id as string, { start, schedules: [practitionerSchedule] });

    expect(response).toHaveStatus(400);
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: { text: "Appointment cannot be rescheduled in 'cancelled' status" },
      },
    ]);
  });

  test('rescheduling as a patient with a minimal access policy', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-02-10T16:00:00.000Z'; // Tue 11am EST
    const end = '2026-02-10T17:00:00.000Z';
    const newStart = '2026-02-10T19:00:00.000Z';
    const newEnd = '2026-02-10T20:00:00.000Z';

    // $reschedule needs more than $book does: it deletes the Slots the appointment holds and
    // updates the Appointment, so 'delete' on Slot and 'update' on Appointment are required.
    // When updating this policy, please keep the sample "Patient Access Policy" in the
    // documentation in sync.
    // @see https://www.medplum.com/docs/access/access-policies#patient-access
    const minimalPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        { resourceType: 'Practitioner', interaction: ['read'] },
        { resourceType: 'HealthcareService', interaction: ['read'] },
        { resourceType: 'Schedule', interaction: ['read'] },
        { resourceType: 'Patient', criteria: 'Patient?_compartment=%patient', interaction: ['read'] },
        { resourceType: 'Slot', interaction: ['create', 'read', 'search', 'delete'] },
        {
          resourceType: 'Appointment',
          criteria: 'Appointment?_compartment=%patient',
          interaction: ['create', 'read', 'update'],
        },
      ],
    };

    const { accessToken, profile } = await addTestUser(project.project, {
      accessPolicy: minimalPolicy,
      resourceType: 'Patient',
    });

    const proposal = makeProposal({ start, end, schedules: [practitionerSchedule] });
    const asPatient = [
      { actor: createReference(profile), status: 'accepted' as const },
      { actor: practitionerSchedule.actor[0], status: 'tentative' as const },
    ];

    const bookResponse = await request
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: { ...proposal, participant: asPatient } }],
      });
    expect(bookResponse).toHaveStatus(201);
    const booked = bundleResources(bookResponse.body).find((r) =>
      isResource<Appointment>(r, 'Appointment')
    ) as Appointment;

    const response = await reschedule(booked.id as string, {
      start: newStart,
      schedules: [practitionerSchedule],
      accessToken,
    });

    expect(response).toHaveStatus(200);
    const appointment = bundleResources(response.body).find((r) =>
      isResource<Appointment>(r, 'Appointment')
    ) as Appointment;
    expect(appointment).toMatchObject({ id: booked.id, status: 'booked', start: newStart, end: newEnd });
    expect(appointment.participant).toContainEqual({ actor: createReference(profile), status: 'accepted' });
  });

  test('the start time of a proposed appointment from Appointment/$find can be used for $reschedule', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const roomOneSchedule = await makeSchedule(roomOne);
    const roomTwoSchedule = await makeSchedule(roomTwo);
    const start = '2026-03-03T16:00:00.000Z'; // Tue 11am EST
    const end = '2026-03-03T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule, roomOneSchedule] }), {
      comment: 'do not lose me',
    });

    // Ask $find for times available to the practitioner and room two, ignoring the appointment
    // we are about to move, then feed a result into $reschedule
    const findResponse = await request
      .get('/fhir/R4/Appointment/$find')
      .set('Authorization', `Bearer ${project.accessToken}`)
      .query(
        new URLSearchParams([
          ['start', '2026-03-03T00:00:00.000Z'],
          ['end', '2026-03-04T00:00:00.000Z'],
          ['service-type-reference', `HealthcareService/${officeVisitService.id}`],
          ['schedule', `Schedule/${practitionerSchedule.id}`],
          ['schedule', `Schedule/${roomTwoSchedule.id}`],
          ['ignore-appointment', `Appointment/${booked.id}`],
        ]).toString()
      );
    expect(findResponse).toHaveStatus(200);

    const proposal = (findResponse.body as Bundle<Appointment>).entry?.find(
      (entry) => entry.resource?.start === start
    )?.resource;
    expect(proposal).toBeDefined();

    // The caller reuses the schedules and service they searched with, plus the chosen start
    const response = await reschedule(booked.id as string, {
      start: proposal?.start as string,
      schedules: [practitionerSchedule, roomTwoSchedule],
    });

    expect(response).toHaveStatus(200);
    const appointment = bundleResources(response.body).find((r) =>
      isResource<Appointment>(r, 'Appointment')
    ) as Appointment;
    expect(appointment).toMatchObject({ id: booked.id, status: 'booked', start, end, comment: 'do not lose me' });
    expect((appointment.participant ?? []).map((p) => p.actor?.reference)).toContainExactly([
      getReferenceString(patient),
      getReferenceString(practitioner),
      getReferenceString(roomTwo),
    ]);
  });

  test('reassigning to schedules that share an actor does not duplicate participants', async () => {
    // Two Schedules for the same practitioner, e.g. one per service type. The practitioner is
    // not a participant before the reschedule, so both Schedules contribute the same new actor.
    const roomSchedule = await makeSchedule(roomOne);
    const scheduleOne = await makeSchedule(practitioner);
    const scheduleTwo = await makeSchedule(practitioner);
    const start = '2026-03-04T16:00:00.000Z'; // Wed 11am EST
    const end = '2026-03-04T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [roomSchedule] }));

    const response = await reschedule(booked.id as string, { start, schedules: [scheduleOne, scheduleTwo] });

    expect(response).toHaveStatus(200);
    const appointment = bundleResources(response.body).find((r) =>
      isResource<Appointment>(r, 'Appointment')
    ) as Appointment;
    expect((appointment.participant ?? []).map((p) => p.actor?.reference)).toContainExactly([
      getReferenceString(patient),
      getReferenceString(practitioner),
    ]);
  });

  test('rejects an invalid start time', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-04-14T16:00:00.000Z'; // Tue 11am EST
    const end = '2026-04-14T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));

    // 11:17am is not on the 60 minute grid
    const response = await reschedule(booked.id as string, {
      start: '2026-04-14T16:17:60.000Z', // :60 seconds is invalid
      schedules: [practitionerSchedule],
    });

    expect(response).toHaveStatus(400);
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: { text: 'Invalid start time ' },
        expression: ['Parameters.start'],
      },
    ]);
  });

  test('rejects a start that is not aligned to the scheduling grid', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-04-14T16:00:00.000Z'; // Tue 11am EST
    const end = '2026-04-14T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));

    // 11:17am is not on the 60 minute grid
    const response = await reschedule(booked.id as string, {
      start: '2026-04-14T16:17:00.000Z',
      schedules: [practitionerSchedule],
    });

    expect(response).toHaveStatus(400);
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: { text: 'Start time is not aligned to the scheduling grid' },
        expression: ['Parameters.start'],
      },
    ]);
  });

  test('rejects a schedule that does not offer the requested service type', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-04-15T16:00:00.000Z'; // Wed 11am EST
    const end = '2026-04-15T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));

    // A Schedule whose serviceType does not include the office visit service
    const otherSchedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.project.id },
      actor: [createReference(roomOne)],
      serviceType: [{ coding: [{ system: 'https://example.com/fhir', code: 'lab-draw' }] }],
      extension: [makeSchedulingExtension()],
    });

    const response = await reschedule(booked.id as string, {
      start,
      schedules: [practitionerSchedule, otherSchedule],
    });

    expect(response).toHaveStatus(400);
    expect(response.body).toMatchObject({
      issue: [{ details: { text: 'Schedule is not schedulable for requested service type' } }],
    });
  });

  test('rejects an invalid reference for a schedule', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-04-16T16:00:00.000Z'; // Thu 11am EST
    const end = '2026-04-16T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));

    const response = await request
      .post(`/fhir/R4/Appointment/${booked.id}/$reschedule`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'start', valueDateTime: start },
          { name: 'service-type-reference', valueReference: createReference(officeVisitService) },
          { name: 'schedule', valueReference: { reference: `Slot/${randomUUID()}` } },
        ],
      });

    expect(response).toHaveStatus(400);
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: { text: 'Invalid schedule reference' },
        expression: ['Parameters.schedule[0]'],
      },
    ]);
  });

  test('rejects an invalid service-type-reference', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-04-16T16:00:00.000Z'; // Thu 11am EST
    const end = '2026-04-16T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));

    const response = await request
      .post(`/fhir/R4/Appointment/${booked.id}/$reschedule`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'start', valueDateTime: start },
          { name: 'service-type-reference', valueReference: { reference: `Slot/${randomUUID}` } },
          { name: 'schedule', valueReference: createReference(practitionerSchedule) },
        ],
      });

    expect(response).toHaveStatus(400);
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: { text: 'Invalid service-type-reference' },
        expression: ['Parameters.schedule[0]'],
      },
    ]);
  });

  test('rejects when the service-type-reference does not resolve', async () => {
    const practitionerSchedule = await makeSchedule(practitioner);
    const start = '2026-04-16T16:00:00.000Z'; // Thu 11am EST
    const end = '2026-04-16T17:00:00.000Z';

    const booked = await book(makeProposal({ start, end, schedules: [practitionerSchedule] }));

    const response = await request
      .post(`/fhir/R4/Appointment/${booked.id}/$reschedule`)
      .set('Authorization', `Bearer ${project.accessToken}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'start', valueDateTime: start },
          { name: 'service-type-reference', valueReference: { reference: `HealthcareService/${randomUUID}` } },
          { name: 'schedule', valueReference: createReference(practitionerSchedule) },
        ],
      });

    expect(response).toHaveStatus(400);
    expect(response.body).toHaveProperty('issue', [
      {
        code: 'invalid',
        severity: 'error',
        details: { text: 'HealthcareService not found' },
        expression: ['Parameters.service-type-reference'],
      },
    ]);
  });
});
