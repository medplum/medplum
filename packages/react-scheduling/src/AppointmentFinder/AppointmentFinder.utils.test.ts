// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type {
  Coding,
  Device,
  Duration,
  HealthcareService,
  Location,
  PractitionerRole,
  Schedule,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  DrChenRole,
  DrChenSchedule,
  DrOkaforSchedule,
  DrRiveraSchedule,
  MainClinic,
  SatelliteClinic,
  SchedulingFixtures,
  SurgeryService,
  SurgicalFixtures,
  Ultrasound1Schedule,
  UltrasoundImagingService,
  buildProposedAppointment,
} from '../stories/scheduling';
import type { ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.utils';
import {
  MAX_FIND_WINDOW_DAYS,
  applyBookingDetails,
  buildCustomAppointment,
  candidateMatchesQuery,
  endOfMonth,
  enumerateDateRange,
  filterByTimeOfDay,
  filterCandidatesByClinic,
  findAppointmentAt,
  formatDateRange,
  formatZonedTime,
  getActorCombination,
  getActorGroupKey,
  getActorQualifiers,
  getActorRoleLabel,
  getActorsKey,
  getAppointmentKey,
  getConfiguredDurationMinutes,
  getDurationMinutes,
  getFindWindow,
  getQualifierLabels,
  getSchedulingRole,
  getSelectedCandidates,
  getSelectedSchedules,
  getSelectionError,
  groupAppointmentsByDay,
  groupCandidatesByRole,
  parseDayKey,
  parseZonedTime,
  searchEligibleSchedules,
} from './AppointmentFinder.utils';

const EASTERN = 'America/New_York';

async function setupClient(): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of SchedulingFixtures) {
    await medplum.createResource(resource);
  }
  return medplum;
}

// Adds the surgical service, whose actors are PractitionerRoles with locations.
async function setupSurgicalClient(): Promise<MockClient> {
  const medplum = await setupClient();
  for (const resource of SurgicalFixtures) {
    await medplum.createResource(resource);
  }
  return medplum;
}

describe('searchEligibleSchedules', () => {
  test('Finds schedules linked to the service and names their actors', async () => {
    const medplum = await setupClient();

    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    expect(candidates.map((candidate) => candidate.schedule.id).sort()).toStrictEqual([
      'schedule-dr-okafor',
      'schedule-dr-rivera',
      'schedule-exam-room-a',
      'schedule-exam-room-b',
      'schedule-satellite-room',
      'schedule-ultrasound-1',
      'schedule-ultrasound-2',
    ]);
    expect(candidates.map((candidate) => candidate.role)).toContain('provider');
    expect(candidates.map((candidate) => candidate.role)).toContain('room');
    expect(candidates.map((candidate) => candidate.role)).toContain('device');
    expect(candidates.find((candidate) => candidate.schedule.id === 'schedule-dr-rivera')?.actorDisplay).toBe(
      'Dr. Maya Rivera'
    );
  });

  test('Rejects a schedule whose serviceType does not reference the service', async () => {
    const medplum = await setupClient();
    // Carries the same coding, so the token search finds it, but no link back to
    // the service — which is exactly what $find would reject.
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      serviceType: [{ coding: DrRiveraSchedule.serviceType?.[0].coding }],
    });

    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    expect(candidates).toHaveLength(7);
    expect(candidates.every((candidate) => candidate.schedule.serviceType?.[0].extension?.length)).toBe(true);
  });

  test('Names an actor whose reference carries no display', async () => {
    const medplum = await setupClient();
    const bare = await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Practitioner/dr-okafor' }],
    });

    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);
    const candidate = candidates.find((entry) => entry.schedule.id === bare.id);

    expect(candidate?.actorDisplay).toBe('Dr. Tunde Okafor');
    expect(candidate?.actorResource?.id).toBe('dr-okafor');
  });

  test('Rejects inactive schedules and schedules with more than one actor', async () => {
    const medplum = await setupClient();
    await medplum.createResource<Schedule>({ ...DrRiveraSchedule, id: undefined, active: false });
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Practitioner/dr-rivera' }, { reference: 'Device/ultrasound-1' }],
    });

    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    expect(candidates).toHaveLength(7);
  });

  test('Falls back to reading schedules when the service has no codings', async () => {
    const medplum = await setupClient();
    const untyped: WithId<HealthcareService> = { ...UltrasoundImagingService, type: undefined };

    const candidates = await searchEligibleSchedules(medplum, untyped);

    // The link is still checked, so only the service's own schedules come back.
    expect(candidates).toHaveLength(7);
  });
});

describe('filterCandidatesByClinic', () => {
  test('Keeps the rooms at the clinic, however deep, and drops the rest', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    // Exam Room A is directly inside the clinic and Exam Room B is a floor
    // below it; the satellite site's room is somewhere else entirely.
    expect(roomsOf(kept)).toStrictEqual(['Exam Room A', 'Exam Room B']);
    // Providers and devices are not sited this way, so they are untouched.
    expect(kept).toHaveLength(6);
  });

  test('Keeps only the other site’s room when booking there', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByClinic(medplum, candidates, SatelliteClinic);

    expect(roomsOf(kept)).toStrictEqual(['Satellite Exam Room']);
  });

  test('Keeps every room when no clinic was chosen', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    expect(await filterCandidatesByClinic(medplum, candidates, undefined)).toHaveLength(candidates.length);
  });

  test('Keeps a room whose ancestry cannot be read', async () => {
    const medplum = await setupClient();
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Location/deleted-room', display: 'Room 9' }],
    });
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    // Hiding a room the user may be entitled to book is worse than showing one
    // that cannot be placed.
    expect(roomsOf(kept)).toContain('Room 9');
  });

  test('Keeps plain Practitioners, which say nothing about where they work', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByClinic(medplum, candidates, SatelliteClinic);

    expect(providersOf(kept).sort()).toStrictEqual(['Dr. Maya Rivera', 'Dr. Tunde Okafor']);
  });

  test('Drops a practitioner whose role is licensed at another site', async () => {
    const medplum = await setupSurgicalClient();
    const elsewhere = await medplum.createResource<PractitionerRole>({
      ...DrChenRole,
      id: undefined,
      location: [{ reference: 'Location/satellite-clinic' }],
    });
    await medplum.createResource<Schedule>({
      ...DrChenSchedule,
      id: undefined,
      actor: [{ reference: `PractitionerRole/${elsewhere.id}`, display: 'Dr. Wei Chen (Satellite)' }],
    });
    const candidates = await searchEligibleSchedules(medplum, SurgeryService);

    const kept = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    expect(providersOf(kept).sort()).toStrictEqual(['Dr. James Kim', 'Dr. Maria Martinez', 'Dr. Wei Chen']);
  });

  test('Keeps a practitioner licensed for a region the clinic sits inside', async () => {
    // Licensure is usually held per state rather than per building, so a role
    // covering the state covers the clinics in it.
    const medplum = await setupSurgicalClient();
    await medplum.updateResource<Location>({ ...MainClinic, partOf: { reference: 'Location/state-ny' } });
    await medplum.createResource<Location>({ resourceType: 'Location', id: 'state-ny', name: 'New York' });
    const statewide = await medplum.createResource<PractitionerRole>({
      ...DrChenRole,
      id: undefined,
      location: [{ reference: 'Location/state-ny' }],
    });
    await medplum.createResource<Schedule>({
      ...DrChenSchedule,
      id: undefined,
      actor: [{ reference: `PractitionerRole/${statewide.id}`, display: 'Dr. Wei Chen (NY)' }],
    });
    const candidates = await searchEligibleSchedules(medplum, SurgeryService);

    const kept = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    expect(providersOf(kept)).toContain('Dr. Wei Chen (NY)');
  });

  test('Keeps a practitioner whose role names a room inside the clinic', async () => {
    // A role attached to a department or a room is inside the clinic, not beside
    // it. The room itself is offered when booking here, so the practitioner in it
    // has to be too.
    const medplum = await setupSurgicalClient();
    const inTheatre = await medplum.createResource<PractitionerRole>({
      ...DrChenRole,
      id: undefined,
      location: [{ reference: 'Location/or-3' }],
    });
    await medplum.createResource<Schedule>({
      ...DrChenSchedule,
      id: undefined,
      actor: [{ reference: `PractitionerRole/${inTheatre.id}`, display: 'Dr. Wei Chen (OR 3)' }],
    });
    const candidates = await searchEligibleSchedules(medplum, SurgeryService);

    const kept = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    expect(providersOf(kept)).toContain('Dr. Wei Chen (OR 3)');
    // Still measured against the site being booked: OR 3 is not at the satellite.
    const atSatellite = await filterCandidatesByClinic(medplum, candidates, SatelliteClinic);
    expect(providersOf(atSatellite)).not.toContain('Dr. Wei Chen (OR 3)');
  });

  test('Keeps a practitioner whose role names a location that cannot be read', async () => {
    // The same leniency a room gets: an unreadable Location is unknown ancestry,
    // not proof of being elsewhere, and a permissions gap must not quietly shorten
    // the list of providers.
    const medplum = await setupSurgicalClient();
    const unreadable = await medplum.createResource<PractitionerRole>({
      ...DrChenRole,
      id: undefined,
      location: [{ reference: 'Location/deleted-site' }],
    });
    await medplum.createResource<Schedule>({
      ...DrChenSchedule,
      id: undefined,
      actor: [{ reference: `PractitionerRole/${unreadable.id}`, display: 'Dr. Wei Chen (unknown site)' }],
    });
    const candidates = await searchEligibleSchedules(medplum, SurgeryService);

    const kept = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    expect(providersOf(kept)).toContain('Dr. Wei Chen (unknown site)');
  });

  test('Keeps a practitioner whose role names no location at all', async () => {
    const medplum = await setupSurgicalClient();
    const anywhere = await medplum.createResource<PractitionerRole>({
      ...DrChenRole,
      id: undefined,
      location: undefined,
    });
    await medplum.createResource<Schedule>({
      ...DrChenSchedule,
      id: undefined,
      actor: [{ reference: `PractitionerRole/${anywhere.id}`, display: 'Dr. Wei Chen (unsited)' }],
    });
    const candidates = await searchEligibleSchedules(medplum, SurgeryService);

    const kept = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    expect(providersOf(kept)).toContain('Dr. Wei Chen (unsited)');
  });

  test('Drops a device kept at another site, and keeps one that does not say', async () => {
    const medplum = await setupClient();
    const elsewhere = await medplum.createResource<Device>({
      resourceType: 'Device',
      deviceName: [{ name: 'Ultrasound 3 (Satellite)', type: 'user-friendly-name' }],
      location: { reference: 'Location/satellite-clinic' },
    });
    await medplum.createResource<Schedule>({
      ...Ultrasound1Schedule,
      id: undefined,
      actor: [{ reference: `Device/${elsewhere.id}`, display: 'Ultrasound 3 (Satellite)' }],
    });
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByClinic(medplum, candidates, MainClinic);

    expect(devicesOf(kept).sort()).toStrictEqual(['Ultrasound 1 (Main Campus)', 'Ultrasound 2 (Main Campus)']);
  });
});

function roomsOf(candidates: readonly ScheduleCandidate[]): string[] {
  return candidates.filter((candidate) => candidate.role === 'room').map((candidate) => candidate.actorDisplay);
}

function providersOf(candidates: readonly ScheduleCandidate[]): string[] {
  return candidates.filter((candidate) => candidate.role === 'provider').map((candidate) => candidate.actorDisplay);
}

function devicesOf(candidates: readonly ScheduleCandidate[]): string[] {
  return candidates.filter((candidate) => candidate.role === 'device').map((candidate) => candidate.actorDisplay);
}

describe('groupCandidatesByRole', () => {
  test('Produces one group per role present, in a stable order', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const groups = groupCandidatesByRole(candidates);

    expect(groups.map((group) => group.role)).toStrictEqual(['provider', 'room', 'device']);
    expect(groups.map((group) => group.label)).toStrictEqual(['Provider', 'Room', 'Device']);
    expect(groups.map((group) => group.candidates.length)).toStrictEqual([2, 3, 2]);
  });

  test('Asks for a provider, but leaves rooms and devices optional', async () => {
    const medplum = await setupClient();
    const groups = groupCandidatesByRole(await searchEligibleSchedules(medplum, UltrasoundImagingService));

    expect(groups.map((group) => group.required)).toStrictEqual([true, false, false]);
  });

  test('Collects practitioners and the roles they hold into one question', () => {
    const groups = groupCandidatesByRole([
      candidateOf(DrRiveraSchedule, 'Practitioner', 'Dr. Maya Rivera'),
      candidateOf(DrOkaforSchedule, 'PractitionerRole', 'Dr. Tunde Okafor - Urology'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].candidates).toHaveLength(2);
  });

  test('Omits roles with no schedules', () => {
    expect(groupCandidatesByRole([])).toStrictEqual([]);
  });
});

function candidateOf(
  schedule: WithId<Schedule>,
  actorType: 'Practitioner' | 'PractitionerRole' | 'Location' | 'Device',
  actorDisplay: string,
  qualifiers: Coding[] = []
): ScheduleCandidate {
  const role = getSchedulingRole(actorType);
  return {
    schedule,
    actor: { reference: `${actorType}/${schedule.id}`, display: actorDisplay },
    actorType,
    role,
    actorDisplay,
    qualifiers,
    actorResource: undefined,
  };
}

describe('selections', () => {
  const PROVIDERS: ScheduleCandidateGroup = {
    role: 'provider',
    label: 'Provider',
    required: true,
    candidates: [
      candidateOf(DrRiveraSchedule, 'Practitioner', 'Dr. Maya Rivera'),
      candidateOf(DrOkaforSchedule, 'Practitioner', 'Dr. Tunde Okafor'),
    ],
  };

  const DEVICES: ScheduleCandidateGroup = {
    role: 'device',
    label: 'Device',
    required: false,
    candidates: [candidateOf(Ultrasound1Schedule, 'Device', 'Ultrasound 1')],
  };

  const groups = [PROVIDERS, DEVICES];

  test('One chosen actor per role is one request', () => {
    expect(
      getSelectedSchedules(groups, {
        provider: ['schedule-dr-okafor'],
        device: ['schedule-ultrasound-1'],
      })
    ).toStrictEqual([{ reference: 'Schedule/schedule-dr-okafor' }, { reference: 'Schedule/schedule-ultrasound-1' }]);
  });

  test('Several chosen actors all attend, in the same request', () => {
    // `$find` intersects them, so two providers and a device is one request for
    // the times all three are free — not a choice between them.
    expect(
      getSelectedSchedules(groups, {
        provider: ['schedule-dr-rivera', 'schedule-dr-okafor'],
        device: ['schedule-ultrasound-1'],
      })
    ).toStrictEqual([
      { reference: 'Schedule/schedule-dr-rivera' },
      { reference: 'Schedule/schedule-dr-okafor' },
      { reference: 'Schedule/schedule-ultrasound-1' },
    ]);
  });

  test('An optional role left empty drops out of the search', () => {
    // Holding a device nobody asked for would narrow the search to the times
    // that device happens to be free.
    expect(getSelectedSchedules(groups, { provider: ['schedule-dr-rivera'], device: [] })).toStrictEqual([
      { reference: 'Schedule/schedule-dr-rivera' },
    ]);
  });

  test('A required role left empty stops the search', () => {
    expect(getSelectedSchedules(groups, { device: ['schedule-ultrasound-1'] })).toStrictEqual([
      { reference: 'Schedule/schedule-ultrasound-1' },
    ]);
    expect(getSelectionError(groups, { device: ['schedule-ultrasound-1'] })).toBe('Choose at least one provider');
  });

  test('A selection matching nothing counts as no selection', () => {
    expect(getSelectedCandidates(PROVIDERS, { provider: ['schedule-gone'] })).toStrictEqual([]);
    expect(getSelectionError(groups, { provider: ['schedule-gone'] })).toBe('Choose at least one provider');
  });

  test('Accepts a search once a provider is chosen', () => {
    expect(getSelectionError(groups, { provider: ['schedule-dr-rivera'] })).toBeUndefined();
  });

  test('Reports a service with nothing to book against', () => {
    expect(getSelectionError([], {})).toBe('No schedules are configured for this service.');
  });

  test('Asks for something to be chosen when every role is optional', () => {
    expect(getSelectionError([DEVICES], {})).toBe('Choose at least one device');
    expect(getSelectionError([DEVICES], { device: ['schedule-ultrasound-1'] })).toBeUndefined();
  });

  test('Names everyone the appointment would be held on', () => {
    const combination = getActorCombination(groups, {
      provider: ['schedule-dr-rivera', 'schedule-dr-okafor'],
      device: ['schedule-ultrasound-1'],
    });

    expect(combination?.label).toBe('Dr. Maya Rivera · Dr. Tunde Okafor · Ultrasound 1');
    expect(combination?.actors.map((actor) => actor.reference)).toStrictEqual([
      'Practitioner/schedule-dr-rivera',
      'Practitioner/schedule-dr-okafor',
      'Device/schedule-ultrasound-1',
    ]);
    expect(combination?.schedules).toHaveLength(3);
    // The key matches the appointments $find offers for the same actors, so an
    // entered time can be recognised as one of them.
    expect(combination?.key).toBe(
      getActorsKey([
        { reference: 'Device/schedule-ultrasound-1' },
        { reference: 'Practitioner/schedule-dr-okafor' },
        { reference: 'Practitioner/schedule-dr-rivera' },
      ])
    );
  });

  test('Nothing chosen is nothing to hold a requested time on', () => {
    expect(getActorCombination(groups, {})).toBeUndefined();
  });
});

describe('qualifiers', () => {
  const SURGERY: Coding = { system: 'http://snomed.info/sct', code: '394609007', display: 'Surgery' };
  const ANAESTHETICS: Coding = { system: 'http://snomed.info/sct', code: '394577000', display: 'Anaesthetics' };

  test('Reads the role and specialty a PractitionerRole holds', () => {
    expect(
      getActorQualifiers({
        resourceType: 'PractitionerRole',
        id: 'role-1',
        code: [{ coding: [{ system: 'http://example.org/roles', code: 'doctor', display: 'Doctor' }] }],
        specialty: [{ coding: [SURGERY] }],
      })
    ).toStrictEqual([{ system: 'http://example.org/roles', code: 'doctor', display: 'Doctor' }, SURGERY]);
  });

  test('Reads the type of a room and of a device', () => {
    expect(getActorQualifiers({ resourceType: 'Location', id: 'or-3', type: [{ coding: [{ code: 'OR' }] }] })).toEqual([
      { code: 'OR' },
    ]);
    expect(
      getActorQualifiers({ resourceType: 'Device', id: 'ultrasound-1', type: { coding: [{ code: 'ultrasound' }] } })
    ).toEqual([{ code: 'ultrasound' }]);
  });

  test('A plain Practitioner says nothing about what it does', () => {
    // Nothing in R4 tells a surgeon from an anesthesiologist here, so there is
    // nothing to narrow a list of them by.
    expect(getActorQualifiers({ resourceType: 'Practitioner', id: 'dr-rivera' })).toStrictEqual([]);
    expect(getActorQualifiers(undefined)).toStrictEqual([]);
  });

  test('Names what an actor is, for matching what is typed', () => {
    const okafor = candidateOf(DrOkaforSchedule, 'PractitionerRole', 'Dr. Tunde Okafor', [SURGERY, ANAESTHETICS]);

    expect(getQualifierLabels(okafor)).toStrictEqual(['Surgery', 'Anaesthetics']);
    // An actor with nothing to say about itself is shown as just its name.
    expect(getQualifierLabels(candidateOf(DrRiveraSchedule, 'Practitioner', 'Dr. Maya Rivera'))).toStrictEqual([]);
  });

  test('Falls back to the code when a qualifier has no display', () => {
    const candidate = candidateOf(DrRiveraSchedule, 'Location', 'Operating Room 3', [{ code: 'OR' }]);
    expect(getQualifierLabels(candidate)).toStrictEqual(['OR']);
  });

  test('Searches what an actor does as well as what it is called', () => {
    const rivera = candidateOf(DrRiveraSchedule, 'PractitionerRole', 'Dr. Maya Rivera', [SURGERY]);

    expect(candidateMatchesQuery(rivera, 'rivera')).toBe(true);
    expect(candidateMatchesQuery(rivera, 'surg')).toBe(true);
    expect(candidateMatchesQuery(rivera, 'anaes')).toBe(false);
    expect(candidateMatchesQuery(rivera, '  ')).toBe(true);
  });
});

describe('getFindWindow', () => {
  const NOON = new Date(2026, 6, 27, 12, 0);

  test('Opens at the requested time and runs to the end of a later day', () => {
    const window = getFindWindow(NOON, undefined, 0, 14);

    expect(window?.start).toStrictEqual(NOON);
    // July 27 through August 9 is a fortnight, counting the day it starts on.
    expect(window?.end).toStrictEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
  });

  test('Picks up each later page where the one before it left off', () => {
    const first = getFindWindow(NOON, undefined, 0, 14);
    const second = getFindWindow(NOON, undefined, 1, 14);
    const third = getFindWindow(NOON, undefined, 2, 14);

    expect(second?.start).toStrictEqual(first?.end);
    expect(second?.end).toStrictEqual(new Date(2026, 7, 23, 23, 59, 59, 999));
    expect(third?.start).toStrictEqual(second?.end);
  });

  test('Stops at the end of the range that was asked for', () => {
    const end = new Date(2026, 6, 31, 23, 59, 59, 999);

    expect(getFindWindow(NOON, end, 0, 14)).toStrictEqual({ start: NOON, end });
    expect(getFindWindow(NOON, end, 1, 14)).toBeUndefined();
  });

  test('Walks a range longer than one request may cover', () => {
    const end = new Date(2026, 8, 30, 23, 59, 59, 999);

    expect(getFindWindow(NOON, end, 0, 14)?.end).toStrictEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
    expect(getFindWindow(NOON, end, 4, 14)?.end).toStrictEqual(end);
    expect(getFindWindow(NOON, end, 5, 14)).toBeUndefined();
  });

  test('Keeps every page inside what the operation accepts', () => {
    for (const index of [0, 1, 2]) {
      const window = getFindWindow(NOON, undefined, index, 90);
      const days = ((window?.end.getTime() as number) - (window?.start.getTime() as number)) / (24 * 60 * 60 * 1000);
      expect(days).toBeLessThanOrEqual(MAX_FIND_WINDOW_DAYS);
    }
  });

  test('Reports that a range running backwards has nothing to search', () => {
    expect(getFindWindow(NOON, new Date(2026, 6, 1), 0)).toBeUndefined();
    expect(getFindWindow(NOON, NOON, 0)).toBeUndefined();
  });
});

describe('filterByTimeOfDay', () => {
  const morning = buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z' }); // 9:00 Eastern
  const afternoon = buildProposedAppointment({ start: '2026-07-27T17:30:00.000Z' }); // 13:30 Eastern

  test('Keeps everything for "any"', () => {
    expect(filterByTimeOfDay([morning, afternoon], 'any', EASTERN)).toHaveLength(2);
  });

  test("Splits the day in the scheduling timezone, not the browser's", () => {
    expect(filterByTimeOfDay([morning, afternoon], 'morning', EASTERN)).toStrictEqual([morning]);
    expect(filterByTimeOfDay([morning, afternoon], 'afternoon', EASTERN)).toStrictEqual([afternoon]);

    // The same instant is already afternoon in UTC, so the zone decides.
    expect(filterByTimeOfDay([morning], 'morning', 'Etc/UTC')).toStrictEqual([]);
  });
});

describe('groupAppointmentsByDay', () => {
  test('Groups by day and by the actors offering the times', () => {
    const device = ['Device/ultrasound-1'];
    const provider = ['Practitioner/dr-rivera'];
    const appointments = [
      buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', actorReferences: device }),
      buildProposedAppointment({ start: '2026-07-27T13:30:00.000Z', actorReferences: device }),
      buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', actorReferences: provider }),
      buildProposedAppointment({ start: '2026-07-28T13:00:00.000Z', actorReferences: device }),
    ];

    const days = groupAppointmentsByDay(appointments, EASTERN);

    expect(days.map((day) => day.key)).toStrictEqual(['2026-07-27', '2026-07-28']);
    expect(days[0].groups).toHaveLength(2);
    expect(days[0].groups.map((group) => group.appointments.length).sort()).toStrictEqual([1, 2]);
    expect(days[1].groups).toHaveLength(1);
  });

  test('Assigns days in the scheduling timezone', () => {
    // 00:30 UTC on the 28th is still the evening of the 27th in Eastern time.
    const lateEvening = buildProposedAppointment({ start: '2026-07-28T00:30:00.000Z' });

    expect(groupAppointmentsByDay([lateEvening], EASTERN)[0].key).toBe('2026-07-27');
    expect(groupAppointmentsByDay([lateEvening], 'Etc/UTC')[0].key).toBe('2026-07-28');
  });

  test('Reports the duration and sorts times ascending', () => {
    const days = groupAppointmentsByDay(
      [
        buildProposedAppointment({ start: '2026-07-27T14:00:00.000Z', durationMinutes: 45 }),
        buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', durationMinutes: 45 }),
      ],
      EASTERN
    );

    expect(days[0].groups[0].durationMinutes).toBe(45);
    expect(days[0].groups[0].appointments.map((appointment) => appointment.start)).toStrictEqual([
      '2026-07-27T13:00:00.000Z',
      '2026-07-27T14:00:00.000Z',
    ]);
  });

  test('Skips appointments with no start', () => {
    expect(
      groupAppointmentsByDay([{ resourceType: 'Appointment', status: 'proposed', participant: [] }])
    ).toStrictEqual([]);
  });

  test('Produces a local date matching the zoned day', () => {
    const [day] = groupAppointmentsByDay([buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z' })], EASTERN);
    expect(day.date.getFullYear()).toBe(2026);
    expect(day.date.getMonth()).toBe(6);
    expect(day.date.getDate()).toBe(27);
  });
});

describe('keys and durations', () => {
  test('Actor group key is order-independent', () => {
    const left = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: ['Device/ultrasound-1', 'Practitioner/dr-rivera'],
    });
    const right = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: ['Practitioner/dr-rivera', 'Device/ultrasound-1'],
    });

    expect(getActorGroupKey(left)).toBe(getActorGroupKey(right));
  });

  test('Appointment key separates the same time from different actors', () => {
    const device = buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z' });
    const provider = buildProposedAppointment({
      start: '2026-07-27T13:00:00.000Z',
      actorReferences: ['Practitioner/dr-rivera'],
    });

    expect(getAppointmentKey(device)).not.toBe(getAppointmentKey(provider));
  });

  test('Duration comes from the appointment itself', () => {
    expect(
      getDurationMinutes(buildProposedAppointment({ start: '2026-07-27T13:00:00.000Z', durationMinutes: 20 }))
    ).toBe(20);
    expect(getDurationMinutes(undefined)).toBe(0);
    expect(getDurationMinutes({ resourceType: 'Appointment', status: 'proposed', participant: [] })).toBe(0);
  });
});

describe('parseZonedTime', () => {
  test('Reads the time on the clinic’s clock, not the browser’s', () => {
    const day = new Date(2026, 6, 27);

    expect(parseZonedTime(day, '09:30', EASTERN)?.toISOString()).toBe('2026-07-27T13:30:00.000Z');
    expect(parseZonedTime(day, '09:30', 'Etc/UTC')?.toISOString()).toBe('2026-07-27T09:30:00.000Z');
  });

  test('Falls back to the browser when no zone is given', () => {
    const parsed = parseZonedTime(new Date(2026, 6, 27), '14:05') as Date;

    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(5);
    expect(parsed.getDate()).toBe(27);
  });

  test('Reads a time on the day the clocks change', () => {
    // Eastern time springs forward at 2am on 8 March 2026, so 3am that day is
    // already UTC-4 rather than the UTC-5 in force at midnight.
    expect(parseZonedTime(new Date(2026, 2, 8), '03:00', EASTERN)?.toISOString()).toBe('2026-03-08T07:00:00.000Z');
    expect(parseZonedTime(new Date(2026, 2, 8), '01:00', EASTERN)?.toISOString()).toBe('2026-03-08T06:00:00.000Z');
  });

  test('Rejects anything that is not a time', () => {
    const day = new Date(2026, 6, 27);

    expect(parseZonedTime(day, '', EASTERN)).toBeUndefined();
    expect(parseZonedTime(day, '9', EASTERN)).toBeUndefined();
    expect(parseZonedTime(day, '25:00', EASTERN)).toBeUndefined();
    expect(parseZonedTime(day, '09:75', EASTERN)).toBeUndefined();
    expect(parseZonedTime(day, 'noon', EASTERN)).toBeUndefined();
  });
});

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

describe('getConfiguredDurationMinutes', () => {
  test('Reads the length the service is configured for', () => {
    expect(getConfiguredDurationMinutes(UltrasoundImagingService)).toBe(30);
    expect(getConfiguredDurationMinutes(undefined)).toBeUndefined();
  });

  test('A Schedule overrides the service, as the server does', () => {
    const schedule: Schedule = {
      ...DrRiveraSchedule,
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'service', valueReference: { reference: 'HealthcareService/ultrasound-imaging' } },
            { url: 'duration', valueDuration: { value: 1, unit: 'h' } },
          ],
        },
      ],
    };

    expect(getConfiguredDurationMinutes(UltrasoundImagingService, schedule)).toBe(60);
    // Parameters for another service are not this service's.
    expect(getConfiguredDurationMinutes({ ...UltrasoundImagingService, id: 'other' }, schedule)).toBe(30);
  });

  test('Reports nothing when the service configures no length', () => {
    expect(getConfiguredDurationMinutes({ ...UltrasoundImagingService, extension: undefined })).toBeUndefined();
  });

  test('Reads the same units the scheduling operations do', () => {
    // Shared with the server through `durationToMinutes`, so that a visit shown
    // here as a day long is a day long when it is booked. A unit the operations
    // refuse is reported as no length rather than guessed at as minutes.
    expect(durationOf({ value: 1, unit: 'd' })).toBe(1440);
    expect(durationOf({ value: 2, unit: 'wk' })).toBe(20160);
    expect(durationOf({ value: 45, unit: 'min' })).toBe(45);
    expect(durationOf({ value: 1800, unit: 's' })).toBeUndefined();
    expect(durationOf({ value: 1, code: 'h' })).toBeUndefined();
  });
});

// The length a service configured with the given duration is read as.
function durationOf(valueDuration: Duration): number | undefined {
  return getConfiguredDurationMinutes({
    ...UltrasoundImagingService,
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [{ url: 'duration', valueDuration }],
      },
    ],
  });
}

describe('formatting', () => {
  test('Formats times in the requested zone', () => {
    const time = formatZonedTime(new Date('2026-07-27T16:30:00.000Z'), EASTERN);
    expect(time).toContain('12:30');
    expect(formatZonedTime(new Date('2026-07-27T16:30:00.000Z'), 'Etc/UTC')).toContain('4:30');
  });

  test('Parses a day key as local midnight', () => {
    const date = parseDayKey('2026-07-27');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(27);
    expect(date.getHours()).toBe(0);
  });
});

describe('endOfMonth', () => {
  test('Covers the whole of a month, whatever its length', () => {
    expect(endOfMonth(new Date(2026, 6, 27))).toStrictEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
    expect(endOfMonth(new Date(2026, 1, 3))).toStrictEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
    // A leap February, which the month's own length has to come from rather than
    // from a count of days.
    expect(endOfMonth(new Date(2028, 1, 3))).toStrictEqual(new Date(2028, 1, 29, 23, 59, 59, 999));
  });
});

describe('enumerateDateRange', () => {
  test('Lists every day a range covers', () => {
    const days = enumerateDateRange({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 30) });
    expect(days).toStrictEqual([
      new Date(2026, 6, 27),
      new Date(2026, 6, 28),
      new Date(2026, 6, 29),
      new Date(2026, 6, 30),
    ]);
  });

  test('An open range is only the day it starts on, or nothing at all', () => {
    expect(enumerateDateRange({ start: new Date(2026, 6, 27) })).toStrictEqual([new Date(2026, 6, 27)]);
    expect(enumerateDateRange({})).toStrictEqual([]);
    expect(enumerateDateRange({ end: new Date(2026, 6, 27) })).toStrictEqual([]);
  });

  test('Stops at the limit rather than running a year out', () => {
    const days = enumerateDateRange({ start: new Date(2026, 6, 1), end: new Date(2027, 6, 1) }, 5);
    expect(days).toHaveLength(5);
  });
});

describe('formatDateRange', () => {
  test('Says which days are being searched', () => {
    expect(formatDateRange({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 27) })).toBe('Monday, July 27');
    expect(formatDateRange({ start: new Date(2026, 6, 27), end: new Date(2026, 6, 30) })).toBe(
      'Monday, July 27 – Thursday, July 30'
    );
    expect(formatDateRange({ start: new Date(2026, 6, 27) })).toBe('From Monday, July 27');
    expect(formatDateRange({ end: new Date(2026, 6, 30) })).toBe('Through Thursday, July 30');
  });

  test('Says nothing when neither end was asked for', () => {
    expect(formatDateRange({})).toBeUndefined();
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

describe('getActorRoleLabel', () => {
  test('Names the role a reference fills', () => {
    expect(getActorRoleLabel({ reference: 'Practitioner/dr-rivera' })).toBe('Provider');
    expect(getActorRoleLabel({ reference: 'PractitionerRole/role-dr-chen' })).toBe('Provider');
    expect(getActorRoleLabel({ reference: 'Location/exam-room-a' })).toBe('Room');
    expect(getActorRoleLabel({ reference: 'Device/ultrasound-1' })).toBe('Device');
  });

  test('Says nothing about a reference that is not an actor', () => {
    expect(getActorRoleLabel({ reference: 'Patient/homer' })).toBeUndefined();
    expect(getActorRoleLabel({})).toBeUndefined();
  });
});
