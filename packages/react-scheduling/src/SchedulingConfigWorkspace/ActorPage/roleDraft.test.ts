// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Practitioner, PractitionerRole } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { SERVICE_FACILITY_ROLE_SYSTEM } from '../../constants';
import { buildRoleChanges, providerFacilitiesOf } from './roleDraft';

const practitioner: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'dr-smith',
  name: [{ given: ['Jane'], family: 'Smith' }],
};
const downtown = { reference: 'Location/downtown', display: 'Downtown Clinic' };
const northside = { reference: 'Location/northside', display: 'Northside' };

function role(
  id: string,
  locations: string[],
  options: { active?: boolean; own?: boolean; synced?: boolean } = {}
): WithId<PractitionerRole> {
  return {
    resourceType: 'PractitionerRole',
    id,
    meta: { versionId: '1' },
    practitioner: { reference: 'Practitioner/dr-smith' },
    location: locations.map((location) => ({ reference: `Location/${location}` })),
    specialty: [{ text: 'Urology' }],
    ...(options.active !== undefined && { active: options.active }),
    ...(options.own && { identifier: [{ system: SERVICE_FACILITY_ROLE_SYSTEM, value: 'dr-smith' }] }),
    ...(options.synced && { identifier: [{ system: 'http://example.org/provider-location-link', value: id }] }),
  };
}

describe('providerFacilitiesOf', () => {
  test('lists each service facility an active role names once, in order, and skips inactive roles', () => {
    const { facilities } = providerFacilitiesOf([
      role('own', ['downtown'], { own: true }),
      role('synced', ['northside', 'downtown'], { synced: true }),
      role('retired', ['uptown'], { active: false }),
    ]);

    expect(facilities.map((facility) => facility.reference)).toEqual(['Location/downtown', 'Location/northside']);
  });

  test("locks a service facility any other active role names, with or without an identifier, but not the workspace's", () => {
    const { locked } = providerFacilitiesOf([
      role('own', ['downtown', 'northside', 'uptown'], { own: true }),
      role('synced', ['downtown'], { synced: true }),
      role('handmade', ['northside']),
      role('retired', ['uptown'], { synced: true, active: false }),
    ]);

    expect([...locked]).toEqual(['Location/downtown', 'Location/northside']);
  });
});

describe('buildRoleChanges', () => {
  test('writes nothing when the roles already place the provider there, in any order', () => {
    const roles = [
      role('own', ['downtown', 'northside'], { own: true }),
      role('synced', ['downtown'], { synced: true }),
    ];

    expect(buildRoleChanges(roles, practitioner, [northside, downtown])).toEqual([]);
  });

  test('creates the workspace role, marked, with only the service facilities no other role names', () => {
    const [change, ...rest] = buildRoleChanges([role('synced', ['downtown'], { synced: true })], practitioner, [
      downtown,
      northside,
    ]);

    expect(rest).toEqual([]);
    expect(change).toEqual({
      draft: {
        resourceType: 'PractitionerRole',
        identifier: [{ system: SERVICE_FACILITY_ROLE_SYSTEM, value: 'dr-smith' }],
        practitioner: { reference: 'Practitioner/dr-smith', display: 'Jane Smith' },
        location: [northside],
        active: true,
      },
      ifNoneExist: `identifier=${SERVICE_FACILITY_ROLE_SYSTEM}|dr-smith`,
    });
  });

  test('adds to and removes from the workspace role, keeping the order it stores them in', () => {
    const own = role('own', ['northside', 'downtown'], { own: true });

    expect(buildRoleChanges([own], practitioner, [{ reference: 'Location/uptown' }, downtown])).toEqual([
      {
        stored: own,
        draft: {
          ...own,
          active: true,
          location: [{ reference: 'Location/downtown' }, { reference: 'Location/uptown' }],
        },
      },
    ]);
  });

  test('turns the workspace role off when it holds none, leaving its locations as stored', () => {
    const own = role('own', ['northside'], { own: true });

    expect(buildRoleChanges([own], practitioner, [])).toEqual([{ stored: own, draft: { ...own, active: false } }]);
    expect(buildRoleChanges([{ ...own, active: false }], practitioner, [])).toEqual([]);
  });

  test('turns an inactive workspace role back on rather than creating another', () => {
    const own = role('own', ['downtown'], { own: true, active: false });

    expect(buildRoleChanges([own], practitioner, [northside])).toEqual([
      { stored: own, draft: { ...own, active: true, location: [northside] } },
    ]);
  });

  test('never writes any other role, even one carrying no identifier', () => {
    const roles = [
      role('synced', ['downtown'], { synced: true }),
      role('handmade', ['northside']),
      role('retired', ['northside'], { active: false }),
    ];

    expect(buildRoleChanges(roles, practitioner, [])).toEqual([]);
  });
});
