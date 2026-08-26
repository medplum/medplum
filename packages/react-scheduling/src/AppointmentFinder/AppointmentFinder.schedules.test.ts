// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ServiceTypeReferenceURI } from '@medplum/core';
import type { Device, HealthcareService, Location, Practitioner, PractitionerRole, Schedule } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  APPOINTMENT_TYPE_SYSTEM,
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
import type { SchedulingRole } from './AppointmentFinder.roles';
import type { ActorSelections, ScheduleCandidate } from './AppointmentFinder.schedules';
import {
  getActorCombinations,
  getCandidateDisplay,
  getCandidateRole,
  getSelectedCandidates,
  getSelectionError,
  searchScheduleCandidates,
} from './AppointmentFinder.schedules';
import { getActorsKey } from './AppointmentFinder.times';

async function setupClient(): Promise<MockClient> {
  const medplum = new MockClient();
  for (const resource of SchedulingFixtures) {
    await medplum.createResource(resource);
  }
  // Spy added so `querySentTo` can read the search criteria
  vi.spyOn(medplum, 'search');
  return medplum;
}

/**
 * The query one search was sent, as the field's own code wrote it.
 * @param medplum - The stubbed client.
 * @param index - Which search to read. Defaults to the first.
 * @returns The search criteria.
 */
function querySentTo(medplum: MockClient, index = 0): Record<string, string> {
  return vi.mocked(medplum.search).mock.calls[index][1] as Record<string, string>;
}

/**
 * Runs the search the way a field does, for one role.
 * @param medplum - The client to search with.
 * @param service - The service being booked.
 * @param role - The role whose actors to offer.
 * @param options - How the field was left when it searched.
 * @param options.query - The text typed into the field.
 * @param options.location - The site being booked at.
 * @returns The candidates the field would list.
 */
async function candidatesFor(
  medplum: MockClient,
  service: WithId<HealthcareService>,
  role: SchedulingRole,
  options?: { query?: string; location?: WithId<Location> }
): Promise<ScheduleCandidate[]> {
  return searchScheduleCandidates(medplum, service, {
    role,
    query: options?.query ?? '',
    location: options?.location,
  });
}

// Adds the surgical service, whose providers hold a Practitioner carrying the
// schedule and a PractitionerRole naming where they practice.
async function setupSurgicalClient(): Promise<MockClient> {
  const medplum = await setupClient();
  for (const resource of SurgicalFixtures) {
    await medplum.createResource(resource);
  }
  return medplum;
}

/**
 * Adds a surgeon sited by their role rather than by their schedule.
 *
 * This is the split the filter reads: the Schedule is held on the Practitioner,
 * so the person has one calendar, and the PractitionerRole says where they
 * practice.
 *
 * @param medplum - The client to create into.
 * @param display - The name the Schedule gives its actor.
 * @param locations - Location references the role names, or undefined for a role
 *   that names none.
 */
async function addSitedSurgeon(medplum: MockClient, display: string, locations?: string[]): Promise<void> {
  const practitioner = await medplum.createResource<Practitioner>({
    resourceType: 'Practitioner',
    name: [{ given: ['Wei'], family: 'Chen', prefix: ['Dr.'] }],
  });
  await medplum.createResource<PractitionerRole>({
    ...DrChenRole,
    id: undefined,
    practitioner: { reference: `Practitioner/${practitioner.id}` },
    location: locations?.map((reference) => ({ reference })),
  });
  await medplum.createResource<Schedule>({
    ...DrChenSchedule,
    id: undefined,
    actor: [{ reference: `Practitioner/${practitioner.id}`, display }],
  });
}

describe('searchScheduleCandidates', () => {
  test('Asks the server for the schedules of a named actor of the role’s type', async () => {
    const medplum = await setupClient();

    await candidatesFor(medplum, UltrasoundImagingService, 'provider', { query: 'riv' });

    // One request, narrowed to the role's actor type and to the name typed, so
    // how many schedules the practice has configured never decides how many of
    // them can be reached.
    expect(medplum.search).toHaveBeenCalledTimes(1);
    expect(querySentTo(medplum)).toMatchObject({
      'service-type': expect.stringContaining('|'),
      'actor:Practitioner.active:not': 'false',
      'actor:Practitioner.name': 'riv',
      'active:not': 'false',
      _include: 'Schedule:actor',
      _count: '25',
    });
  });

  test('Asks for every one of the service’s type codes in one search', async () => {
    const medplum = await setupClient();

    // A service carrying a second type code, and a provider linked to it by that
    // code alone.
    const service: WithId<HealthcareService> = {
      ...UltrasoundImagingService,
      type: [
        ...(UltrasoundImagingService.type ?? []),
        { coding: [{ system: APPOINTMENT_TYPE_SYSTEM, code: 'vascular-study' }] },
      ],
    };
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Ada'], family: 'Vance', prefix: ['Dr.'] }],
    });
    await medplum.createResource<Schedule>({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: `Practitioner/${practitioner.id}`, display: 'Dr. Ada Vance' }],
      serviceType: [
        {
          coding: [{ system: APPOINTMENT_TYPE_SYSTEM, code: 'vascular-study' }],
          extension: [
            { url: ServiceTypeReferenceURI, valueReference: { reference: `HealthcareService/${service.id}` } },
          ],
        },
      ],
    });

    const candidates = await candidatesFor(medplum, service, 'provider');

    // Comma-separated tokens are an OR, so both codes are one request, and a
    // schedule linked by either of them is offered.
    expect(medplum.search).toHaveBeenCalledTimes(1);
    expect(querySentTo(medplum)['service-type']).toBe(
      `${APPOINTMENT_TYPE_SYSTEM}|ultrasound-imaging,${APPOINTMENT_TYPE_SYSTEM}|vascular-study`
    );
    expect(providersOf(candidates)).toStrictEqual(['Dr. Ada Vance', 'Dr. Maya Rivera', 'Dr. Tunde Okafor']);
  });

  test('Leaves the name out when nothing has been typed, but still asks by role', async () => {
    // The unfiltered query is what tells a field whether the service has anybody
    // for its role at all, so it has to stay scoped to that role's actor type.
    const medplum = await setupClient();

    await candidatesFor(medplum, UltrasoundImagingService, 'room');

    expect(querySentTo(medplum)).toMatchObject({ 'actor:Location.status:not': 'inactive' });
    expect(querySentTo(medplum)).not.toHaveProperty('actor:Location.name');
  });

  test('Searches a device by the name a device is found under', async () => {
    // A Device has no `name`; `device-name` reaches its deviceName and its type.
    const medplum = await setupClient();

    await candidatesFor(medplum, UltrasoundImagingService, 'device', { query: 'ultra' });

    expect(querySentTo(medplum)).toMatchObject({
      'actor:Device.status:not': 'inactive',
      'actor:Device.device-name': 'ultra',
    });
  });

  test('Offers only the schedules of the role that was asked for', async () => {
    const medplum = await setupClient();

    expect(providersOf(await candidatesFor(medplum, UltrasoundImagingService, 'provider'))).toStrictEqual([
      'Dr. Maya Rivera',
      'Dr. Tunde Okafor',
    ]);
    expect(roomsOf(await candidatesFor(medplum, UltrasoundImagingService, 'room'))).toStrictEqual([
      'Exam Room A',
      'Exam Room B',
      'Satellite Exam Room',
    ]);
    expect(devicesOf(await candidatesFor(medplum, UltrasoundImagingService, 'device'))).toStrictEqual([
      'Ultrasound 1 (Main Campus)',
      'Ultrasound 2 (Main Campus)',
    ]);
  });

  test('Narrows to the actors whose name matches what was typed', async () => {
    const medplum = await setupClient();

    const candidates = await candidatesFor(medplum, UltrasoundImagingService, 'provider', { query: 'riv' });

    expect(candidates.map(getCandidateDisplay)).toStrictEqual(['Dr. Maya Rivera']);
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

    const candidates = await candidatesFor(medplum, UltrasoundImagingService, 'provider');

    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.schedule.serviceType?.[0].extension?.length)).toBe(true);
  });

  test('Names an actor whose reference carries no display', async () => {
    const medplum = await setupClient();
    const bare = await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Practitioner/dr-okafor' }],
    });

    const candidates = await candidatesFor(medplum, UltrasoundImagingService, 'provider');
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

    expect(await candidatesFor(medplum, UltrasoundImagingService, 'provider')).toHaveLength(2);
  });

  test('Rejects a schedule held on a PractitionerRole', async () => {
    // A person with several roles has a calendar per role and nothing reconciles
    // them, so booking one role's Wednesday would leave another's on offer.
    // Providers are booked on the Practitioner instead.
    const medplum = await setupClient();
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'PractitionerRole/role-dr-rivera', display: 'Dr. Maya Rivera - Radiology' }],
    });

    const candidates = await candidatesFor(medplum, UltrasoundImagingService, 'provider');

    expect(providersOf(candidates)).toStrictEqual(['Dr. Maya Rivera', 'Dr. Tunde Okafor']);
  });

  test('Rejects a schedule held on something that cannot be booked', async () => {
    const medplum = await setupClient();
    // `$find` books against practitioners, rooms and devices. A schedule held on
    // anything else has no role to be chosen under, so it is not offered.
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Patient/homer-simpson', display: 'Homer Simpson' }],
    });

    expect(await candidatesFor(medplum, UltrasoundImagingService, 'provider')).toHaveLength(2);
  });

  test('Falls back to reading schedules when the service has no codings', async () => {
    const medplum = await setupClient();
    const untyped: WithId<HealthcareService> = { ...UltrasoundImagingService, type: undefined };

    // The link is still checked, so only the service's own schedules come back.
    expect(await candidatesFor(medplum, untyped, 'provider')).toHaveLength(2);
  });

  test('Lists actors by name, which is the order a field offers them in', async () => {
    const medplum = await setupClient();
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Practitioner/dr-rivera', display: 'Dr. Aaron Abbot' }],
    });

    expect(providersOf(await candidatesFor(medplum, UltrasoundImagingService, 'provider'))).toStrictEqual([
      'Dr. Aaron Abbot',
      'Dr. Maya Rivera',
      'Dr. Tunde Okafor',
    ]);
  });
});

describe('narrowing to a location', () => {
  test('Keeps the rooms at the clinic, however deep, and drops the rest', async () => {
    const medplum = await setupClient();

    const kept = await candidatesFor(medplum, UltrasoundImagingService, 'room', { location: MainClinic });

    // Exam Room A is directly inside the clinic and Exam Room B is a floor
    // below it; the satellite site's room is somewhere else entirely.
    expect(roomsOf(kept)).toStrictEqual(['Exam Room A', 'Exam Room B']);
  });

  test('Keeps only the other site’s room when booking there', async () => {
    const medplum = await setupClient();

    const kept = await candidatesFor(medplum, UltrasoundImagingService, 'room', { location: SatelliteClinic });

    expect(roomsOf(kept)).toStrictEqual(['Satellite Exam Room']);
  });

  test('Keeps every room when no clinic was chosen', async () => {
    const medplum = await setupClient();

    expect(await candidatesFor(medplum, UltrasoundImagingService, 'room')).toHaveLength(3);
  });

  test('Keeps a room whose ancestry cannot be read', async () => {
    const medplum = await setupClient();
    // The room itself is real — a Schedule whose actor is a dangling reference
    // is dropped by the chained actor search before location narrowing ever
    // sees it. It's the room's *parent* that is unreadable here.
    await medplum.createResource<Location>({
      resourceType: 'Location',
      id: 'orphan-room',
      name: 'Room 9',
      partOf: { reference: 'Location/gone' },
    });
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Location/orphan-room', display: 'Room 9' }],
    });

    const kept = await candidatesFor(medplum, UltrasoundImagingService, 'room', { location: MainClinic });

    // Hiding a room the user may be entitled to book is worse than showing one
    // that cannot be placed.
    expect(roomsOf(kept)).toContain('Room 9');
  });

  test('Keeps a room buried deeper than the chain is walked', async () => {
    // The walk stops after MAX_LOCATION_DEPTH hops. A room the location sits
    // above but further up than that is unverifiable, not proven to be
    // elsewhere, so the same leniency applies as to one that cannot be read.
    const medplum = await setupClient();
    for (const [id, parent] of [
      ['wing-a', 'main-clinic'],
      ['wing-b', 'wing-a'],
      ['wing-c', 'wing-b'],
      ['deep-room', 'wing-c'],
    ]) {
      await medplum.createResource<Location>({
        resourceType: 'Location',
        id,
        name: id,
        partOf: { reference: `Location/${parent}` },
      });
    }
    await medplum.createResource<Schedule>({
      ...DrRiveraSchedule,
      id: undefined,
      actor: [{ reference: 'Location/deep-room', display: 'Deep Room' }],
    });

    const kept = await candidatesFor(medplum, UltrasoundImagingService, 'room', { location: MainClinic });

    expect(roomsOf(kept)).toContain('Deep Room');
  });

  test('Keeps plain Practitioners, which say nothing about where they work', async () => {
    const medplum = await setupClient();

    const kept = await candidatesFor(medplum, UltrasoundImagingService, 'provider', { location: SatelliteClinic });

    expect(providersOf(kept)).toStrictEqual(['Dr. Maya Rivera', 'Dr. Tunde Okafor']);
  });

  test('Drops a practitioner whose role is licensed at another site', async () => {
    const medplum = await setupSurgicalClient();
    await addSitedSurgeon(medplum, 'Dr. Wei Chen (Satellite)', ['Location/satellite-clinic']);

    const kept = await candidatesFor(medplum, SurgeryService, 'provider', { location: MainClinic });

    expect(providersOf(kept)).toStrictEqual(['Dr. James Kim', 'Dr. Maria Martinez', 'Dr. Wei Chen']);
  });

  test('Sites a practitioner only where a role names the clinic itself', async () => {
    // A role naming the state the clinic sits in, or a theatre inside it, does
    // not place the person here: a practitioner's roles and their locations both
    // multiply, so reading those chains costs a request each. Comparing
    // references also leaves no room for doubt, so an unreadable one is simply
    // not the clinic rather than kept the way an unplaceable room is.
    const medplum = await setupSurgicalClient();
    await medplum.updateResource<Location>({ ...MainClinic, partOf: { reference: 'Location/state-ny' } });
    await medplum.createResource<Location>({ resourceType: 'Location', id: 'state-ny', name: 'New York' });
    await addSitedSurgeon(medplum, 'Dr. Wei Chen (NY)', ['Location/state-ny']);
    await addSitedSurgeon(medplum, 'Dr. Wei Chen (OR 3)', ['Location/or-3']);
    await addSitedSurgeon(medplum, 'Dr. Wei Chen (unknown site)', ['Location/deleted-site']);

    const kept = await candidatesFor(medplum, SurgeryService, 'provider', { location: MainClinic });

    // Only the fixture surgeons, whose roles name the clinic itself.
    expect(providersOf(kept)).toStrictEqual(['Dr. James Kim', 'Dr. Maria Martinez', 'Dr. Wei Chen']);
  });

  test('Sites providers without reading a Location, unlike rooms', async () => {
    const medplum = await setupSurgicalClient();
    await addSitedSurgeon(medplum, 'Dr. Wei Chen (OR 3)', ['Location/or-3']);
    const readReference = vi.spyOn(medplum, 'readReference');

    await candidatesFor(medplum, SurgeryService, 'provider', { location: MainClinic });

    // The role locations are compared as strings, so a long list of them costs
    // nothing beyond the one PractitionerRole search.
    expect(readReference).not.toHaveBeenCalled();

    await candidatesFor(medplum, UltrasoundImagingService, 'room', { location: MainClinic });

    // A room is one Location per candidate, which is cheap enough to walk.
    expect(readReference).toHaveBeenCalled();
  });

  test('Keeps a practitioner whose role names no location at all', async () => {
    const medplum = await setupSurgicalClient();
    await addSitedSurgeon(medplum, 'Dr. Wei Chen (unsited)');

    const kept = await candidatesFor(medplum, SurgeryService, 'provider', { location: MainClinic });

    expect(providersOf(kept)).toContain('Dr. Wei Chen (unsited)');
  });

  test('Keeps a practitioner who holds no role at all', async () => {
    // Nothing records where this person practices, so nothing rules them out.
    const medplum = await setupSurgicalClient();
    const roleless = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Ada'], family: 'Byron', prefix: ['Dr.'] }],
    });
    await medplum.createResource<Schedule>({
      ...DrChenSchedule,
      id: undefined,
      actor: [{ reference: `Practitioner/${roleless.id}`, display: 'Dr. Ada Byron' }],
    });

    const kept = await candidatesFor(medplum, SurgeryService, 'provider', { location: MainClinic });

    expect(providersOf(kept)).toContain('Dr. Ada Byron');
  });

  test('Ignores an inactive role when siting a practitioner', async () => {
    // A role the person no longer holds should not keep placing them at its site.
    const medplum = await setupSurgicalClient();
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Wei'], family: 'Chen', prefix: ['Dr.'] }],
    });
    await medplum.createResource<PractitionerRole>({
      ...DrChenRole,
      id: undefined,
      active: false,
      practitioner: { reference: `Practitioner/${practitioner.id}` },
      location: [{ reference: 'Location/main-clinic' }],
    });
    await medplum.createResource<PractitionerRole>({
      ...DrChenRole,
      id: undefined,
      practitioner: { reference: `Practitioner/${practitioner.id}` },
      location: [{ reference: 'Location/satellite-clinic' }],
    });
    await medplum.createResource<Schedule>({
      ...DrChenSchedule,
      id: undefined,
      actor: [{ reference: `Practitioner/${practitioner.id}`, display: 'Dr. Wei Chen (moved)' }],
    });

    const kept = await candidatesFor(medplum, SurgeryService, 'provider', { location: MainClinic });

    expect(providersOf(kept)).not.toContain('Dr. Wei Chen (moved)');
  });

  test('Searches every practitioner’s roles in one request, not one each', async () => {
    // Nothing else collapses a search per practitioner into one search, so the
    // batching is this function's job and worth pinning.
    const medplum = await setupSurgicalClient();
    for (const name of ['A', 'B', 'C', 'D']) {
      await addSitedSurgeon(medplum, `Dr. Theatre ${name}`, ['Location/main-clinic']);
    }
    const searchResources = vi.spyOn(medplum, 'searchResources');

    const kept = await candidatesFor(medplum, SurgeryService, 'provider', { location: MainClinic });

    // All four hold a role naming the clinic, so all four survive.
    expect(providersOf(kept).filter((name) => name.startsWith('Dr. Theatre'))).toHaveLength(4);
    expect(searchResources.mock.calls.filter(([type]) => type === 'PractitionerRole')).toHaveLength(1);
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

    const kept = await candidatesFor(medplum, UltrasoundImagingService, 'device', { location: MainClinic });

    expect(devicesOf(kept)).toStrictEqual(['Ultrasound 1 (Main Campus)', 'Ultrasound 2 (Main Campus)']);
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

/**
 * Builds a candidate the way a search would have, on a schedule of the given
 * actor type.
 *
 * A candidate's role and name are read from its Schedule's actor, which is why
 * the actor is written there and `actorResource` left unset.
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
  const RIVERA = candidateOf(DrRiveraSchedule, 'Practitioner', 'Dr. Maya Rivera');
  const OKAFOR = candidateOf(DrOkaforSchedule, 'Practitioner', 'Dr. Tunde Okafor');
  const ULTRASOUND = candidateOf(Ultrasound1Schedule, 'Device', 'Ultrasound 1');

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
    expect(schedulesOf(getActorCombinations({ provider: [OKAFOR], device: [ULTRASOUND] }))).toStrictEqual([
      ['Schedule/schedule-dr-okafor', 'Schedule/schedule-ultrasound-1'],
    ]);
  });

  test('Several actors that all attend stay in the same request', () => {
    // `$find` intersects them, so two providers and a device is one request for
    // the times all three are free — not a choice between them.
    expect(schedulesOf(getActorCombinations({ provider: [RIVERA, OKAFOR], device: [ULTRASOUND] }))).toStrictEqual([
      ['Schedule/schedule-dr-okafor', 'Schedule/schedule-dr-rivera', 'Schedule/schedule-ultrasound-1'],
    ]);
  });

  test('An optional role left empty drops out of the search', () => {
    // Holding a device nobody asked for would narrow the search to the times
    // that device happens to be free.
    expect(schedulesOf(getActorCombinations({ provider: [RIVERA], device: [] }))).toStrictEqual([
      ['Schedule/schedule-dr-rivera'],
    ]);
  });

  test('A required role left empty stops the search', () => {
    const selections: ActorSelections = { device: [ULTRASOUND] };

    // The combination is still buildable — it is the caller that must not run it.
    expect(schedulesOf(getActorCombinations(selections))).toStrictEqual([['Schedule/schedule-ultrasound-1']]);
    expect(getSelectionError(selections)).toBe('Choose at least one provider');
  });

  test('Collects what was chosen across roles, in the order they are asked about', () => {
    expect(
      getSelectedCandidates({ device: [ULTRASOUND], provider: [RIVERA, OKAFOR] }).map(getCandidateDisplay)
    ).toStrictEqual(['Dr. Maya Rivera', 'Dr. Tunde Okafor', 'Ultrasound 1']);
  });

  test('Accepts a search once a provider is chosen', () => {
    expect(getSelectionError({ provider: [RIVERA] })).toBeUndefined();
    expect(getSelectionError({})).toBe('Choose at least one provider');
  });

  test('Names everyone the appointment would be held on', () => {
    const [combination] = getActorCombinations({ provider: [RIVERA, OKAFOR], device: [ULTRASOUND] });

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
    expect(getActorCombinations({})).toStrictEqual([]);
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
