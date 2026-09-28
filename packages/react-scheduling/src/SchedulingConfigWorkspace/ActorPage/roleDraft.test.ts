// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { PractitionerRole } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { buildRoleChanges, providerFacilitiesOf } from './roleDraft';

const practitioner = { reference: 'Practitioner/dr-smith', display: 'Dr. Jane Smith' };
const downtown = { reference: 'Location/downtown', display: 'Downtown Clinic' };
const northside = { reference: 'Location/northside', display: 'Northside' };

function role(
  id: string,
  locations: string[],
  options: { active?: boolean; linked?: boolean } = {}
): WithId<PractitionerRole> {
  return {
    resourceType: 'PractitionerRole',
    id,
    meta: { versionId: '1' },
    practitioner: { reference: 'Practitioner/dr-smith' },
    location: locations.map((location) => ({ reference: `Location/${location}` })),
    specialty: [{ text: 'Urology' }],
    ...(options.active !== undefined && { active: options.active }),
    ...(options.linked && { identifier: [{ system: 'http://example.org/provider-location-link', value: id }] }),
  };
}

describe('providerFacilitiesOf', () => {
  test('lists each service facility an active role names once, in order, and skips inactive roles', () => {
    const { facilities, locked } = providerFacilitiesOf([
      role('r1', ['downtown']),
      role('r2', ['northside', 'downtown/_history/3']),
      role('r3', ['uptown'], { active: false }),
    ]);

    expect(facilities.map((facility) => facility.reference)).toEqual(['Location/downtown', 'Location/northside']);
    expect([...locked]).toEqual([]);
  });

  test('locks a service facility when any active role naming it came from another system', () => {
    const { facilities, locked } = providerFacilitiesOf([
      role('mine', ['downtown']),
      role('theirs', ['downtown'], { linked: true }),
      role('retired', ['northside'], { linked: true, active: false }),
    ]);

    expect(facilities.map((facility) => facility.reference)).toEqual(['Location/downtown']);
    expect([...locked]).toEqual(['Location/downtown']);
  });
});

describe('buildRoleChanges', () => {
  test('writes nothing when the service facilities are as the roles place them', () => {
    const roles = [role('r1', ['downtown']), role('r2', ['northside'], { linked: true })];

    expect(buildRoleChanges(roles, practitioner, [downtown, northside])).toEqual([]);
  });

  test('creates a role holding only the practitioner, the service facility, and active', () => {
    const [change] = buildRoleChanges([], practitioner, [northside]);

    expect(change.stored).toBeUndefined();
    expect(change.draft).toEqual({
      resourceType: 'PractitionerRole',
      practitioner,
      location: [northside],
      active: true,
    });
  });

  test('reactivates an inactive role naming only that service facility, changing nothing else on it', () => {
    const inactive = role('r1', ['northside'], { active: false });

    const changes = buildRoleChanges(
      [role('r0', ['northside', 'downtown'], { active: false }), inactive],
      practitioner,
      [northside]
    );

    expect(changes).toEqual([{ stored: inactive, draft: { ...inactive, active: true } }]);
  });

  test("creates a role rather than reactivating another system's", () => {
    const changes = buildRoleChanges([role('theirs', ['northside'], { linked: true, active: false })], practitioner, [
      northside,
    ]);

    expect(changes).toHaveLength(1);
    expect(changes[0].stored).toBeUndefined();
  });

  test('turns off a role whose only service facility is removed, leaving everything else on it as stored', () => {
    const only = role('r1', ['northside']);

    expect(buildRoleChanges([only], practitioner, [])).toEqual([{ stored: only, draft: { ...only, active: false } }]);
  });

  test('takes a removed service facility off a role naming others', () => {
    const both = role('r1', ['downtown', 'northside']);

    expect(buildRoleChanges([both], practitioner, [downtown])).toEqual([
      { stored: both, draft: { ...both, location: [{ reference: 'Location/downtown' }] } },
    ]);
  });

  test("never changes another system's role, even for a service facility no longer listed", () => {
    expect(buildRoleChanges([role('theirs', ['downtown'], { linked: true })], practitioner, [])).toEqual([]);
  });

  test('a service facility removed and added back writes nothing', () => {
    const roles = [role('r1', ['downtown']), role('r2', ['northside'])];

    expect(buildRoleChanges(roles, practitioner, [northside, downtown])).toEqual([]);
  });
});
