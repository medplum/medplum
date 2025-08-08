// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Attachment,
  Bundle,
  CodeableConcept,
  DeviceDeviceName,
  Observation,
  ObservationDefinition,
  Patient,
  Resource,
  User,
} from '@medplum/fhirtypes';
import { ContentType } from './contenttype';
import { OperationOutcomeError } from './outcomes';
import { PropertyType } from './types';
import {
  ResourceWithCode,
  addProfileToResource,
  arrayBufferToBase64,
  arrayBufferToHex,
  calculateAge,
  calculateAgeString,
  capitalize,
  concatUrls,
  createReference,
  deepClone,
  deepEquals,
  deepIncludes,
  escapeHtml,
  findObservationInterval,
  findObservationReferenceRange,
  findObservationReferenceRanges,
  findResourceByCode,
  flatMapFilter,
  getAllQuestionnaireAnswers,
  getCodeBySystem,
  getDateProperty,
  getDisplayString,
  getExtension,
  getExtensionValue,
  getIdentifier,
  getImageSrc,
  getPathDifference,
  getQueryString,
  getQuestionnaireAnswers,
  getReferenceString,
  getWebSocketUrl,
  isComplexTypeCode,
  isEmpty,
  isLowerCase,
  isPopulated,
  isProfileResource,
  isUUID,
  isValidHostname,
  lazy,
  mapByIdentifier,
  parseReference,
  preciseEquals,
  preciseGreaterThan,
  preciseGreaterThanOrEquals,
  preciseLessThan,
  preciseLessThanOrEquals,
  preciseRound,
  resolveId,
  setCodeBySystem,
  setIdentifier,
  singularize,
  sortStringArray,
  splitN,
  stringify,
} from './utils';

if (typeof btoa === 'undefined') {
  global.btoa = function (str) {
    return Buffer.from(str).toString('base64');
  };
}

describe('Core Utils', () => {
  test('Create reference', () => {
    expect(
      createReference({
        resourceType: 'Patient',
        id: '123',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
      })
    ).toMatchObject({
      reference: 'Patient/123',
      display: 'Alice Smith',
    });

    expect(
      createReference({
        resourceType: 'Device',
        id: '123',
      })
    ).toMatchObject({
      reference: 'Device/123',
    });
  });

  test('getReferenceString', () => {
    expect(getReferenceString({ resourceType: 'Patient', id: '123' })).toBe('Patient/123');
    expect(getReferenceString({ reference: 'Patient/123' })).toBe('Patient/123');
  });

  test('resolveId', () => {
    expect(resolveId(undefined)).toBeUndefined();
    expect(resolveId({})).toBeUndefined();
    expect(resolveId({ id: '123' })).toBe('123');
    expect(resolveId({ reference: 'Patient' })).toBeUndefined();
    expect(resolveId({ reference: 'Patient/123' })).toBe('123');
  });

  test('parseReference', () => {
    expect(() => parseReference(undefined)).toThrow(OperationOutcomeError);
    expect(() => parseReference({})).toThrow(OperationOutcomeError);
    expect(() => parseReference({ id: '123' })).toThrow(OperationOutcomeError);
    expect(() => parseReference({ reference: 'Patient' })).toThrow(OperationOutcomeError);
    expect(() => parseReference({ reference: '/' })).toThrow(OperationOutcomeError);
    expect(() => parseReference({ reference: 'Patient/' })).toThrow(OperationOutcomeError);
    expect(parseReference({ reference: 'Patient/123' })).toStrictEqual(['Patient', '123']);

    // Destructuring test
    const [resourceType, id] = parseReference({ reference: 'Patient/123' });
    expect(resourceType).toStrictEqual('Patient');
    expect(id).toStrictEqual('123');
  });

  test('isProfileResource', () => {
    expect(isProfileResource({ resourceType: 'Patient' })).toStrictEqual(true);
    expect(isProfileResource({ resourceType: 'Practitioner' })).toStrictEqual(true);
    expect(isProfileResource({ resourceType: 'RelatedPerson', patient: { reference: 'Patient/123' } })).toStrictEqual(
      true
    );
    expect(isProfileResource({ resourceType: 'Observation', status: 'final', code: { text: 'test' } })).toStrictEqual(
      false
    );
  });

  test('getDisplayString', () => {
    expect(getDisplayString({ resourceType: 'Patient', name: [{ family: 'Smith' }] })).toStrictEqual('Smith');
    expect(getDisplayString({ resourceType: 'Patient', id: '123', name: [] })).toStrictEqual('Patient/123');
    expect(getDisplayString({ resourceType: 'Observation', id: '123' } as Observation)).toStrictEqual(
      'Observation/123'
    );
    expect(getDisplayString({ resourceType: 'Observation', id: '123', code: {} } as Observation)).toStrictEqual(
      'Observation/123'
    );
    expect(
      getDisplayString({ resourceType: 'Observation', id: '123', code: { text: 'TESTOSTERONE' } } as Observation)
    ).toStrictEqual('TESTOSTERONE');
    expect(getDisplayString({ resourceType: 'ClientApplication', id: '123' })).toStrictEqual('ClientApplication/123');
    expect(
      getDisplayString({
        resourceType: 'ClientApplication',
        id: '123',
        name: 'foo',
      })
    ).toStrictEqual('foo');
    expect(
      getDisplayString({
        resourceType: 'Device',
        deviceName: [{ type: 'model-name', name: 'Foo' }],
      })
    ).toStrictEqual('Foo');
    expect(getDisplayString({ resourceType: 'Device', id: '123', deviceName: [{} as DeviceDeviceName] })).toStrictEqual(
      'Device/123'
    );
    expect(getDisplayString({ resourceType: 'Device', id: '123', deviceName: [] })).toStrictEqual('Device/123');
    expect(getDisplayString({ resourceType: 'User', email: 'foo@example.com' } as User)).toStrictEqual(
      'foo@example.com'
    );
    expect(getDisplayString({ resourceType: 'User', id: '123' } as User)).toStrictEqual('User/123');
    expect(getDisplayString({ resourceType: 'Bot', id: '123', code: 'console.log()' })).toStrictEqual('Bot/123');
    expect(
      getDisplayString({
        resourceType: 'AllergyIntolerance',
        patient: { reference: 'Patient/123' },
        code: { text: 'Peanut' },
      })
    ).toStrictEqual('Peanut');
    expect(
      getDisplayString({
        resourceType: 'AllergyIntolerance',
        patient: { reference: 'Patient/123' },
        code: { coding: [{ code: 'Peanut' }] },
      })
    ).toStrictEqual('Peanut');
    expect(
      getDisplayString({
        resourceType: 'MedicationRequest',
        id: '123',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/123' },
      })
    ).toStrictEqual('MedicationRequest/123');
    expect(
      getDisplayString({
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/123' },
        medicationCodeableConcept: { text: 'foo' },
      })
    ).toStrictEqual('foo');
    expect(getDisplayString({ resourceType: 'PractitionerRole', code: [{ text: 'foo' }] })).toStrictEqual('foo');
    expect(
      getDisplayString({
        resourceType: 'Subscription',
        id: '123',
        status: 'active',
        reason: 'Test',
        criteria: '',
        channel: { type: 'rest-hook' },
      })
    ).toStrictEqual('Subscription/123');
    expect(
      getDisplayString({
        resourceType: 'Subscription',
        status: 'active',
        reason: 'Test',
        criteria: 'Observation?code=123',
        channel: { type: 'rest-hook' },
      })
    ).toStrictEqual('Observation?code=123');
  });

  const EMPTY = [true, false];
  const POPULATED = [false, true];
  test.each([
    [undefined, EMPTY],
    [null, EMPTY],

    ['', EMPTY],
    [' ', POPULATED],
    ['foo', POPULATED],

    [{}, EMPTY],
    [Object.create(null), EMPTY],
    [{ foo: 'bar' }, POPULATED],
    [{ length: 0 }, POPULATED],
    [{ length: 1 }, POPULATED],

    [[], EMPTY],
    [[undefined], POPULATED],
    [[null], POPULATED],
    [[0], POPULATED],
    [[1, 2, 3], POPULATED],

    [NaN, [false, false]],
    [123, [false, false]],
    [5.5, [false, false]],
    [true, [false, false]],
    [false, [false, false]],
  ])('for %j, [isEmpty, isPopulated] should be %j', (input: any, expected: any) => {
    const [emptyExpected, populatedExpected] = expected;

    expect(isEmpty(input)).toBe(emptyExpected);
    expect(isPopulated(input)).toBe(populatedExpected);
  });

  test('getImageSrc', () => {
    expect(getImageSrc({ resourceType: 'Observation' } as Observation)).toBeUndefined();
    expect(getImageSrc({ resourceType: 'Patient' })).toBeUndefined();
    expect(getImageSrc({ resourceType: 'Patient', photo: null as unknown as Attachment[] })).toBeUndefined();
    expect(getImageSrc({ resourceType: 'Patient', photo: [] })).toBeUndefined();
    expect(getImageSrc({ resourceType: 'Patient', photo: [{}] })).toBeUndefined();
    expect(
      getImageSrc({
        resourceType: 'Patient',
        photo: [
          {
            url: 'http://abc/xyz.txt',
            contentType: ContentType.TEXT,
          },
        ],
      })
    ).toBeUndefined();
    expect(
      getImageSrc({
        resourceType: 'Patient',
        photo: [
          {
            contentType: 'image/jpeg',
          },
        ],
      })
    ).toBeUndefined();
    expect(
      getImageSrc({
        resourceType: 'Patient',
        photo: [
          {
            url: 'http://abc/xyz.jpg',
            contentType: 'image/jpeg',
          },
        ],
      })
    ).toStrictEqual('http://abc/xyz.jpg');
    expect(
      getImageSrc({
        resourceType: 'Bot',
        photo: {
          url: 'http://abc/xyz.jpg',
          contentType: 'image/jpeg',
        },
      })
    ).toStrictEqual('http://abc/xyz.jpg');
    expect(getImageSrc({ resourceType: 'Bot' })).toBeUndefined();
    expect(getImageSrc({ resourceType: 'Bot', photo: {} })).toBeUndefined();
  });

  test('Convert ArrayBuffer to hex string', () => {
    expect(arrayBufferToHex(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe('000102030405060708090a');
    expect(arrayBufferToHex(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer)).toBe('000102030405060708090a');
    expect(arrayBufferToHex(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe(
      '000000000100000002000000030000000400000005000000060000000700000008000000090000000a000000'
    );
    expect(arrayBufferToHex(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer)).toBe(
      '000000000100000002000000030000000400000005000000060000000700000008000000090000000a000000'
    );
  });

  test('Convert ArrayBuffer to base-64 encoded string', () => {
    expect(arrayBufferToBase64(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe('AAECAwQFBgcICQo=');
    expect(arrayBufferToBase64(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer)).toBe('AAECAwQFBgcICQo=');
    expect(arrayBufferToBase64(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe(
      'AAAAAAEAAAACAAAAAwAAAAQAAAAFAAAABgAAAAcAAAAIAAAACQAAAAoAAAA='
    );
    expect(arrayBufferToBase64(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer)).toBe(
      'AAAAAAEAAAACAAAAAwAAAAQAAAAFAAAABgAAAAcAAAAIAAAACQAAAAoAAAA='
    );
  });

  test('Get date property', () => {
    expect(getDateProperty(undefined)).toBeUndefined();
    expect(getDateProperty('')).toBeUndefined();
    expect(getDateProperty('2020-01-01')).toStrictEqual(new Date('2020-01-01'));
  });

  test('Calculate age', () => {
    expect(calculateAge(new Date().toISOString().substring(0, 10))).toMatchObject({ years: 0, months: 0, days: 0 });
    expect(calculateAge('2020-01-01', '2020-01-01')).toMatchObject({ years: 0, months: 0, days: 0 });
    expect(calculateAge('2020-01-01', '2020-01-02')).toMatchObject({ years: 0, months: 0, days: 1 });
    expect(calculateAge('2020-01-01', '2020-02-01')).toMatchObject({ years: 0, months: 1 });
    expect(calculateAge('2020-01-01', '2020-02-02')).toMatchObject({ years: 0, months: 1 });
    expect(calculateAge('2020-01-01', '2020-03-01')).toMatchObject({ years: 0, months: 2 });
    expect(calculateAge('2020-01-01', '2020-03-02')).toMatchObject({ years: 0, months: 2 });
    expect(calculateAge('2020-01-01', '2021-01-01')).toMatchObject({ years: 1, months: 12 });
    expect(calculateAge('2020-01-01', '2021-01-02')).toMatchObject({ years: 1, months: 12 });
    expect(calculateAge('2020-01-01', '2021-02-01')).toMatchObject({ years: 1, months: 13 });
    expect(calculateAge('2020-01-01', '2021-02-02')).toMatchObject({ years: 1, months: 13 });

    // End month < start month
    expect(calculateAge('2020-06-01', '2022-05-01')).toMatchObject({ years: 1, months: 23 });

    // End day < start day
    expect(calculateAge('2020-06-30', '2022-06-29')).toMatchObject({ years: 1, months: 23 });
  });

  test('Calculate age string', () => {
    expect(calculateAgeString('2020-01-01', '2020-01-01')).toStrictEqual('000D');
    expect(calculateAgeString('2020-01-01', '2020-01-02')).toStrictEqual('001D');
    expect(calculateAgeString('2020-01-01', '2020-02-01')).toStrictEqual('001M');
    expect(calculateAgeString('2020-01-01', '2020-02-02')).toStrictEqual('001M');
    expect(calculateAgeString('2020-01-01', '2020-03-01')).toStrictEqual('002M');
    expect(calculateAgeString('2020-01-01', '2020-03-02')).toStrictEqual('002M');
    expect(calculateAgeString('2020-01-01', '2021-01-01')).toStrictEqual('012M');
    expect(calculateAgeString('2020-01-01', '2021-01-02')).toStrictEqual('012M');
    expect(calculateAgeString('2020-01-01', '2021-02-01')).toStrictEqual('013M');
    expect(calculateAgeString('2020-01-01', '2021-02-02')).toStrictEqual('013M');
    expect(calculateAgeString('2020-01-01', '2022-01-01')).toStrictEqual('002Y');
  });

  test('Get Questionnaire answers', () => {
    expect(
      getQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
      })
    ).toMatchObject({});
    expect(
      getQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          { linkId: 'q1', answer: [{ valueString: 'xyz' }] },
          { linkId: 'q2', answer: [{ valueDecimal: 2.0 }] },
          { linkId: 'q3', answer: [{ valueBoolean: true }] },
        ],
      })
    ).toMatchObject({
      q1: { valueString: 'xyz' },
      q2: { valueDecimal: 2.0 },
      q3: { valueBoolean: true },
    });
    expect(
      getQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'group1',
            item: [
              {
                linkId: 'group2',
                item: [
                  {
                    linkId: 'q1',
                    answer: [
                      {
                        valueString: 'xyz',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toMatchObject({ q1: { valueString: 'xyz' } });
  });

  test('Get All Questionnaire answers', () => {
    expect(
      getAllQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
      })
    ).toMatchObject({});

    expect(
      getAllQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          { linkId: 'q1', answer: [{ valueString: 'xyz' }, { valueString: 'abc' }] },
          { linkId: 'q2', answer: [{ valueDecimal: 2.0 }, { valueDecimal: 3.0 }] },
          { linkId: 'q3', answer: [{ valueBoolean: true }] },
        ],
      })
    ).toMatchObject({
      q1: [{ valueString: 'xyz' }, { valueString: 'abc' }],
      q2: [{ valueDecimal: 2.0 }, { valueDecimal: 3.0 }],
      q3: [{ valueBoolean: true }],
    });

    expect(
      getAllQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'group1',
            item: [
              {
                linkId: 'group2',
                item: [
                  {
                    linkId: 'q1',
                    answer: [
                      {
                        valueString: 'xyz',
                      },
                      {
                        valueString: 'abc',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toMatchObject({
      q1: [{ valueString: 'xyz' }, { valueString: 'abc' }],
    });

    // Test repeated groups
    expect(
      getAllQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'group1',
            item: [
              {
                linkId: 'q1',
                answer: [
                  {
                    valueString: 'xyz',
                  },
                ],
              },
            ],
          },
          {
            linkId: 'group1',
            item: [
              {
                linkId: 'q1',
                answer: [
                  {
                    valueString: '123',
                  },
                ],
              },
            ],
          },
        ],
      })
    ).toMatchObject({
      q1: [{ valueString: 'xyz' }, { valueString: '123' }],
    });
  });

  test('Get identifier', () => {
    expect(getIdentifier({} as unknown as Resource, 'x')).toBeUndefined();
    expect(getIdentifier({ identifier: null } as unknown as Resource, 'x')).toBeUndefined();
    expect(getIdentifier({ identifier: undefined } as unknown as Resource, 'x')).toBeUndefined();
    expect(getIdentifier({ identifier: [] } as unknown as Resource, 'x')).toBeUndefined();
    expect(getIdentifier({ identifier: {} } as unknown as Resource, 'x')).toBeUndefined();

    expect(getIdentifier({ resourceType: 'Patient', identifier: [] }, 'x')).toBeUndefined();
    expect(getIdentifier({ resourceType: 'Patient', identifier: [{ system: 'x', value: 'y' }] }, 'x')).toStrictEqual(
      'y'
    );
    expect(getIdentifier({ resourceType: 'Patient', identifier: [{ system: 'y', value: 'y' }] }, 'x')).toBeUndefined();

    expect(getIdentifier({ resourceType: 'SpecimenDefinition', identifier: {} }, 'x')).toBeUndefined();
    expect(
      getIdentifier({ resourceType: 'SpecimenDefinition', identifier: { system: 'x', value: 'y' } }, 'x')
    ).toStrictEqual('y');
    expect(
      getIdentifier({ resourceType: 'SpecimenDefinition', identifier: { system: 'y', value: 'y' } }, 'x')
    ).toBeUndefined();
  });

  test('Set identifier', () => {
    const r1: Patient = { resourceType: 'Patient' };
    setIdentifier(r1, 'x', 'y');
    expect(r1).toStrictEqual({ resourceType: 'Patient', identifier: [{ system: 'x', value: 'y' }] });

    const r2: Patient = { resourceType: 'Patient', identifier: [] };
    setIdentifier(r2, 'x', 'y');
    expect(r2).toStrictEqual({ resourceType: 'Patient', identifier: [{ system: 'x', value: 'y' }] });

    const r3: Patient = { resourceType: 'Patient', identifier: [{ system: 'a', value: 'b' }] };
    setIdentifier(r3, 'x', 'y');
    expect(r3).toStrictEqual({
      resourceType: 'Patient',
      identifier: [
        { system: 'a', value: 'b' },
        { system: 'x', value: 'y' },
      ],
    });

    const r4: Patient = { resourceType: 'Patient', identifier: [{ system: 'x', value: 'b' }] };
    setIdentifier(r4, 'x', 'y');
    expect(r4).toStrictEqual({
      resourceType: 'Patient',
      identifier: [{ system: 'x', value: 'y' }],
    });
  });

  test('Get extension undefined value', () => {
    const resource: Patient = {
      resourceType: 'Patient',
      extension: [{ url: 'http://example.com' }],
    };
    expect(getExtensionValue(resource, 'http://example.com')).toBeUndefined();
    expect(getExtensionValue(resource, 'http://example.com', 'key1')).toBeUndefined();
  });

  test('Get extension string value', () => {
    const resource: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: 'http://example.com',
          valueString: 'xyz',
          extension: [
            {
              url: 'key1',
              valueString: 'value1',
            },
          ],
        },
      ],
    };
    expect(getExtensionValue(resource, 'http://example.com')).toBe('xyz');
    expect(getExtensionValue(resource, 'http://example.com', 'key1')).toBe('value1');
  });

  test('Get extension dateTime value', () => {
    const resource: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: 'http://example.com',
          valueString: 'xyz',
          extension: [
            {
              url: 'key1',
              valueDateTime: '2023-03-01T13:12:00-05:00',
            },
          ],
        },
      ],
    };
    expect(getExtensionValue(resource, 'http://example.com')).toBe('xyz');
    expect(getExtensionValue(resource, 'http://example.com', 'key1')).toBe('2023-03-01T13:12:00-05:00');
  });

  test('Get extension object', () => {
    const resource: Patient = {
      resourceType: 'Patient',
      extension: [
        {
          url: 'http://example.com',
          valueString: 'xyz',
          extension: [
            {
              url: 'key1',
              valueString: 'value1',
            },
          ],
        },
      ],
    };

    expect(getExtension(resource, 'http://example.com')).toBe(resource.extension?.[0]);
    expect(getExtension(resource, 'http://example.com', 'key1')).toBe(resource.extension?.[0]?.extension?.[0]);
  });

  test('Stringify', () => {
    expect(stringify(null)).toStrictEqual('');
    expect(stringify(undefined)).toStrictEqual('');
    expect(stringify('foo')).toStrictEqual('"foo"');
    expect(stringify({ x: 'y' })).toStrictEqual('{"x":"y"}');
    expect(stringify({ x: 123 })).toStrictEqual('{"x":123}');
    expect(stringify({ x: undefined })).toStrictEqual('');
    expect(stringify({ x: null })).toStrictEqual('');
    expect(stringify({ x: {} })).toStrictEqual('');
    expect(stringify({ x: [] })).toStrictEqual('');
    expect(stringify({ x: { y: 'z' } })).toStrictEqual('{"x":{"y":"z"}}');
    expect(stringify({ x: 2 }, true)).toStrictEqual('{\n  "x": 2\n}');
    expect(stringify({ x: [''] })).toStrictEqual('');
    expect(stringify({ x: ['', ''] })).toStrictEqual('');
    expect(stringify({ x: ['y', ''] })).toStrictEqual('{"x":["y",null]}');
    expect(stringify({ x: ['', 'y'] })).toStrictEqual('{"x":[null,"y"]}');
    expect(stringify({ x: ['y', '', ''] })).toStrictEqual('{"x":["y",null,null]}');
    expect(stringify({ x: ['', 'y', ''] })).toStrictEqual('{"x":[null,"y",null]}');
    expect(stringify({ x: ['', '', 'y'] })).toStrictEqual('{"x":[null,null,"y"]}');

    // Arrays with all empty values can be stripped
    expect(stringify({ resourceType: 'Patient', address: [{ line: [''] }] })).toStrictEqual(
      '{"resourceType":"Patient"}'
    );

    // Arrays with some empty values should not be stripped, but empty values should be replaced with "null"
    expect(stringify({ resourceType: 'Patient', address: [{ line: ['', 'x'] }] })).toStrictEqual(
      '{"resourceType":"Patient","address":[{"line":[null,"x"]}]}'
    );

    // Make sure we preserve "0", even though falsy
    expect(stringify({ low: 0, high: 100 })).toStrictEqual('{"low":0,"high":100}');

    // Make sure we preserve "false", even though falsy
    expect(stringify({ low: false, high: true })).toStrictEqual('{"low":false,"high":true}');

    // empty objects within arrays should be translated to null, but NOT removed
    expect(stringify({ address: [{}, { use: 'home' }, {}] })).toStrictEqual('{"address":[null,{"use":"home"},null]}');
  });

  test('Deep equals', () => {
    // Empty values = null, undefined, empty string
    expect(deepEquals(null, null)).toBe(true);
    expect(deepEquals(null, undefined)).toBe(true);
    expect(deepEquals(null, '')).toBe(true);
    expect(deepEquals(undefined, null)).toBe(true);
    expect(deepEquals(undefined, undefined)).toBe(true);
    expect(deepEquals(undefined, '')).toBe(true);
    expect(deepEquals('', null)).toBe(true);
    expect(deepEquals('', undefined)).toBe(true);
    expect(deepEquals('', '')).toBe(true);

    // Numbers
    expect(deepEquals({ value: 0 }, { value: 0 })).toStrictEqual(true);
    expect(deepEquals({ value: 0 }, { value: 1 })).toStrictEqual(false);
    expect(deepEquals({ value: 0 }, { value: true })).toStrictEqual(false);
    expect(deepEquals({ value: 0 }, { value: 'x' })).toStrictEqual(false);
    expect(deepEquals({ value: 0 }, { value: {} })).toStrictEqual(false);

    // Booleans
    expect(deepEquals({ value: true }, { value: true })).toStrictEqual(true);
    expect(deepEquals({ value: true }, { value: false })).toStrictEqual(false);
    expect(deepEquals({ value: true }, { value: 0 })).toStrictEqual(false);
    expect(deepEquals({ value: true }, { value: 'x' })).toStrictEqual(false);
    expect(deepEquals({ value: true }, { value: {} })).toStrictEqual(false);

    // Strings
    expect(deepEquals({ value: 'x' }, { value: 'x' })).toStrictEqual(true);
    expect(deepEquals({ value: 'x' }, { value: 'y' })).toStrictEqual(false);
    expect(deepEquals({ value: 'x' }, { value: 0 })).toStrictEqual(false);
    expect(deepEquals({ value: 'x' }, { value: true })).toStrictEqual(false);
    expect(deepEquals({ value: 'x' }, { value: {} })).toStrictEqual(false);

    // Objects
    expect(deepEquals({ value: {} }, { value: {} })).toStrictEqual(true);
    expect(deepEquals({ value: { x: 1 } }, { value: { x: 1 } })).toStrictEqual(true);
    expect(deepEquals({ value: { x: 1, y: '2' } }, { value: { x: 1, y: '2' } })).toStrictEqual(true);
    expect(deepEquals({ value: { x: 1, y: '2' } }, { value: { y: '2', x: 1 } })).toStrictEqual(true);
    expect(
      deepEquals({ value: { x: 1, y: '2', z: { n: 1 } } }, { value: { x: 1, y: '2', z: { n: 1 } } })
    ).toStrictEqual(true);
    expect(
      deepEquals({ value: { x: 1, y: '2', z: { n: 1 } } }, { value: { y: '2', x: 1, z: { n: 1 } } })
    ).toStrictEqual(true);
    expect(deepEquals({ value: { x: 1 } }, { value: { x: 2 } })).toStrictEqual(false);
    expect(deepEquals({ value: { x: 1 } }, { value: { y: 1 } })).toStrictEqual(false);
    expect(deepEquals({ value: 1 }, { value: { value: 1 } })).toStrictEqual(false);

    // Arrays
    expect(deepEquals({ value: [] }, { value: [] })).toStrictEqual(true);
    expect(deepEquals({ value: [1, 2, 3] }, { value: [1, 2, 3] })).toStrictEqual(true);
    expect(deepEquals({ value: [] }, { value: [1] })).toStrictEqual(false);
    expect(deepEquals({ value: [1, 2, 3] }, { value: [1, 2] })).toStrictEqual(false);
    expect(deepEquals({ value: [1, 2, 3] }, { value: [1, 2, 4] })).toStrictEqual(false);
    expect(deepEquals({ value: [] }, { value: [true] })).toStrictEqual(false);
    expect(deepEquals({ value: [] }, { value: [{}] })).toStrictEqual(false);
    expect(deepEquals({ value: [1] }, { value: { value: 1 } })).toStrictEqual(false);

    // Resources
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Patient' })).toStrictEqual(true);
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Observation' })).toStrictEqual(false);
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Patient', x: 'y' })).toStrictEqual(false);
    expect(deepEquals({ resourceType: 'Patient', x: 'y' }, { resourceType: 'Patient' })).toStrictEqual(false);
    expect(
      deepEquals(
        { resourceType: 'Patient', meta: { versionId: '1' } },
        { resourceType: 'Patient', meta: { versionId: '1' } }
      )
    ).toStrictEqual(true);
    expect(
      deepEquals(
        { resourceType: 'Patient', meta: { lastUpdated: '1' } },
        { resourceType: 'Patient', meta: { lastUpdated: '1' } }
      )
    ).toStrictEqual(true);

    // Ignore changes to certain meta fields
    expect(
      deepEquals(
        { resourceType: 'Patient', meta: { versionId: '1' } },
        { resourceType: 'Patient', meta: { versionId: '2' } }
      )
    ).toStrictEqual(true);
    expect(
      deepEquals(
        { resourceType: 'Patient', meta: { lastUpdated: '1' } },
        { resourceType: 'Patient', meta: { lastUpdated: '2' } }
      )
    ).toStrictEqual(true);
    expect(
      deepEquals({ resourceType: 'Patient', meta: { author: '1' } }, { resourceType: 'Patient', meta: { author: '2' } })
    ).toStrictEqual(true);

    // Functions
    const onConnect = (): void => undefined;
    expect(deepEquals({ onConnect }, { onConnect })).toStrictEqual(true);
    expect(deepEquals({ onConnect: () => undefined }, { onConnect: () => undefined })).toStrictEqual(false);
  });

  test('deepIncludes', () => {
    expect(deepIncludes({ value: 1 }, { value: 1 })).toStrictEqual(true);
    expect(deepIncludes({ value: 1 }, { value: 2 })).toStrictEqual(false);
    expect(deepIncludes({ value: 1 }, { value: {} })).toStrictEqual(false);
    expect(deepIncludes({ value: {} }, { value: {} })).toStrictEqual(true);
    expect(deepIncludes({ value: { x: 1 } }, { value: { x: 1 } })).toStrictEqual(true);

    expect(deepIncludes({ value: { x: 1, y: '2' } }, { value: { x: 1, y: '2', z: 4 } })).toStrictEqual(false);
    expect(deepIncludes({ value: { x: 1, y: '2', z: 4 } }, { value: { x: 1, y: '2' } })).toStrictEqual(true);

    expect(deepIncludes([{ value: 1 }, { value: 2 }], [{ value: 2 }, { value: 1 }, { y: 6 }])).toStrictEqual(false);
    expect(deepIncludes([{ value: 2 }, { value: 1 }, { y: 6 }], [{ value: 1 }, { value: 2 }])).toStrictEqual(true);

    expect(deepIncludes([{ value: 1 }], { value: 1 })).toStrictEqual(false);
    expect(deepIncludes([{ value: 1 }], [{ y: 2, z: 3 }])).toStrictEqual(false);

    const value = {
      type: 'CodeableConcept',
      value: {
        coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }],
        text: 'Systolic blood pressure',
      },
    };
    const pattern = {
      type: 'CodeableConcept',
      value: {
        coding: [{ system: 'http://loinc.org', code: '8480-6' }],
      },
    };
    expect(deepIncludes(value, pattern)).toStrictEqual(true);
    expect(deepIncludes(pattern, value)).toStrictEqual(false);
  });

  test('deepClone', () => {
    const input = { foo: 'bar' };
    const output = deepClone(input);
    expect(output).toStrictEqual(input);
    expect(output).not.toBe(input);

    expect(deepClone(undefined)).toBeUndefined();
  });

  test('Capitalize', () => {
    expect(capitalize('id')).toStrictEqual('Id');
    expect(capitalize('Id')).toStrictEqual('Id');
    expect(capitalize('foo')).toStrictEqual('Foo');
    expect(capitalize('FOO')).toStrictEqual('FOO');
    expect(capitalize('你好')).toStrictEqual('你好');
    expect(capitalize('dinç')).toStrictEqual('Dinç');
  });

  test('isLowerCase', () => {
    expect(isLowerCase('a')).toStrictEqual(true);
    expect(isLowerCase('A')).toStrictEqual(false);
    expect(isLowerCase('3')).toStrictEqual(false);
  });

  test('isComplexTypeCode', () => {
    expect(isComplexTypeCode('url')).toStrictEqual(false);
    expect(isComplexTypeCode(PropertyType.SystemString)).toStrictEqual(false);
    expect(isComplexTypeCode('')).toStrictEqual(false);
  });

  test('getPathDifference', () => {
    expect(getPathDifference('a', 'b')).toStrictEqual(undefined);
    expect(getPathDifference('a', 'a')).toStrictEqual(undefined);
    expect(getPathDifference('A', 'A')).toStrictEqual(undefined);
    expect(getPathDifference('a.b', 'a')).toStrictEqual(undefined);

    expect(getPathDifference('a', 'a.b')).toStrictEqual('b');
    expect(getPathDifference('A.b', 'A.b.c.d')).toStrictEqual('c.d');
    expect(getPathDifference('Patient.extension', 'Patient.extension.extension.value[x]')).toStrictEqual(
      'extension.value[x]'
    );
  });

  test('isUUID', () => {
    expect(isUUID('')).toBe(false);
    expect(isUUID('asdf')).toBe(false);
    expect(isUUID('123')).toBe(false);
    expect(isUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isUUID('9066a96e-cbcd-11ec-9d64-0242ac120002')).toBe(true);
    expect(isUUID('a1b3c259-1c48-4fda-9805-fc518da00094')).toBe(true);
    expect(isUUID('00000000-0000-0000-0000-000000000000x')).toBe(false);
    expect(isUUID('9066a96e-cbcd-11ec-9d64-0242ac120002x')).toBe(false);
    expect(isUUID('a1b3c259-1c48-4fda-9805-fc518da00094x')).toBe(false);
  });

  test('getCodeBySystem', () => {
    expect(getCodeBySystem({}, 'x')).toBe(undefined);
    expect(getCodeBySystem({ coding: [] }, 'x')).toBe(undefined);
    expect(getCodeBySystem({ coding: [{ system: 'y' }] }, 'x')).toBe(undefined);
    expect(getCodeBySystem({ coding: [{ system: 'x' }] }, 'x')).toBe(undefined);
    expect(getCodeBySystem({ coding: [{ system: 'x', code: '1' }] }, 'x')).toBe('1');
    expect(getCodeBySystem({ coding: [{ system: 'y' }, { system: 'x', code: '1' }] }, 'x')).toBe('1');
  });

  test('setCodeBySystem', () => {
    const c1: CodeableConcept = {};
    setCodeBySystem(c1, 'x', '1');
    expect(c1).toMatchObject({ coding: [{ system: 'x', code: '1' }] });

    const c2: CodeableConcept = { coding: [] };
    setCodeBySystem(c2, 'x', '1');
    expect(c2).toMatchObject({ coding: [{ system: 'x', code: '1' }] });

    const c3: CodeableConcept = { coding: [{ system: 'x', code: '2' }] };
    setCodeBySystem(c3, 'x', '1');
    expect(c3).toMatchObject({ coding: [{ system: 'x', code: '1' }] });

    const c4: CodeableConcept = { coding: [{ system: 'y', code: '2' }] };
    setCodeBySystem(c4, 'x', '1');
    expect(c4).toMatchObject({
      coding: [
        { system: 'y', code: '2' },
        { system: 'x', code: '1' },
      ],
    });
  });

  test('findObservationInterval', () => {
    const def1: ObservationDefinition = {
      resourceType: 'ObservationDefinition',
      code: { text: 'test' },
    };

    const def2: ObservationDefinition = {
      resourceType: 'ObservationDefinition',
      code: { text: 'test' },
      qualifiedInterval: [
        { condition: 'L', range: { low: { value: 1, unit: 'mg' }, high: { value: 3, unit: 'mg' } } },
        { condition: 'N', range: { low: { value: 4, unit: 'mg' }, high: { value: 6, unit: 'mg' } } },
        { condition: 'H', range: { low: { value: 7, unit: 'mg' }, high: { value: 10, unit: 'mg' } } },
      ],
    };

    const patient: Patient = {
      resourceType: 'Patient',
    };

    expect(findObservationInterval(def1, patient, 0)).toBe(undefined);
    expect(findObservationInterval(def2, patient, 0)).toBe(undefined);

    expect(findObservationInterval(def2, patient, 1)?.condition).toBe('L');
    expect(findObservationInterval(def2, patient, 2)?.condition).toBe('L');
    expect(findObservationInterval(def2, patient, 3)?.condition).toBe('L');
    expect(findObservationInterval(def2, patient, 4)?.condition).toBe('N');
    expect(findObservationInterval(def2, patient, 5)?.condition).toBe('N');
    expect(findObservationInterval(def2, patient, 6)?.condition).toBe('N');
    expect(findObservationInterval(def2, patient, 7)?.condition).toBe('H');
    expect(findObservationInterval(def2, patient, 8)?.condition).toBe('H');
    expect(findObservationInterval(def2, patient, 9)?.condition).toBe('H');
    expect(findObservationInterval(def2, patient, 10)?.condition).toBe('H');
  });

  test('findObservationInterval by category', () => {
    const def: ObservationDefinition = {
      resourceType: 'ObservationDefinition',
      code: { text: 'test' },
      qualifiedInterval: [
        {
          category: 'absolute',
          range: { low: { value: 1, unit: 'mg' }, high: { value: 3, unit: 'mg' } },
        },
        {
          category: 'critical',
          range: { low: { value: 1, unit: 'mg' }, high: { value: 3, unit: 'mg' } },
        },
        {
          category: 'reference',
          condition: 'N',
          range: { low: { value: 1, unit: 'mg' }, high: { value: 3, unit: 'mg' } },
        },
      ],
    };

    const patient: Patient = {
      resourceType: 'Patient',
    };

    expect(findObservationInterval(def, patient, 2, 'absolute')?.category).toBe('absolute');
    expect(findObservationInterval(def, patient, 2, 'critical')?.category).toBe('critical');
    expect(findObservationInterval(def, patient, 2, 'reference')?.category).toBe('reference');
  });

  test('findObservationInterval with decimal precision', () => {
    const def: ObservationDefinition = {
      resourceType: 'ObservationDefinition',
      code: { text: 'test' },
      quantitativeDetails: {
        decimalPrecision: 1,
      },
      qualifiedInterval: [
        { condition: 'L', range: { low: { value: 1.0, unit: 'mg' }, high: { value: 1.9, unit: 'mg' } } },
        { condition: 'N', range: { low: { value: 2.0, unit: 'mg' }, high: { value: 3.0, unit: 'mg' } } },
        { condition: 'H', range: { low: { value: 3.1, unit: 'mg' }, high: { value: 4.0, unit: 'mg' } } },
      ],
    };

    const patient: Patient = {
      resourceType: 'Patient',
    };

    expect(findObservationInterval(def, patient, 0.89)?.condition).toBeUndefined();
    expect(findObservationInterval(def, patient, 0.91)?.condition).toBeUndefined();
    expect(findObservationInterval(def, patient, 0.99)?.condition).toBe('L');
    expect(findObservationInterval(def, patient, 1.0)?.condition).toBe('L');
    expect(findObservationInterval(def, patient, 1.9)?.condition).toBe('L');
    expect(findObservationInterval(def, patient, 2.0)?.condition).toBe('N');
    expect(findObservationInterval(def, patient, 2.5)?.condition).toBe('N');
    expect(findObservationInterval(def, patient, 3.0)?.condition).toBe('N');
    expect(findObservationInterval(def, patient, 3.1)?.condition).toBe('H');
    expect(findObservationInterval(def, patient, 4.0)?.condition).toBe('H');
    expect(findObservationInterval(def, patient, 5.0)?.condition).toBeUndefined();
  });

  test('findObservationInterval by gender and age', () => {
    const def: ObservationDefinition = {
      resourceType: 'ObservationDefinition',
      code: { text: 'test' },
      qualifiedInterval: [
        {
          gender: 'male',
          age: { high: { value: 25, unit: 'years' } },
          condition: 'L',
          range: { low: { value: 1, unit: 'mg' }, high: { value: 2, unit: 'mg' } },
        },
        {
          gender: 'male',
          age: { high: { value: 25, unit: 'years' } },
          condition: 'N',
          range: { low: { value: 3, unit: 'mg' }, high: { value: 4, unit: 'mg' } },
        },
        {
          gender: 'male',
          age: { low: { value: 26, unit: 'years' } },
          condition: 'L',
          range: { low: { value: 5, unit: 'mg' }, high: { value: 6, unit: 'mg' } },
        },
        {
          gender: 'male',
          age: { low: { value: 26, unit: 'years' } },
          condition: 'N',
          range: { low: { value: 7, unit: 'mg' }, high: { value: 8, unit: 'mg' } },
        },
        {
          gender: 'female',
          age: { high: { value: 25, unit: 'years' } },
          condition: 'L',
          range: { low: { value: 1, unit: 'mg' }, high: { value: 2, unit: 'mg' } },
        },
        {
          gender: 'female',
          age: { high: { value: 25, unit: 'years' } },
          condition: 'N',
          range: { low: { value: 3, unit: 'mg' }, high: { value: 4, unit: 'mg' } },
        },
        {
          gender: 'female',
          age: { low: { value: 26, unit: 'years' } },
          condition: 'L',
          range: { low: { value: 5, unit: 'mg' }, high: { value: 6, unit: 'mg' } },
        },
        {
          gender: 'female',
          age: { low: { value: 26, unit: 'years' } },
          condition: 'N',
          range: { low: { value: 7, unit: 'mg' }, high: { value: 8, unit: 'mg' } },
        },
      ],
    };

    const getBirthDate = (age: number): string => {
      const date = new Date();
      date.setFullYear(date.getFullYear() - age);
      return date.toISOString().substring(0, 10);
    };

    const homer: Patient = {
      resourceType: 'Patient',
      gender: 'male',
      birthDate: getBirthDate(50),
    };

    const marge: Patient = {
      resourceType: 'Patient',
      gender: 'female',
      birthDate: getBirthDate(50),
    };

    const bart: Patient = {
      resourceType: 'Patient',
      gender: 'male',
      birthDate: getBirthDate(15),
    };

    expect(findObservationInterval(def, homer, 7)?.condition).toBe('N');
    expect(findObservationInterval(def, marge, 7)?.condition).toBe('N');
    expect(findObservationInterval(def, bart, 3)?.condition).toBe('N');

    expect(findObservationReferenceRange(def, homer, ['N'])?.range?.low?.value).toBe(7);
    expect(findObservationReferenceRange(def, marge, ['N'])?.range?.low?.value).toBe(7);
    expect(findObservationReferenceRange(def, bart, ['N'])?.range?.low?.value).toBe(3);

    expect(findObservationReferenceRanges(def, homer)).toHaveLength(2);
    expect(findObservationReferenceRanges(def, marge)).toHaveLength(2);
    expect(findObservationReferenceRanges(def, bart)).toHaveLength(2);

    expect(findObservationReferenceRanges(def, { resourceType: 'Patient' })).toHaveLength(0);
  });

  test('preciseRound', () => {
    expect(preciseRound(1, 0)).toBe(1);
    expect(preciseRound(0.1 + 0.2, 1)).toBe(0.3);
  });

  test('preciseEquals', () => {
    expect(preciseEquals(0, 0)).toBe(true);
    expect(preciseEquals(1, 1)).toBe(true);
    expect(preciseEquals(1, 2)).toBe(false);

    expect(preciseEquals(1, 1, 0)).toBe(true);
    expect(preciseEquals(1, 1, 1)).toBe(true);
    expect(preciseEquals(1, 1, 2)).toBe(true);
    expect(preciseEquals(1, 1, 3)).toBe(true);

    expect(preciseEquals(-1, -1, 0)).toBe(true);
    expect(preciseEquals(-1, -1, 1)).toBe(true);
    expect(preciseEquals(-1, -1, 2)).toBe(true);
    expect(preciseEquals(-1, -1, 3)).toBe(true);

    // Test precision
    expect(preciseEquals(1.0, 1.0, 0)).toBe(true);
    expect(preciseEquals(1.0, 1.01, 1)).toBe(true);
    expect(preciseEquals(1.0, 1.06, 1)).toBe(false);
    expect(preciseEquals(1.0, 1.001, 2)).toBe(true);
    expect(preciseEquals(1.0, 1.006, 2)).toBe(false);
    expect(preciseEquals(1.0, 1.0001, 3)).toBe(true);
    expect(preciseEquals(1.0, 1.0006, 3)).toBe(false);

    // Known floating point errors
    expect(preciseEquals(0.3, 0.3)).toBe(true);
    expect(preciseEquals(0.3, 0.3, 1)).toBe(true);
    expect(preciseEquals(0.3, 0.3, 2)).toBe(true);
    expect(preciseEquals(0.3, 0.3, 3)).toBe(true);

    // Try to force floating point errors
    expect(preciseEquals(0.3, 0.300001)).toBe(false);
    expect(preciseEquals(0.3, 0.300001, 1)).toBe(true);
    expect(preciseEquals(0.3, 0.300001, 2)).toBe(true);
    expect(preciseEquals(0.3, 0.300001, 3)).toBe(true);
  });

  test('preciseLessThan', () => {
    expect(preciseLessThan(4.9, 5.0, 1)).toBe(true);
    expect(preciseLessThan(4.92, 5.0, 1)).toBe(true);
    expect(preciseLessThan(4.97, 5.0, 1)).toBe(false);
    expect(preciseLessThan(5.0, 5.0, 1)).toBe(false);
    expect(preciseLessThan(5.1, 5.0, 1)).toBe(false);

    expect(preciseLessThan(4.99, 5.0, 2)).toBe(true);
    expect(preciseLessThan(4.992, 5.0, 2)).toBe(true);
    expect(preciseLessThan(4.997, 5.0, 2)).toBe(false);
    expect(preciseLessThan(5.0, 5.0, 2)).toBe(false);
    expect(preciseLessThan(5.01, 5.0, 2)).toBe(false);
  });

  test('preciseLessThanOrEquals', () => {
    expect(preciseLessThanOrEquals(4.9, 5.0, 1)).toBe(true);
    expect(preciseLessThanOrEquals(4.92, 5.0, 1)).toBe(true);
    expect(preciseLessThanOrEquals(4.97, 5.0, 1)).toBe(true);
    expect(preciseLessThanOrEquals(5.0, 5.0, 1)).toBe(true);
    expect(preciseLessThanOrEquals(5.1, 5.0, 1)).toBe(false);

    expect(preciseLessThanOrEquals(4.99, 5.0, 2)).toBe(true);
    expect(preciseLessThanOrEquals(4.992, 5.0, 2)).toBe(true);
    expect(preciseLessThanOrEquals(4.997, 5.0, 2)).toBe(true);
    expect(preciseLessThanOrEquals(5.0, 5.0, 2)).toBe(true);
    expect(preciseLessThanOrEquals(5.01, 5.0, 2)).toBe(false);
  });

  test('preciseGreaterThan', () => {
    expect(preciseGreaterThan(4.9, 5.0, 1)).toBe(false);
    expect(preciseGreaterThan(4.92, 5.0, 1)).toBe(false);
    expect(preciseGreaterThan(4.97, 5.0, 1)).toBe(false);
    expect(preciseGreaterThan(5.0, 5.0, 1)).toBe(false);
    expect(preciseGreaterThan(5.02, 5.0, 1)).toBe(false);
    expect(preciseGreaterThan(5.07, 5.0, 1)).toBe(true);
    expect(preciseGreaterThan(5.1, 5.0, 1)).toBe(true);

    expect(preciseGreaterThan(4.99, 5.0, 2)).toBe(false);
    expect(preciseGreaterThan(4.992, 5.0, 2)).toBe(false);
    expect(preciseGreaterThan(4.997, 5.0, 2)).toBe(false);
    expect(preciseGreaterThan(5.0, 5.0, 2)).toBe(false);
    expect(preciseGreaterThan(5.002, 5.0, 2)).toBe(false);
    expect(preciseGreaterThan(5.007, 5.0, 2)).toBe(true);
    expect(preciseGreaterThan(5.01, 5.0, 2)).toBe(true);
  });

  test('preciseGreaterThanOrEquals', () => {
    expect(preciseGreaterThanOrEquals(4.9, 5.0, 1)).toBe(false);
    expect(preciseGreaterThanOrEquals(4.92, 5.0, 1)).toBe(false);
    expect(preciseGreaterThanOrEquals(4.97, 5.0, 1)).toBe(true);
    expect(preciseGreaterThanOrEquals(5.0, 5.0, 1)).toBe(true);
    expect(preciseGreaterThanOrEquals(5.02, 5.0, 1)).toBe(true);
    expect(preciseGreaterThanOrEquals(5.07, 5.0, 1)).toBe(true);
    expect(preciseGreaterThanOrEquals(5.1, 5.0, 1)).toBe(true);

    expect(preciseGreaterThanOrEquals(4.99, 5.0, 2)).toBe(false);
    expect(preciseGreaterThanOrEquals(4.992, 5.0, 2)).toBe(false);
    expect(preciseGreaterThanOrEquals(4.997, 5.0, 2)).toBe(true);
    expect(preciseGreaterThanOrEquals(5.0, 5.0, 2)).toBe(true);
    expect(preciseGreaterThanOrEquals(5.002, 5.0, 2)).toBe(true);
    expect(preciseGreaterThanOrEquals(5.007, 5.0, 2)).toBe(true);
    expect(preciseGreaterThanOrEquals(5.01, 5.0, 2)).toBe(true);
  });

  test('should find an Observation by code and system', () => {
    const observations: ResourceWithCode[] = [
      {
        resourceType: 'Observation',
        id: '1',
        status: 'final',
        code: {
          coding: [
            {
              system: 'http://medplum.com',
              code: '12-5',
            },
          ],
        },
      },
      {
        resourceType: 'Observation',
        id: '2',
        status: 'final',
        code: {
          coding: [
            {
              system: 'http://medplum.com',
              code: '5-9',
            },
          ],
        },
      },
    ];

    const codeToFind = {
      coding: [
        {
          system: 'http://medplum.com',
          code: '12-5',
        },
      ],
    };

    const system = 'http://medplum.com';
    const expectedResult = observations[0];

    const result = findResourceByCode(observations, codeToFind, system);
    expect(result).toStrictEqual(expectedResult);
  });

  test('Result is undefined for not finding any matching code', () => {
    const observations: ResourceWithCode[] = [
      {
        resourceType: 'Observation',
        id: '1',
        status: 'final',
        code: {},
      },
    ];

    const codeToFind = {
      coding: [
        {
          system: 'http://medplum.com',
          code: '12-5',
        },
      ],
    };

    const system = 'http://medplum.com';

    const result = findResourceByCode(observations, codeToFind, system);
    expect(result).toStrictEqual(undefined);
  });

  test('Find by code if code is string', () => {
    const observations: ResourceWithCode[] = [
      {
        resourceType: 'Observation',
        id: '1',
        status: 'final',
        code: {
          coding: [
            {
              system: 'codeString',
              code: '5-9',
            },
          ],
        },
      },
    ];

    const codeToFindAsString = '5-9';

    const system = 'codeString';

    const result = findResourceByCode(observations, codeToFindAsString, system);
    expect(result).toStrictEqual(observations[0]);
  });

  test('splitN', () => {
    expect(
      splitN('_has:Observation:subject:encounter:Encounter._has:DiagnosticReport:encounter:result.status', ':', 3)
    ).toStrictEqual([
      '_has',
      'Observation',
      'subject:encounter:Encounter._has:DiagnosticReport:encounter:result.status',
    ]);
    expect(splitN('organization', ':', 2)).toStrictEqual(['organization']);
    expect(splitN('system|', '|', 2)).toStrictEqual(['system', '']);
  });

  test('lazy', () => {
    const mockFn = jest.fn().mockReturnValue('test result');
    const lazyFn = lazy(mockFn);

    // the mock function should not have been called
    expect(mockFn).not.toHaveBeenCalled();

    // Call the lazy function for the first time
    expect(lazyFn()).toBe('test result');
    expect(mockFn).toHaveBeenCalledTimes(1);

    // Call the lazy function for the second time, wrapped fn still only called once
    expect(lazyFn()).toBe('test result');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('sortStringArray', () => {
    expect(sortStringArray(['a', 'c', 'b'])).toStrictEqual(['a', 'b', 'c']);

    const code1 = '\u00e9\u0394'; // "éΔ"
    const code2 = '\u0065\u0301\u0394'; // "éΔ" using Unicode combining marks
    const code3 = '\u0065\u0394'; // "eΔ"
    expect(sortStringArray([code1, code2, code3])).toStrictEqual([code3, code1, code2]);
  });

  test('concatUrls -- Valid URLs', () => {
    // String base path with no trailing slash, relative path
    expect(concatUrls('https://foo.com', 'ws/subscriptions-r4')).toStrictEqual('https://foo.com/ws/subscriptions-r4');
    // String base path with no trailing slash, absolute path
    expect(concatUrls('https://foo.com', '/ws/subscriptions-r4')).toStrictEqual('https://foo.com/ws/subscriptions-r4');
    // String base path with trailing slash, relative path
    expect(concatUrls('https://foo.com/', 'ws/subscriptions-r4')).toStrictEqual('https://foo.com/ws/subscriptions-r4');
    // String base path with trailing slash, absolute path
    expect(concatUrls('https://foo.com/', '/ws/subscriptions-r4')).toStrictEqual('https://foo.com/ws/subscriptions-r4');
    // String base path with path after domain and no trailing slash, relative path
    expect(concatUrls('https://foo.com/foo/bar', 'ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // String base path with path after domain and no trailing slash, absolute path
    expect(concatUrls('https://foo.com/foo/bar', '/ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // String base path with path after domain and WITH trailing slash, relative path
    expect(concatUrls('https://foo.com/foo/bar/', 'ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // String base path with path after domain and WITH trailing slash, absolute path
    expect(concatUrls('https://foo.com/foo/bar/', '/ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // URL base path with no trailing slash, relative path
    expect(concatUrls(new URL('https://foo.com'), 'ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/ws/subscriptions-r4'
    );
    // URL base path with no trailing slash, absolute path
    expect(concatUrls(new URL('https://foo.com'), '/ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/ws/subscriptions-r4'
    );
    // URL base path with trailing slash, relative path
    expect(concatUrls(new URL('https://foo.com/'), 'ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/ws/subscriptions-r4'
    );
    // URL base path with trailing slash, absolute path
    expect(concatUrls(new URL('https://foo.com/'), '/ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/ws/subscriptions-r4'
    );
    // URL base path with path after domain and no trailing slash, relative path
    expect(concatUrls(new URL('https://foo.com/foo/bar'), 'ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // URL base path with path after domain and no trailing slash, absolute path
    expect(concatUrls(new URL('https://foo.com/foo/bar'), '/ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // URL base path with path after domain and WITH trailing slash, relative path
    expect(concatUrls(new URL('https://foo.com/foo/bar/'), 'ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // URL base path with path after domain and WITH trailing slash, absolute path
    expect(concatUrls(new URL('https://foo.com/foo/bar/'), '/ws/subscriptions-r4')).toStrictEqual(
      'https://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // Concatenating two full urls (return latter)
    expect(concatUrls('https://foo.com/bar', 'https://bar.org/foo')).toStrictEqual('https://bar.org/foo');
  });

  test('concatUrls -- Invalid URLs', () => {
    expect(() => concatUrls('foo', '/bar')).toThrow();
    expect(() => concatUrls('foo.com', '/bar')).toThrow();
  });

  test('getWebSocketUrl', () => {
    // String base path with no trailing slash, relative path
    expect(getWebSocketUrl('https://foo.com', 'ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/ws/subscriptions-r4'
    );
    // String base path with no trailing slash, absolute path
    expect(getWebSocketUrl('https://foo.com', '/ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/ws/subscriptions-r4'
    );
    // String base path with trailing slash, relative path
    expect(getWebSocketUrl('https://foo.com/', 'ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/ws/subscriptions-r4'
    );
    // String base path with trailing slash, absolute path
    expect(getWebSocketUrl('https://foo.com/', '/ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/ws/subscriptions-r4'
    );
    // String base path with path after domain and no trailing slash, relative path
    expect(getWebSocketUrl('https://foo.com/foo/bar', 'ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // String base path with path after domain and no trailing slash, absolute path
    expect(getWebSocketUrl('https://foo.com/foo/bar', '/ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // String base path with path after domain and WITH trailing slash, relative path
    expect(getWebSocketUrl('https://foo.com/foo/bar/', 'ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // String base path with path after domain and WITH trailing slash, absolute path
    expect(getWebSocketUrl('https://foo.com/foo/bar/', '/ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // URL base path with no trailing slash, relative path
    expect(getWebSocketUrl(new URL('https://foo.com'), 'ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/ws/subscriptions-r4'
    );
    // URL base path with no trailing slash, absolute path
    expect(getWebSocketUrl(new URL('https://foo.com'), '/ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/ws/subscriptions-r4'
    );
    // URL base path with trailing slash, relative path
    expect(getWebSocketUrl(new URL('https://foo.com/'), 'ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/ws/subscriptions-r4'
    );
    // URL base path with trailing slash, absolute path
    expect(getWebSocketUrl(new URL('https://foo.com/'), '/ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/ws/subscriptions-r4'
    );
    // URL base path with path after domain and no trailing slash, relative path
    expect(getWebSocketUrl(new URL('https://foo.com/foo/bar'), 'ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // URL base path with path after domain and no trailing slash, absolute path
    expect(getWebSocketUrl(new URL('https://foo.com/foo/bar'), '/ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // URL base path with path after domain and WITH trailing slash, relative path
    expect(getWebSocketUrl(new URL('https://foo.com/foo/bar/'), 'ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/foo/bar/ws/subscriptions-r4'
    );
    // URL base path with path after domain and WITH trailing slash, absolute path
    expect(getWebSocketUrl(new URL('https://foo.com/foo/bar/'), '/ws/subscriptions-r4')).toStrictEqual(
      'wss://foo.com/foo/bar/ws/subscriptions-r4'
    );
  });

  test('getQueryString', () => {
    expect(getQueryString('?bestEhr=medplum')).toStrictEqual('bestEhr=medplum');
    expect(
      getQueryString([
        ['bestEhr', 'medplum'],
        ['foo', 'bar'],
      ])
    ).toStrictEqual('bestEhr=medplum&foo=bar');
    expect(getQueryString({ bestEhr: 'medplum', numberOne: true, medplumRanking: 1 })).toStrictEqual(
      'bestEhr=medplum&numberOne=true&medplumRanking=1'
    );
    expect(
      getQueryString({ bestEhr: 'medplum', numberOne: true, medplumRanking: 1, betterThanMedplum: undefined })
    ).toStrictEqual('bestEhr=medplum&numberOne=true&medplumRanking=1');
    expect(
      getQueryString(new URLSearchParams({ bestEhr: 'medplum', numberOne: 'true', medplumRanking: '1' }))
    ).toStrictEqual('bestEhr=medplum&numberOne=true&medplumRanking=1');
    expect(getQueryString(undefined)).toStrictEqual('');
  });

  test('isValidHostname', () => {
    expect(isValidHostname('foo')).toStrictEqual(true);
    expect(isValidHostname('foo.com')).toStrictEqual(true);
    expect(isValidHostname('foo.bar.com')).toStrictEqual(true);
    expect(isValidHostname('foo.org')).toStrictEqual(true);
    expect(isValidHostname('foo.bar.co.uk')).toStrictEqual(true);
    expect(isValidHostname('localhost')).toStrictEqual(true);
    expect(isValidHostname('LOCALHOST')).toStrictEqual(true);
    expect(isValidHostname('foo-bar-baz')).toStrictEqual(true);
    expect(isValidHostname('foo_bar')).toStrictEqual(true);
    expect(isValidHostname('foobar123')).toStrictEqual(true);

    expect(isValidHostname('foo.com/bar')).toStrictEqual(false);
    expect(isValidHostname('https://foo.com')).toStrictEqual(false);
    expect(isValidHostname('foo_-bar_-')).toStrictEqual(false);
    expect(isValidHostname('foo | rm -rf /')).toStrictEqual(false);
  });
});

describe('addProfileToResource', () => {
  test('add profile URL to resource w/o any profiles', async () => {
    const profileUrl = 'http://example.com/patient-profile';
    const patient: Patient = {
      resourceType: 'Patient',
      name: [{ given: ['Given'], family: 'Family' }],
    };
    addProfileToResource(patient, profileUrl);
    expect(patient.meta?.profile?.length ?? -1).toStrictEqual(1);
    expect(patient.meta?.profile).toStrictEqual(expect.arrayContaining([profileUrl]));
  });

  test('add profile URL to resource with empty profile array', async () => {
    const profileUrl = 'http://example.com/patient-profile';
    const patient: Patient = {
      resourceType: 'Patient',
      meta: { profile: [] },
      name: [{ given: ['Given'], family: 'Family' }],
    };
    addProfileToResource(patient, profileUrl);
    expect(patient.meta?.profile?.length ?? -1).toStrictEqual(1);
    expect(patient.meta?.profile).toStrictEqual(expect.arrayContaining([profileUrl]));
  });

  test('add profile URL to resource with populated profile array', async () => {
    const existingProfileUrl = 'http://example.com/existing-patient-profile';
    const profileUrl = 'http://example.com/patient-profile';
    const patient: Patient = {
      resourceType: 'Patient',
      meta: { profile: [existingProfileUrl] },
      name: [{ given: ['Given'], family: 'Family' }],
    };
    addProfileToResource(patient, profileUrl);
    expect(patient.meta?.profile?.length ?? -1).toStrictEqual(2);
    expect(patient.meta?.profile).toStrictEqual(expect.arrayContaining([profileUrl, existingProfileUrl]));
  });
});

describe('mapByIdentifier', () => {
  test('returns Map with expected size and key/value pairs', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '1',
            identifier: [{ system: 'http://example.com', value: '123' }],
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            id: '2',
            identifier: [{ system: 'http://example.com', value: '456' }],
          },
        },
      ],
    };

    const map = mapByIdentifier(bundle, 'http://example.com');

    expect(map.size).toBe(2);
    expect(map.get('123')).toStrictEqual(bundle.entry?.[0].resource);
    expect(map.get('456')).toStrictEqual(bundle.entry?.[1].resource);
  });

  test('returns empty Map when no matching identifier system', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '1',
            identifier: [{ system: 'http://different.com', value: '123' }],
          },
        },
      ],
    };

    const map = mapByIdentifier(bundle, 'http://example.com');

    expect(map.size).toBe(0);
  });
});

describe('flatMapFilter', () => {
  test('maps and filters scalar values', () => {
    const input = [1, 2, 3];
    expect(flatMapFilter(input, (x) => (x >= 2 ? x * x : undefined))).toStrictEqual([4, 9]);
  });

  test('flattens nested arrays', () => {
    const input = [1, 2, 3];
    expect(flatMapFilter(input, (x) => (x % 2 !== 1 ? [x, [x, x]] : undefined))).toStrictEqual([2, 2, 2]);
  });
});

describe('singularize', () => {
  test('Passes through single value', () => {
    expect(singularize('foo')).toStrictEqual('foo');
    expect(singularize(false)).toStrictEqual(false);
    expect(singularize(undefined)).toBeUndefined();
  });

  test('Takes first element of array input', () => {
    expect(singularize(['foo'])).toStrictEqual('foo');
    expect(singularize([false])).toStrictEqual(false);
    expect(singularize([])).toBeUndefined();
  });
});

describe('escapeHtml', () => {
  test('Escapes &', () => expect(escapeHtml('&')).toStrictEqual('&amp;'));
  test('Escapes <', () => expect(escapeHtml('<')).toStrictEqual('&lt;'));
  test('Escapes >', () => expect(escapeHtml('>')).toStrictEqual('&gt;'));
  test('Escapes "', () => expect(escapeHtml('"')).toStrictEqual('&quot;'));
  test('Escapes “', () => expect(escapeHtml('“')).toStrictEqual('&ldquo;'));
  test('Escapes ”', () => expect(escapeHtml('”')).toStrictEqual('&rdquo;'));
  test('Escapes ‘', () => expect(escapeHtml('‘')).toStrictEqual('&lsquo;'));
  test('Escapes ’', () => expect(escapeHtml('’')).toStrictEqual('&rsquo;'));
  test('Escapes …', () => expect(escapeHtml('…')).toStrictEqual('&hellip;'));

  test('Escapes tag', () => expect(escapeHtml('<foo>')).toStrictEqual('&lt;foo&gt;'));
});
