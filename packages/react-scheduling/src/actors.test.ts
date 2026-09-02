// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getActorType, getActorTypeLabel } from './actors';

describe('getActorType', () => {
  test('Location', () => expect(getActorType({ reference: 'Location/123' })).toEqual('Location'));
  test('Practitioner', () => expect(getActorType({ reference: 'Practitioner/456' })).toEqual('Practitioner'));
  test('Device', () =>
    expect(getActorType({ reference: 'Device/789', display: 'Ultrasound machine 1' })).toEqual('Device'));
  test('Unsupported reference', () => expect(() => getActorType({ display: 'My Weird Reference' })).toThrow());
});

describe('getActorTypeLabel', () => {
  test('Device', () => expect(getActorTypeLabel('Device')).toEqual('Device'));
  test('HealthcareService', () => expect(getActorTypeLabel('HealthcareService')).toEqual('Healthcare Service'));
  test('Location', () => expect(getActorTypeLabel('Location')).toEqual('Room'));
  test('Patient', () => expect(getActorTypeLabel('Patient')).toEqual('Patient'));
  test('Practitioner', () => expect(getActorTypeLabel('Practitioner')).toEqual('Provider'));
  test('PractitionerRole', () => expect(getActorTypeLabel('PractitionerRole')).toEqual('Practitioner Role'));
  test('RelatedPerson', () => expect(getActorTypeLabel('RelatedPerson')).toEqual('Related Person'));
});
