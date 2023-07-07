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
  QuestionnaireItem,
  Resource,
  StructureDefinition,
  SubstanceProtein,
  ValueSet,
} from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validate } from './validation';
import { indexStructureDefinitionBundle } from '../types';
import { readJson } from '@medplum/definitions';
import { loadDataTypes } from './types';
import { OperationOutcomeError } from '../outcomes';
import { createReference } from '../utils';

describe('FHIR resource validation', () => {
  let observationProfile: StructureDefinition;
  let patientProfile: StructureDefinition;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    loadDataTypes(readJson('fhir/r4/profiles-types.json') as Bundle<StructureDefinition>);
    loadDataTypes(readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>);

    observationProfile = JSON.parse(
      readFileSync(resolve(__dirname, '__test__', 'us-core-blood-pressure.json'), 'utf8')
    );
    patientProfile = JSON.parse(readFileSync(resolve(__dirname, '__test__', 'us-core-patient.json'), 'utf8'));
  });

  test('Invalid resource', () => {
    expect(() => {
      validate(undefined as unknown as Patient);
    }).toThrow();
    expect(() => {
      validate({} as unknown as Patient);
    }).toThrow();
  });

  test('Valid base resource', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      gender: 'unknown',
      birthDate: '1949-08-14',
    };
    expect(() => {
      validate(patient);
    }).not.toThrow();
  });

  test('Invalid cardinality', () => {
    const invalidMultiple: Patient = {
      resourceType: 'Patient',
      gender: ['male', 'female'],
      birthDate: '1949-08-14',
    } as unknown as Patient;
    const invalidSingle: Patient = {
      resourceType: 'Patient',
      identifier: {
        system: 'http://example.com',
        value: 'I12345',
      },
    } as unknown as Patient;
    expect(() => {
      validate(invalidMultiple);
    }).toThrow();
    expect(() => {
      validate(invalidSingle);
    }).toThrow();
  });

  test('Invalid value type', () => {
    const invalidType: Patient = {
      resourceType: 'Patient',
      birthDate: Date.parse('1949-08-14'),
    } as unknown as Patient;
    expect(() => {
      validate(invalidType);
    }).toThrow();
  });

  test('Invalid string format', () => {
    const invalidFormat: Patient = {
      resourceType: 'Patient',
      birthDate: 'Aug 14, 1949',
    };
    expect(() => {
      validate(invalidFormat);
    }).toThrow();
  });

  test('Invalid numeric value', () => {
    const patientExtension: Patient = {
      resourceType: 'Patient',
      multipleBirthInteger: 4.2,
    };
    expect(() => {
      validate(patientExtension);
    }).toThrow();
  });

  test('Invalid extraneous property', () => {
    const invalidFormat = {
      resourceType: 'Patient',
      foo: 'bar',
    } as unknown as Patient;
    expect(() => {
      validate(invalidFormat);
    }).toThrow();
  });

  test('Valid property name special cases', () => {
    const primitiveExtension = {
      resourceType: 'Patient',
      _birthDate: {
        extension: [
          {
            url: 'http://example.com/data-missing-reason',
            valueString: 'Forgot to ask patient at check-in',
          },
        ],
      },
    } as unknown as Patient;
    const choiceType: Patient = {
      resourceType: 'Patient',
      deceasedBoolean: false,
    };
    expect(() => {
      validate(primitiveExtension);
    }).not.toThrow();
    expect(() => {
      validate(choiceType);
    }).not.toThrow();
  });

  test('Valid resource with extension', () => {
    const patientExtension: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: 'http://example.com/ext',
          valuePositiveInt: 1,
        },
      ],
    };
    expect(() => {
      validate(patientExtension);
    }).not.toThrow();
  });

  test('Valid resource under constraining profile', () => {
    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              code: 'vital-signs',
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            code: '85354-9',
            system: 'http://loinc.org',
          },
        ],
      },
      subject: {
        reference: 'Patient/example',
      },
      effectiveDateTime: '2023-05-31T17:03:45-07:00',
      component: [
        {
          dataAbsentReason: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
          code: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
        },
        {
          dataAbsentReason: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
          code: {
            coding: [
              {
                code: '8462-4',
                system: 'http://loinc.org',
              },
            ],
          },
        },
      ],
    };

    expect(() => {
      validate(observation, observationProfile);
    }).not.toThrow();
  });

  test('Invalid cardinality', () => {
    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              code: 'vital-signs',
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            code: '85354-9',
            system: 'http://loinc.org',
          },
        ],
      },
      subject: {
        reference: 'Patient/example',
      },
      effectiveDateTime: '2023-05-31T17:03:45-07:00',
      component: [
        // Should have two components
        {
          code: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
        },
      ],
    };

    expect(() => {
      validate(observation, observationProfile);
    }).toThrow('Invalid number of values: expected 2..*, but found 1 (Observation.component)');
  });

  test('Invalid resource under pattern fields profile', () => {
    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              code: 'vital-signs',
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            code: '85354-9',
            system: 'http://incorrect.system',
          },
        ],
      },
      subject: {
        reference: 'Patient/example',
      },
      effectiveDateTime: '2023-05-31T17:03:45-07:00',
      component: [
        {
          code: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
        },
        {
          code: {
            coding: [
              {
                code: '8462-4',
                system: 'http://loinc.org',
              },
            ],
          },
        },
      ],
    };

    expect(() => {
      validate(observation, observationProfile);
    }).toThrow();
  });

  test('Invalid slice contents', () => {
    const observation: Observation = {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              code: 'vital-signs',
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            code: '85354-9',
            system: 'http://loinc.org',
          },
        ],
      },
      subject: {
        reference: 'Patient/example',
      },
      effectiveDateTime: '2023-05-31T17:03:45-07:00',
      component: [
        {
          code: {
            coding: [
              {
                code: '8480-6',
                system: 'http://loinc.org',
              },
            ],
          },
        },
        {
          code: {
            coding: [
              {
                code: 'wrong code',
                system: 'http://loinc.org',
              },
            ],
          },
        },
      ],
    };

    expect(() => {
      validate(observation, observationProfile);
    }).toThrow(
      `Incorrect number of values provided for slice 'diastolic': expected 1..1, but found 0 (Observation.component)`
    );
  });

  test('StructureDefinition', () => {
    const structureDefinition = readJson('fhir/r4/profiles-resources.json') as Bundle;
    expect(() => {
      validate(structureDefinition);
    }).not.toThrow();
  });

  test('Profile with restriction on base type field', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      identifier: [
        {
          system: 'http://example.com',
          value: 'foo',
        },
      ],
      telecom: [
        {
          // Missing system property
          value: '555-555-5555',
        },
      ],
      gender: 'unknown',
      name: [
        {
          given: ['Test'],
          family: 'Patient',
        },
      ],
    };
    expect(() => {
      validate(patient, patientProfile);
    }).toThrow(new Error('Missing required property (Patient.telecom.system)'));
  });

  test('Valid resource with nulls in primitive extension', () => {
    expect(() => {
      validate({
        resourceType: 'Patient',
        name: [
          {
            given: ['John', null],
            _given: [null, { extension: [{ url: 'http://example.com', valueString: 'foo' }] }],
          },
        ],
      } as unknown as Patient);
    }).not.toThrow();
  });

  test('Valid ValueSet (content reference with altered cardinality', () => {
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      id: 'observation-status',
      meta: {
        lastUpdated: '2019-11-01T09:29:23.356+11:00',
        profile: ['http://hl7.org/fhir/StructureDefinition/shareablevalueset'],
      },
      url: 'http://hl7.org/fhir/ValueSet/observation-status',
      identifier: [
        {
          system: 'urn:ietf:rfc:3986',
          value: 'urn:oid:2.16.840.1.113883.4.642.3.400',
        },
      ],
      version: '4.0.1',
      name: 'ObservationStatus',
      title: 'ObservationStatus',
      status: 'active',
      experimental: false,
      date: '2019-11-01T09:29:23+11:00',
      publisher: 'HL7 (FHIR Project)',
      contact: [
        {
          telecom: [
            {
              system: 'url',
              value: 'http://hl7.org/fhir',
            },
            {
              system: 'email',
              value: 'fhir@lists.hl7.org',
            },
          ],
        },
      ],
      description: 'Codes providing the status of an observation.',
      immutable: true,
      compose: {
        include: [
          {
            system: 'http://hl7.org/fhir/observation-status',
          },
        ],
      },
    };
    expect(() => validate(valueSet)).not.toThrow();
  });
});

describe('Legacy tests for parity checking', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
  });

  test('validateResource', () => {
    expect(() => validate(null as unknown as Resource)).toThrow();
    expect(() => validate({} as unknown as Resource)).toThrow();
    expect(() => validate({ resourceType: 'FakeResource' } as unknown as Resource)).toThrow();
    expect(() => validate({ resourceType: 'Patient' })).not.toThrow();
  });

  test('Array properties', () => {
    expect(() => validate({ resourceType: 'Patient', name: [{ given: ['Homer'] }] })).not.toThrow();

    try {
      validate({ resourceType: 'Patient', name: 'Homer' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name');
    }
  });

  test('Additional properties', () => {
    expect(() => validate({ resourceType: 'Patient', name: [{ given: ['Homer'] }], meta: {} })).not.toThrow();

    try {
      validate({ resourceType: 'Patient', fakeProperty: 'test' } as unknown as Resource);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.fakeProperty');
    }
  });

  test('Required properties', () => {
    try {
      validate({ resourceType: 'DiagnosticReport' });
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
      validate({ resourceType: 'Patient', name: null } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name');
    }
  });

  test('Null array element', () => {
    try {
      validate({ resourceType: 'Patient', name: [null] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name[0]');
    }
  });

  test('Undefined array element', () => {
    try {
      validate({ resourceType: 'Patient', name: [{ given: [undefined] }] } as unknown as Patient);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.name[0].given[0]');
    }
  });

  test('Nested null array element', () => {
    try {
      validate({
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
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Patient.identifier[0].system');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.expression?.[0]).toEqual('Patient.name[1].given[1]');
    }
  });

  test('Deep nested null array element', () => {
    try {
      validate({
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
      expect(outcome.issue?.length).toEqual(2);
      expect(outcome.issue?.[0]?.severity).toEqual('error');
      expect(outcome.issue?.[0]?.details?.text).toEqual('Invalid null value');
      expect(outcome.issue?.[0]?.expression?.[0]).toEqual('Questionnaire.item[0].item[0].item[0].item[0].item');
      expect(outcome.issue?.[1]?.severity).toEqual('error');
      expect(outcome.issue?.[1]?.code).toEqual('invariant');
    }
  });

  test('Primitive types', () => {
    try {
      validate({
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
    expect(() => validate(binary)).toThrowError('Invalid JSON type: expected string, but got number (Binary.data)');

    binary.data = '===';
    expect(() => validate(binary)).toThrowError('Invalid base64Binary format');

    binary.data = 'aGVsbG8=';
    expect(() => validate(binary)).not.toThrow();
  });

  test('boolean', () => {
    const patient: Patient = { resourceType: 'Patient' };

    patient.active = 123 as unknown as boolean;
    expect(() => validate(patient)).toThrowError(
      'Invalid JSON type: expected boolean, but got number (Patient.active)'
    );

    patient.active = true;
    expect(() => validate(patient)).not.toThrow();

    patient.active = false;
    expect(() => validate(patient)).not.toThrow();
  });

  test('date', () => {
    const patient: Patient = { resourceType: 'Patient' };

    patient.birthDate = 123 as unknown as string;
    expect(() => validate(patient)).toThrowError(
      'Invalid JSON type: expected string, but got number (Patient.birthDate)'
    );

    patient.birthDate = 'x';
    expect(() => validate(patient)).toThrowError('Invalid date format');

    patient.birthDate = '2000-01-01';
    expect(() => validate(patient)).not.toThrow();
  });

  test('dateTime', () => {
    const condition: Condition = { resourceType: 'Condition', subject: { reference: 'Patient/1' } };

    condition.recordedDate = 123 as unknown as string;
    expect(() => validate(condition)).toThrowError(
      'Invalid JSON type: expected string, but got number (Condition.recordedDate)'
    );

    condition.recordedDate = 'x';
    expect(() => validate(condition)).toThrowError('Invalid dateTime format');

    condition.recordedDate = '2022-02-02';
    expect(() => validate(condition)).not.toThrow();

    condition.recordedDate = '2022-02-02T12:00:00-04:00';
    expect(() => validate(condition)).not.toThrow();

    condition.recordedDate = '2022-02-02T12:00:00Z';
    expect(() => validate(condition)).not.toThrow();
  });

  test('decimal', () => {
    const media: Media = { resourceType: 'Media', status: 'completed', content: { title: 'x' } };

    media.duration = 'x' as unknown as number;
    expect(() => validate(media)).toThrowError('Invalid JSON type: expected number, but got string (Media.duration)');

    media.duration = NaN;
    expect(() => validate(media)).toThrowError('Invalid numeric value (Media.duration)');

    media.duration = Infinity;
    expect(() => validate(media)).toThrowError('Invalid numeric value (Media.duration)');

    media.duration = 123.5;
    expect(() => validate(media)).not.toThrow();
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
    expect(() => validate(ig)).toThrowError(
      'Invalid JSON type: expected string, but got number (ImplementationGuide.packageId)'
    );

    ig.packageId = '$';
    expect(() => validate(ig)).toThrowError('Invalid id format');

    ig.packageId = 'foo';
    expect(() => validate(ig)).not.toThrow();
  });

  test('instant', () => {
    const obs: Observation = { resourceType: 'Observation', status: 'final', code: { text: 'x' } };

    obs.issued = 123 as unknown as string;
    expect(() => validate(obs)).toThrowError('Invalid JSON type: expected string, but got number (Observation.issued)');

    obs.issued = 'x';
    expect(() => validate(obs)).toThrowError('Invalid instant format');

    obs.issued = '2022-02-02';
    expect(() => validate(obs)).toThrowError('Invalid instant format');

    obs.issued = '2022-02-02T12:00:00-04:00';
    expect(() => validate(obs)).not.toThrow();

    obs.issued = '2022-02-02T12:00:00Z';
    expect(() => validate(obs)).not.toThrow();
  });

  test('integer', () => {
    const sp: SubstanceProtein = { resourceType: 'SubstanceProtein' };

    sp.numberOfSubunits = 'x' as unknown as number;
    expect(() => validate(sp)).toThrowError(
      'Invalid JSON type: expected number, but got string (SubstanceProtein.numberOfSubunits)'
    );

    sp.numberOfSubunits = NaN;
    expect(() => validate(sp)).toThrowError('Invalid numeric value (SubstanceProtein.numberOfSubunits)');

    sp.numberOfSubunits = Infinity;
    expect(() => validate(sp)).toThrowError('Invalid numeric value (SubstanceProtein.numberOfSubunits)');

    sp.numberOfSubunits = 123.5;
    expect(() => validate(sp)).toThrowError('Expected number to be an integer (SubstanceProtein.numberOfSubunits)');

    sp.numberOfSubunits = 10;
    expect(() => validate(sp)).not.toThrow();
  });

  test('string', () => {
    const acct: Account = { resourceType: 'Account', status: 'active' };

    acct.name = 123 as unknown as string;
    expect(() => validate(acct)).toThrowError('Invalid JSON type: expected string, but got number (Account.name)');

    acct.name = '    ';
    expect(() => validate(acct)).toThrowError('String must contain non-whitespace content (Account.name)');

    acct.name = 'test';
    expect(() => validate(acct)).not.toThrow();
  });

  test('positiveInt', () => {
    const patient: Patient = { resourceType: 'Patient' };
    const patientReference = createReference(patient);
    const appt: Appointment = {
      resourceType: 'Appointment',
      status: 'booked',
      participant: [{ status: 'accepted', actor: patientReference }],
    };

    appt.minutesDuration = 'x' as unknown as number;
    expect(() => validate(appt)).toThrowError(
      'Invalid JSON type: expected number, but got string (Appointment.minutesDuration)'
    );

    appt.minutesDuration = NaN;
    expect(() => validate(appt)).toThrowError('Invalid numeric value (Appointment.minutesDuration)');

    appt.minutesDuration = Infinity;
    expect(() => validate(appt)).toThrowError('Invalid numeric value (Appointment.minutesDuration)');

    appt.minutesDuration = 123.5;
    expect(() => validate(appt)).toThrowError('Expected number to be an integer (Appointment.minutesDuration)');

    appt.minutesDuration = -1;
    expect(() => validate(appt)).toThrowError('Expected number to be positive (Appointment.minutesDuration)');

    appt.minutesDuration = 0;
    expect(() => validate(appt)).toThrowError('Expected number to be positive (Appointment.minutesDuration)');

    appt.minutesDuration = 10;
    expect(() => validate(appt)).not.toThrow();
  });

  test('unsignedInt', () => {
    const patient: Patient = { resourceType: 'Patient' };
    const patientReference = createReference(patient);
    const appt: Appointment = {
      resourceType: 'Appointment',
      status: 'booked',
      participant: [{ status: 'accepted', actor: patientReference }],
    };

    appt.priority = 'x' as unknown as number;
    expect(() => validate(appt)).toThrowError(
      'Invalid JSON type: expected number, but got string (Appointment.priority)'
    );

    appt.priority = NaN;
    expect(() => validate(appt)).toThrowError('Invalid numeric value (Appointment.priority)');

    appt.priority = Infinity;
    expect(() => validate(appt)).toThrowError('Invalid numeric value (Appointment.priority)');

    appt.priority = 123.5;
    expect(() => validate(appt)).toThrowError('Expected number to be an integer (Appointment.priority)');

    appt.priority = -1;
    expect(() => validate(appt)).toThrowError('Expected number to be non-negative (Appointment.priority)');

    appt.priority = 0;
    expect(() => validate(appt)).not.toThrow();

    appt.priority = 10;
    expect(() => validate(appt)).not.toThrow();
  });

  test('BackboneElement', () => {
    try {
      validate({
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
      validate(structureDefinition);
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      console.log(JSON.stringify(outcome, null, 2).substring(0, 1000));
    }
  });

  test('Choice of type', () => {
    // Observation.value[x]
    expect(() =>
      validate({ resourceType: 'Observation', status: 'final', code: { text: 'x' }, valueString: 'xyz' })
    ).not.toThrow();
    expect(() =>
      validate({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'x' },
        valueDateTime: '2020-01-01T00:00:00Z',
      })
    ).not.toThrow();
    expect(() =>
      validate({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'x' },
        valueXyz: 'xyz',
      } as unknown as Observation)
    ).toThrow();

    // Patient.multipleBirth[x] is a choice of boolean or integer
    expect(() => validate({ resourceType: 'Patient', multipleBirthBoolean: true })).not.toThrow();
    expect(() => validate({ resourceType: 'Patient', multipleBirthInteger: 2 })).not.toThrow();
    expect(() => validate({ resourceType: 'Patient', multipleBirthXyz: 'xyz' } as unknown as Patient)).toThrow();
  });

  test('Primitive element', () => {
    expect(() =>
      validate({
        resourceType: 'Patient',
        birthDate: '1990-01-01',
        _birthDate: { id: 'foo' },
      } as unknown as Patient)
    ).not.toThrow();
    expect(() =>
      validate({
        resourceType: 'Patient',
        _birthDate: '1990-01-01',
      } as unknown as Patient)
    ).toThrow();
    expect(() => {
      return validate({ resourceType: 'Patient', _birthDate: { id: 'foo' } } as unknown as Patient);
    }).not.toThrow();
    expect(() => validate({ resourceType: 'Patient', _xyz: {} } as unknown as Patient)).toThrow();
    expect(() =>
      validate({
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          { linkId: 'test', type: 'string', text: 'test', _text: { extension: [] } } as unknown as QuestionnaireItem,
        ],
      })
    ).not.toThrow();
  });

  test('Array mismatch', () => {
    // Send an array for a single value property
    expect(() => validate({ resourceType: 'Patient', birthDate: ['1990-01-01'] as unknown as string })).toThrow(
      'Expected single value for property (Patient.birthDate)'
    );

    // Send a single value for an array property
    expect(() => validate({ resourceType: 'Patient', name: { family: 'foo' } as unknown as HumanName[] })).toThrow(
      'Expected array of values for property (Patient.name)'
    );
  });
});

function fail(reason: string): never {
  throw new Error(reason);
}
