// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getActorRoleLabel } from './AppointmentFinder.roles';

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
