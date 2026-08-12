// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Device, HealthcareService, Location, PractitionerRole, Schedule } from '@medplum/fhirtypes';
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
import type { ScheduleCandidate, ScheduleCandidateGroup } from './AppointmentFinder.schedules';
import {
  MAX_ACTOR_COMBINATIONS,
  countActorCombinations,
  filterCandidatesByLocation,
  getActorCombinations,
  getCandidateDisplay,
  getCandidateRole,
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
    expect(candidates.map(getCandidateRole)).toContain('provider');
    expect(candidates.map(getCandidateRole)).toContain('room');
    expect(candidates.map(getCandidateRole)).toContain('device');

    const rivera = candidates.find((candidate) => candidate.schedule.id === 'schedule-dr-rivera');
    expect(rivera && getCandidateDisplay(rivera)).toBe('Dr. Maya Rivera');
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

    expect(candidate && getCandidateDisplay(candidate)).toBe('Dr. Tunde Okafor');
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

describe('filterCandidatesByLocation', () => {
  test('Keeps the rooms at the clinic, however deep, and drops the rest', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByLocation(medplum, candidates, MainClinic);

    // Exam Room A is directly inside the clinic and Exam Room B is a floor
    // below it; the satellite site's room is somewhere else entirely.
    expect(roomsOf(kept).sort()).toStrictEqual(['Exam Room A', 'Exam Room B']);
    // Providers and devices are not sited this way, so they are untouched.
    expect(kept).toHaveLength(6);
  });

  test('Keeps only the other site’s room when booking there', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByLocation(medplum, candidates, SatelliteClinic);

    expect(roomsOf(kept)).toStrictEqual(['Satellite Exam Room']);
  });

  test('Keeps every room when no clinic was chosen', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    expect(await filterCandidatesByLocation(medplum, candidates, undefined)).toHaveLength(candidates.length);
  });

  test('Keeps a room whose ancestry cannot be read', async () => {
    const medplum = await setupClient();
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Location/deleted-room', display: 'Room 9' }],
    });
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByLocation(medplum, candidates, MainClinic);

    // Hiding a room the user may be entitled to book is worse than showing one
    // that cannot be placed.
    expect(roomsOf(kept)).toContain('Room 9');
  });

  test('Keeps plain Practitioners, which say nothing about where they work', async () => {
    const medplum = await setupClient();
    const candidates = await searchEligibleSchedules(medplum, UltrasoundImagingService);

    const kept = await filterCandidatesByLocation(medplum, candidates, SatelliteClinic);

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

    const kept = await filterCandidatesByLocation(medplum, candidates, MainClinic);

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

    const kept = await filterCandidatesByLocation(medplum, candidates, MainClinic);

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

    const kept = await filterCandidatesByLocation(medplum, candidates, MainClinic);

    expect(providersOf(kept)).toContain('Dr. Wei Chen (OR 3)');
    // Still measured against the site being booked: OR 3 is not at the satellite.
    const atSatellite = await filterCandidatesByLocation(medplum, candidates, SatelliteClinic);
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

    const kept = await filterCandidatesByLocation(medplum, candidates, MainClinic);

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

    const kept = await filterCandidatesByLocation(medplum, candidates, MainClinic);

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

    const kept = await filterCandidatesByLocation(medplum, candidates, MainClinic);

    expect(devicesOf(kept).sort()).toStrictEqual(['Ultrasound 1 (Main Campus)', 'Ultrasound 2 (Main Campus)']);
  });
});

function namesOfRole(candidates: readonly ScheduleCandidate[], role: string): string[] {
  return candidates.filter((candidate) => getCandidateRole(candidate) === role).map(getCandidateDisplay);
}

function roomsOf(candidates: readonly ScheduleCandidate[]): string[] {
  return namesOfRole(candidates, 'room');
}

function providersOf(candidates: readonly ScheduleCandidate[]): string[] {
  return namesOfRole(candidates, 'provider');
}

function devicesOf(candidates: readonly ScheduleCandidate[]): string[] {
  return namesOfRole(candidates, 'device');
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

  test('Sorts each role by name, which is the order its field lists them in', () => {
    const groups = groupCandidatesByRole([
      candidateOf(DrOkaforSchedule, 'Practitioner', 'Dr. Tunde Okafor'),
      candidateOf(Ultrasound1Schedule, 'Device', 'Ultrasound 1'),
      candidateOf(DrRiveraSchedule, 'Practitioner', 'Dr. Maya Rivera'),
    ]);

    expect(groups[0].candidates.map(getCandidateDisplay)).toStrictEqual(['Dr. Maya Rivera', 'Dr. Tunde Okafor']);
  });

  test('Omits roles with no schedules', () => {
    expect(groupCandidatesByRole([])).toStrictEqual([]);
  });
});

/**
 * Builds a candidate the way a search would have, on a schedule of the given
 * actor type.
 *
 * The actor is written onto the Schedule rather than held beside it, because
 * that is where a candidate's role and name are now read back from.
 *
 * @param schedule - The Schedule to rewrite the actor of.
 * @param actorType - The resource type to hold the schedule on.
 * @param actorDisplay - The actor's name, as the Schedule records it.
 * @returns The candidate.
 */
function candidateOf(
  schedule: WithId<Schedule>,
  actorType: 'Practitioner' | 'PractitionerRole' | 'Location' | 'Device',
  actorDisplay: string
): ScheduleCandidate {
  return {
    schedule: { ...schedule, actor: [{ reference: `${actorType}/${schedule.id}`, display: actorDisplay }] },
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

describe('candidate fields', () => {
  test('Names an actor by the Schedule display, then the resource, then the reference', () => {
    const named = candidateOf(DrRiveraSchedule, 'Practitioner', 'Dr. Maya Rivera');
    expect(getCandidateDisplay(named)).toBe('Dr. Maya Rivera');

    // A Schedule that does not name its actor falls back to the resource the
    // search included, and to the bare reference when it included none.
    const bare: ScheduleCandidate = {
      schedule: { ...DrRiveraSchedule, actor: [{ reference: 'Practitioner/dr-rivera' }] },
      actorResource: { resourceType: 'Practitioner', id: 'dr-rivera', name: [{ given: ['Maya'], family: 'Rivera' }] },
    };
    expect(getCandidateDisplay(bare)).toBe('Maya Rivera');
    expect(getCandidateDisplay({ ...bare, actorResource: undefined })).toBe('Practitioner/dr-rivera');
  });

  test('Reads the role from the actor type, and says nothing for a type nothing books', () => {
    expect(getCandidateRole(candidateOf(DrRiveraSchedule, 'PractitionerRole', 'Dr. Maya Rivera'))).toBe('provider');
    expect(getCandidateRole(candidateOf(Ultrasound1Schedule, 'Device', 'Ultrasound 1'))).toBe('device');
    expect(
      getCandidateRole({
        schedule: { ...DrRiveraSchedule, actor: [{ reference: 'Patient/example' }] },
        actorResource: undefined,
      })
    ).toBeUndefined();
  });
});
