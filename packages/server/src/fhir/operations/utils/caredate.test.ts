// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, WithId } from '@medplum/core';
import { Bundle, CodeableConcept, Device, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { filterByCareDate } from './caredate';

describe('Care Date Utils', () => {
  test('filterByCareDate', () => {
    const date = '2015-06-22';
    const dateTime = '2015-06-22T12:00:00Z';
    const code: CodeableConcept = { text: 'Test' };
    const device: Reference<Device> = { reference: 'Device/123' };
    const patient: Reference<Patient> = { reference: 'Patient/123' };
    const subject = patient;
    const status = 'completed';
    const intent = 'order';

    const resources: Resource[] = [
      { resourceType: 'AllergyIntolerance', patient, recordedDate: dateTime },
      { resourceType: 'CarePlan', subject, status, intent, created: dateTime },
      { resourceType: 'ClinicalImpression', status, subject, date: dateTime },
      { resourceType: 'Condition', subject, recordedDate: dateTime },
      { resourceType: 'DeviceUseStatement', status, subject, device, recordedOn: dateTime },
      { resourceType: 'DiagnosticReport', status: 'final', code, issued: dateTime },
      { resourceType: 'Encounter', class: code, status: 'finished', period: { start: dateTime } },
      { resourceType: 'Goal', lifecycleStatus: 'completed', description: code, subject, startDate: date },
      { resourceType: 'Immunization', status, vaccineCode: code, patient, occurrenceDateTime: dateTime },
      { resourceType: 'MedicationRequest', status, intent, subject, authoredOn: dateTime },
      { resourceType: 'Observation', status: 'final', code, issued: dateTime },
      { resourceType: 'Procedure', status, subject, performedDateTime: dateTime },
      { resourceType: 'ServiceRequest', status, intent, subject, occurrenceDateTime: dateTime },
    ];

    const bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: resources.map((r) => ({ resource: { id: '123', ...r } })),
    } satisfies Bundle<WithId<Resource>>;

    const bundle1 = deepClone(bundle);
    filterByCareDate(bundle1, '2010-01-01T00:00:00Z', '2015-06-22T00:00:00Z');
    expect(bundle1.entry).toHaveLength(0);

    const bundle2 = deepClone(bundle);
    filterByCareDate(bundle2, '2015-06-22T00:00:00Z', '2015-06-22T23:59:59Z');
    expect(bundle2.entry).toHaveLength(resources.length);

    const bundle3 = deepClone(bundle);
    filterByCareDate(bundle3, '2015-06-22T23:59:59Z', '2025-03-25T23:59:59Z');
    expect(bundle3.entry).toHaveLength(0);

    const bundle4 = deepClone(bundle);
    filterByCareDate(bundle4, undefined, undefined);
    expect(bundle4.entry).toHaveLength(resources.length);
  });

  test('empty bundle', () => {
    const bundle: Bundle<WithId<Resource>> = {
      resourceType: 'Bundle',
      type: 'searchset',
    };
    filterByCareDate(bundle, '2010-01-01', '2015-06-22');
    expect(bundle.entry).toBeUndefined();
  });

  test('missing date', () => {
    const bundle: Bundle<WithId<Resource>> = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: { resourceType: 'AllergyIntolerance', id: '123', patient: { reference: 'Patient/123' } } }],
    };
    filterByCareDate(bundle, '2010-01-01', '2015-06-22');
    expect(bundle.entry).toHaveLength(1);
  });

  test('malformed date', () => {
    const bundle: Bundle<WithId<Resource>> = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'AllergyIntolerance',
            id: '123',
            patient: { reference: 'Patient/123' },
            recordedDate: '!',
          },
        },
      ],
    };
    filterByCareDate(bundle, '2010-01-01', '2015-06-22');
    expect(bundle.entry).toHaveLength(1);
  });

  test('missing expression', () => {
    const bundle: Bundle<WithId<Resource>> = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: { resourceType: 'Patient', id: '123' } }],
    };
    filterByCareDate(bundle, '2010-01-01', '2015-06-22');
    expect(bundle.entry).toHaveLength(1);
  });
});
