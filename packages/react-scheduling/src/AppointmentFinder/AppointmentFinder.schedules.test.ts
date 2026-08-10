// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Coding, Device, HealthcareService, Location, PractitionerRole, Schedule } from '@medplum/fhirtypes';
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
} from '../stories/scheduling';
import { getSchedulingRole } from './AppointmentFinder.roles';
import type { ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import {
  MAX_ACTOR_COMBINATIONS,
  candidateMatchesQuery,
  countActorCombinations,
  filterCandidatesByClinic,
  getActorCombinations,
  getActorQualifiers,
  getQualifierLabels,
  getRequirementLabel,
  getSelectedCandidates,
  getSelectionError,
  groupCandidatesByRole,
  searchEligibleSchedules,
  toActorRequirements,
} from './AppointmentFinder.schedules';
import { getActorsKey } from './AppointmentFinder.times';

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

  /**
   * The schedules each combination would be searched with.
   * @param combinations - The combinations to describe.
   * @returns One sorted list of schedule references per combination.
   */
  function schedulesOf(combinations: ReturnType<typeof getActorCombinations>): string[][] {
    return combinations.map((combination) =>
      combination.schedules.map((schedule) => schedule.reference as string).sort()
    );
  }

  test('One chosen actor per role is one request', () => {
    expect(
      schedulesOf(
        getActorCombinations(groups, {
          provider: toActorRequirements(['schedule-dr-okafor']),
          device: toActorRequirements(['schedule-ultrasound-1']),
        })
      )
    ).toStrictEqual([['Schedule/schedule-dr-okafor', 'Schedule/schedule-ultrasound-1']]);
  });

  test('Several actors that all attend stay in the same request', () => {
    // `$find` intersects them, so two providers and a device is one request for
    // the times all three are free — not a choice between them.
    expect(
      schedulesOf(
        getActorCombinations(groups, {
          provider: toActorRequirements(['schedule-dr-rivera', 'schedule-dr-okafor']),
          device: toActorRequirements(['schedule-ultrasound-1']),
        })
      )
    ).toStrictEqual([['Schedule/schedule-dr-okafor', 'Schedule/schedule-dr-rivera', 'Schedule/schedule-ultrasound-1']]);
  });

  test('A requirement naming several actors is a request each', () => {
    // The other half of the model: `$find` cannot be asked for a choice, so
    // "either provider, with the ultrasound" is two searches to offer side by
    // side. Nothing builds this selection yet — the form only ever names one
    // candidate per requirement — but the shape it fans out to is fixed here.
    const combinations = getActorCombinations(groups, {
      provider: [{ scheduleIds: ['schedule-dr-rivera', 'schedule-dr-okafor'] }],
      device: toActorRequirements(['schedule-ultrasound-1']),
    });

    expect(schedulesOf(combinations)).toStrictEqual([
      ['Schedule/schedule-dr-rivera', 'Schedule/schedule-ultrasound-1'],
      ['Schedule/schedule-dr-okafor', 'Schedule/schedule-ultrasound-1'],
    ]);
    expect(combinations.map((combination) => combination.label)).toStrictEqual([
      'Dr. Maya Rivera · Ultrasound 1',
      'Dr. Tunde Okafor · Ultrasound 1',
    ]);
  });

  test('Requirements multiply across roles', () => {
    expect(
      countActorCombinations(groups, {
        provider: [{ scheduleIds: ['schedule-dr-rivera', 'schedule-dr-okafor'] }],
        device: [{ scheduleIds: ['schedule-ultrasound-1'] }],
      })
    ).toBe(2);
    // Two requirements in the one role: both attend, and each is a choice.
    expect(
      countActorCombinations(groups, {
        provider: [
          { scheduleIds: ['schedule-dr-rivera', 'schedule-dr-okafor'] },
          { scheduleIds: ['schedule-dr-rivera', 'schedule-dr-okafor'] },
        ],
      })
    ).toBe(4);
  });

  test('Refuses a choice too wide to search', () => {
    // Thirteen either-or requirements is 2^13 requests, with no cursor to page
    // their results together.
    const selections = {
      provider: Array.from({ length: 13 }, () => ({
        scheduleIds: ['schedule-dr-rivera', 'schedule-dr-okafor'],
      })),
    };

    expect(countActorCombinations(groups, selections)).toBe(8192);
    expect(getSelectionError(groups, selections)).toBe(
      `That is 8192 sets of actors to search for. Narrow it to ${MAX_ACTOR_COMBINATIONS} or fewer.`
    );
    // Building the product is the cost the refusal exists to avoid, so the
    // builder stops at the same line rather than trusting its caller to.
    expect(getActorCombinations(groups, selections)).toStrictEqual([]);
  });

  test('An optional role left empty drops out of the search', () => {
    // Holding a device nobody asked for would narrow the search to the times
    // that device happens to be free.
    expect(
      schedulesOf(getActorCombinations(groups, { provider: toActorRequirements(['schedule-dr-rivera']), device: [] }))
    ).toStrictEqual([['Schedule/schedule-dr-rivera']]);
  });

  test('A required role left empty stops the search', () => {
    const selections = { device: toActorRequirements(['schedule-ultrasound-1']) };

    expect(schedulesOf(getActorCombinations(groups, selections))).toStrictEqual([['Schedule/schedule-ultrasound-1']]);
    expect(getSelectionError(groups, selections)).toBe('Choose at least one provider');
  });

  test('A selection matching nothing counts as no selection', () => {
    const selections = { provider: toActorRequirements(['schedule-gone']) };

    expect(getSelectedCandidates(PROVIDERS, selections)).toStrictEqual([]);
    expect(getActorCombinations(groups, selections)).toStrictEqual([]);
    expect(getSelectionError(groups, selections)).toBe('Choose at least one provider');
  });

  test('A requirement keeps the candidates it can still be filled by', () => {
    // Half a choice going stale narrows it rather than voiding it.
    expect(getRequirementLabel(PROVIDERS, { scheduleIds: ['schedule-gone', 'schedule-dr-okafor'] })).toBe(
      'Dr. Tunde Okafor'
    );
    expect(getRequirementLabel(PROVIDERS, { scheduleIds: ['schedule-gone'] })).toBe('');
    expect(getRequirementLabel(PROVIDERS, { scheduleIds: ['schedule-dr-rivera', 'schedule-dr-okafor'] })).toBe(
      'Dr. Maya Rivera or Dr. Tunde Okafor'
    );
  });

  test('Accepts a search once a provider is chosen', () => {
    expect(getSelectionError(groups, { provider: toActorRequirements(['schedule-dr-rivera']) })).toBeUndefined();
  });

  test('Reports a service with nothing to book against', () => {
    expect(getSelectionError([], {})).toBe('No schedules are configured for this service.');
  });

  test('Asks for something to be chosen when every role is optional', () => {
    expect(getSelectionError([DEVICES], {})).toBe('Choose at least one device');
    expect(getSelectionError([DEVICES], { device: toActorRequirements(['schedule-ultrasound-1']) })).toBeUndefined();
  });

  test('Names everyone the appointment would be held on', () => {
    const [combination] = getActorCombinations(groups, {
      provider: toActorRequirements(['schedule-dr-rivera', 'schedule-dr-okafor']),
      device: toActorRequirements(['schedule-ultrasound-1']),
    });

    expect(combination.label).toBe('Dr. Maya Rivera · Dr. Tunde Okafor · Ultrasound 1');
    expect(combination.actors.map((actor) => actor.reference)).toStrictEqual([
      'Practitioner/schedule-dr-rivera',
      'Practitioner/schedule-dr-okafor',
      'Device/schedule-ultrasound-1',
    ]);
    expect(combination.schedules).toHaveLength(3);
    // The key matches the appointments $find offers for the same actors, so an
    // entered time can be recognised as one of them.
    expect(combination.key).toBe(
      getActorsKey([
        { reference: 'Device/schedule-ultrasound-1' },
        { reference: 'Practitioner/schedule-dr-okafor' },
        { reference: 'Practitioner/schedule-dr-rivera' },
      ])
    );
  });

  test('Nothing chosen is nothing to hold a requested time on', () => {
    expect(getActorCombinations(groups, {})).toStrictEqual([]);
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
