import {
  Account,
  Appointment,
  Binary,
  Bundle,
  Condition,
  HumanName,
  ImplementationGuide,
  Media,
  Observation,
  Patient,
  Questionnaire,
  Resource,
  SubstanceProtein,
} from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { OperationOutcomeError } from './outcomes';
import { validateResource, validateResourceType } from './schema';
import { indexStructureDefinitionBundle } from './types';

describe('FHIR schema', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
  });

  test('validateResourceType', () => {
    // Valid FHIR resource types
    expect(() => validateResourceType('Observation')).not.toThrow();
    expect(() => validateResourceType('Patient')).not.toThrow();
    expect(() => validateResourceType('ServiceRequest')).not.toThrow();

    // Custom Medplum resource types
    expect(() => validateResourceType('Login')).not.toThrow();
    expect(() => validateResourceType('User')).not.toThrow();
    expect(() => validateResourceType('Project')).not.toThrow();

    // Invalid types
    expect(() => validateResourceType('')).toThrow();
    expect(() => validateResourceType('instant')).toThrow();
    expect(() => validateResourceType('FakeResource')).toThrow();
    expect(() => validateResourceType('PatientCommunication')).toThrow();
    expect(() => validateResourceType('Patient_Communication')).toThrow();
  });

  test('validateResource', () => {
    expect(() => validateResource(null as unknown as Resource)).toThrow();
    expect(() => validateResource({} as unknown as Resource)).toThrow();
    expect(() => validateResource({ resourceType: 'FakeResource' } as unknown as Resource)).toThrow();
    expect(() => validateResource({ resourceType: 'Patient' })).not.toThrow();
  });

  test('Array properties', () => {
    expect(() => validateResource({ resourceType: 'Patient', name: [{ given: ['Homer'] }] })).not.toThrow();

    try {
      validateResource({ resourceType: 'Patient', name: 'Homer' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name');
    }
  });

  test('Additional properties', () => {
    expect(() => validateResource({ resourceType: 'Patient', name: [{ given: ['Homer'] }], meta: {} })).not.toThrow();

    try {
      validateResource({ resourceType: 'Patient', fakeProperty: 'test' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.fakeProperty');
    }
  });

  test('Required properties', () => {
    try {
      validateResource({ resourceType: 'DiagnosticReport' });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue).toHaveLength(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('DiagnosticReport.status');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('DiagnosticReport.code');
    }
  });

  test('Null value', () => {
    try {
      validateResource({ resourceType: 'Patient', name: null } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name');
    }
  });

  test('Null array element', () => {
    try {
      validateResource({ resourceType: 'Patient', name: [null] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name[0]');
    }
  });

  test('Undefined array element', () => {
    try {
      validateResource({ resourceType: 'Patient', name: [{ given: [undefined] }] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('name[0].given[0]');
    }
  });

  test('Nested null array element', () => {
    try {
      validateResource({
        resourceType: 'Patient',
        identifier: [
          {
            system: null,
          },
        ],
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
          {
            given: ['Alice', null],
            family: 'Smith',
          },
        ],
      } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.length).toBe(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('identifier[0].system');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('name[1].given[1]');
    }
  });

  test('Deep nested null array element', () => {
    try {
      validateResource({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: '1',
            type: 'group',
            item: [
              {
                linkId: '1.1',
                type: 'group',
                item: [
                  {
                    linkId: '1.1.1',
                    type: 'group',
                    item: [
                      {
                        linkId: '1.1.1.1',
                        type: 'group',
                        item: null,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      } as unknown as Questionnaire);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.length).toEqual(1);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Invalid null value');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('item[0].item[0].item[0].item[0].item');
    }
  });

  test('Primitive types', () => {
    try {
      validateResource({
        resourceType: 'Slot',
        schedule: { reference: 'Schedule/1' },
        status: 'free',
        start: 'x',
        end: 'x',
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue).toHaveLength(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Slot.start');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('Slot.end');
    }
  });

  test('base64Binary', () => {
    const binary: Binary = { resourceType: 'Binary', contentType: 'text/plain' };

    binary.data = 123 as unknown as string;
    expect(() => validateResource(binary)).toThrowError('Invalid type for base64Binary');

    binary.data = '===';
    expect(() => validateResource(binary)).toThrowError('Invalid base64Binary format');

    binary.data = 'aGVsbG8=';
    expect(() => validateResource(binary)).not.toThrow();
  });

  test('boolean', () => {
    const patient: Patient = { resourceType: 'Patient' };

    patient.active = 123 as unknown as boolean;
    expect(() => validateResource(patient)).toThrowError('Invalid type for boolean');

    patient.active = true;
    expect(() => validateResource(patient)).not.toThrow();

    patient.active = false;
    expect(() => validateResource(patient)).not.toThrow();
  });

  test('date', () => {
    const patient: Patient = { resourceType: 'Patient' };

    patient.birthDate = 123 as unknown as string;
    expect(() => validateResource(patient)).toThrowError('Invalid type for date');

    patient.birthDate = 'x';
    expect(() => validateResource(patient)).toThrowError('Invalid date format');

    patient.birthDate = '2000-01-01';
    expect(() => validateResource(patient)).not.toThrow();
  });

  test('dateTime', () => {
    const condition: Condition = { resourceType: 'Condition', subject: { reference: 'Patient/1' } };

    condition.recordedDate = 123 as unknown as string;
    expect(() => validateResource(condition)).toThrowError('Invalid type for dateTime');

    condition.recordedDate = 'x';
    expect(() => validateResource(condition)).toThrowError('Invalid dateTime format');

    condition.recordedDate = '2022-02-02';
    expect(() => validateResource(condition)).not.toThrow();

    condition.recordedDate = '2022-02-02T12:00:00-04:00';
    expect(() => validateResource(condition)).not.toThrow();

    condition.recordedDate = '2022-02-02T12:00:00Z';
    expect(() => validateResource(condition)).not.toThrow();
  });

  test('decimal', () => {
    const media: Media = { resourceType: 'Media', status: 'completed', content: { title: 'x' } };

    media.duration = 'x' as unknown as number;
    expect(() => validateResource(media)).toThrowError('Invalid type for decimal');

    media.duration = NaN;
    expect(() => validateResource(media)).toThrowError('Invalid decimal value');

    media.duration = Infinity;
    expect(() => validateResource(media)).toThrowError('Invalid decimal value');

    media.duration = 123.5;
    expect(() => validateResource(media)).not.toThrow();
  });

  test('id', () => {
    const ig: ImplementationGuide = {
      resourceType: 'ImplementationGuide',
      name: 'x',
      status: 'active',
      fhirVersion: ['4.0.1'],
      url: 'https://example.com',
    };

    ig.packageId = 123 as unknown as string;
    expect(() => validateResource(ig)).toThrowError('Invalid type for id');

    ig.packageId = '$';
    expect(() => validateResource(ig)).toThrowError('Invalid id format');

    ig.packageId = 'foo';
    expect(() => validateResource(ig)).not.toThrow();
  });

  test('instant', () => {
    const obs: Observation = { resourceType: 'Observation', status: 'final', code: { text: 'x' } };

    obs.issued = 123 as unknown as string;
    expect(() => validateResource(obs)).toThrowError('Invalid type for instant');

    obs.issued = 'x';
    expect(() => validateResource(obs)).toThrowError('Invalid instant format');

    obs.issued = '2022-02-02';
    expect(() => validateResource(obs)).toThrowError('Invalid instant format');

    obs.issued = '2022-02-02T12:00:00-04:00';
    expect(() => validateResource(obs)).not.toThrow();

    obs.issued = '2022-02-02T12:00:00Z';
    expect(() => validateResource(obs)).not.toThrow();
  });

  test('integer', () => {
    const sp: SubstanceProtein = { resourceType: 'SubstanceProtein' };

    sp.numberOfSubunits = 'x' as unknown as number;
    expect(() => validateResource(sp)).toThrowError('Invalid type for integer');

    sp.numberOfSubunits = NaN;
    expect(() => validateResource(sp)).toThrowError('Invalid integer value');

    sp.numberOfSubunits = Infinity;
    expect(() => validateResource(sp)).toThrowError('Invalid integer value');

    sp.numberOfSubunits = 123.5;
    expect(() => validateResource(sp)).toThrowError('Number is not an integer');

    sp.numberOfSubunits = 10;
    expect(() => validateResource(sp)).not.toThrow();
  });

  test('string', () => {
    const acct: Account = { resourceType: 'Account', status: 'active' };

    acct.name = 123 as unknown as string;
    expect(() => validateResource(acct)).toThrowError('Invalid type for string');

    acct.name = '    ';
    expect(() => validateResource(acct)).toThrowError('Invalid empty string');

    acct.name = 'test';
    expect(() => validateResource(acct)).not.toThrow();
  });

  test('positiveInt', () => {
    const appt: Appointment = { resourceType: 'Appointment', status: 'booked', participant: [{ status: 'accepted' }] };

    appt.minutesDuration = 'x' as unknown as number;
    expect(() => validateResource(appt)).toThrowError('Invalid type for positiveInt');

    appt.minutesDuration = NaN;
    expect(() => validateResource(appt)).toThrowError('Invalid positiveInt value');

    appt.minutesDuration = Infinity;
    expect(() => validateResource(appt)).toThrowError('Invalid positiveInt value');

    appt.minutesDuration = 123.5;
    expect(() => validateResource(appt)).toThrowError('Number is not an integer');

    appt.minutesDuration = -1;
    expect(() => validateResource(appt)).toThrowError('Number is less than or equal to zero');

    appt.minutesDuration = 0;
    expect(() => validateResource(appt)).toThrowError('Number is less than or equal to zero');

    appt.minutesDuration = 10;
    expect(() => validateResource(appt)).not.toThrow();
  });

  test('unsignedInt', () => {
    const appt: Appointment = { resourceType: 'Appointment', status: 'booked', participant: [{ status: 'accepted' }] };

    appt.priority = 'x' as unknown as number;
    expect(() => validateResource(appt)).toThrowError('Invalid type for unsignedInt');

    appt.priority = NaN;
    expect(() => validateResource(appt)).toThrowError('Invalid unsignedInt value');

    appt.priority = Infinity;
    expect(() => validateResource(appt)).toThrowError('Invalid unsignedInt value');

    appt.priority = 123.5;
    expect(() => validateResource(appt)).toThrowError('Number is not an integer');

    appt.priority = -1;
    expect(() => validateResource(appt)).toThrowError('Number is negative');

    appt.priority = 0;
    expect(() => validateResource(appt)).not.toThrow();

    appt.priority = 10;
    expect(() => validateResource(appt)).not.toThrow();
  });

  test('BackboneElement', () => {
    try {
      validateResource({
        resourceType: 'Appointment',
        status: 'booked',
        participant: [{ type: [{ text: 'x' }] }], // "status" is required
      });
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue).toHaveLength(1);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Missing required property');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Appointment.participant.status');
    }
  });

  test('StructureDefinition', () => {
    const structureDefinition = readJson('fhir/r4/profiles-resources.json') as Bundle;
    try {
      validateResource(structureDefinition);
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      console.log(JSON.stringify(outcome, null, 2)?.substring(0, 1000));
    }
  });

  test('Choice of type', () => {
    // Observation.value[x]
    expect(() =>
      validateResource({ resourceType: 'Observation', status: 'final', code: { text: 'x' }, valueString: 'xyz' })
    ).not.toThrow();
    expect(() =>
      validateResource({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'x' },
        valueDateTime: '2020-01-01T00:00:00Z',
      })
    ).not.toThrow();
    expect(() =>
      validateResource({ resourceType: 'Observation', status: 'final', code: { text: 'x' }, valueXyz: 'xyz' })
    ).toThrow();

    // Patient.multipleBirth[x] is a choice of boolean or integer
    expect(() => validateResource({ resourceType: 'Patient', multipleBirthBoolean: true })).not.toThrow();
    expect(() => validateResource({ resourceType: 'Patient', multipleBirthInteger: 2 })).not.toThrow();
    expect(() => validateResource({ resourceType: 'Patient', multipleBirthXyz: 'xyz' })).toThrow();
  });

  test('Primitive element', () => {
    expect(() => validateResource({ resourceType: 'Patient', birthDate: '1990-01-01', _birthDate: {} })).not.toThrow();
    expect(() =>
      validateResource({ resourceType: 'Patient', birthDate: '1990-01-01', _birthDate: '1990-01-01' })
    ).toThrow();
    expect(() => validateResource({ resourceType: 'Patient', _birthDate: {} })).toThrow();
    expect(() => validateResource({ resourceType: 'Patient', _xyz: {} } as unknown as Patient)).toThrow();
    expect(() =>
      validateResource({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [{ linkId: 'test', type: 'string', text: 'test', _text: { extension: [] } }],
      })
    ).not.toThrow();
  });

  test('Array mismatch', () => {
    // Send an array for a single value property
    expect(() => validateResource({ resourceType: 'Patient', birthDate: ['1990-01-01'] as unknown as string })).toThrow(
      'Expected single value for property (Patient.birthDate)'
    );

    // Send a single value for an array property
    expect(() =>
      validateResource({ resourceType: 'Patient', name: { family: 'foo' } as unknown as HumanName[] })
    ).toThrow('Expected array for property (Patient.name)');
  });
});

function readJson(filename: string): any {
  return JSON.parse(readFileSync(resolve(__dirname, '../../definitions/dist/', filename), 'utf8'));
}

function fail(reason: string): never {
  throw new Error(reason);
}
