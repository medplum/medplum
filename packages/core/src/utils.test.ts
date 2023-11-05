import { Attachment, CodeableConcept, ObservationDefinition, Patient, Resource } from '@medplum/fhirtypes';
import { ContentType } from './contenttype';
import {
  arrayBufferToBase64,
  arrayBufferToHex,
  calculateAge,
  calculateAgeString,
  capitalize,
  createReference,
  deepClone,
  deepEquals,
  deepIncludes,
  findObservationInterval,
  findObservationReferenceRange,
  findResourceByCode,
  getAllQuestionnaireAnswers,
  getCodeBySystem,
  getDateProperty,
  getDisplayString,
  getExtension,
  getExtensionValue,
  getIdentifier,
  getImageSrc,
  getQuestionnaireAnswers,
  getReferenceString,
  isLowerCase,
  isProfileResource,
  isUUID,
  parseReference,
  preciseEquals,
  preciseGreaterThan,
  preciseGreaterThanOrEquals,
  preciseLessThan,
  preciseLessThanOrEquals,
  preciseRound,
  resolveId,
  ResourceWithCode,
  setCodeBySystem,
  setIdentifier,
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
    expect(parseReference(undefined)).toBeUndefined();
    expect(parseReference({})).toBeUndefined();
    expect(parseReference({ id: '123' })).toBeUndefined();
    expect(parseReference({ reference: 'Patient' })).toBeUndefined();
    expect(parseReference({ reference: '/' })).toBeUndefined();
    expect(parseReference({ reference: 'Patient/' })).toBeUndefined();
    expect(parseReference({ reference: 'Patient/123' })).toEqual(['Patient', '123']);
  });

  test('isProfileResource', () => {
    expect(isProfileResource({ resourceType: 'Patient' })).toEqual(true);
    expect(isProfileResource({ resourceType: 'Practitioner' })).toEqual(true);
    expect(isProfileResource({ resourceType: 'RelatedPerson' })).toEqual(true);
    expect(isProfileResource({ resourceType: 'Observation' })).toEqual(false);
  });

  test('getDisplayString', () => {
    expect(getDisplayString({ resourceType: 'Patient', name: [{ family: 'Smith' }] })).toEqual('Smith');
    expect(getDisplayString({ resourceType: 'Patient', id: '123', name: [] })).toEqual('Patient/123');
    expect(getDisplayString({ resourceType: 'Observation', id: '123' })).toEqual('Observation/123');
    expect(getDisplayString({ resourceType: 'Observation', id: '123', code: {} })).toEqual('Observation/123');
    expect(getDisplayString({ resourceType: 'Observation', id: '123', code: { text: 'TESTOSTERONE' } })).toEqual(
      'TESTOSTERONE'
    );
    expect(getDisplayString({ resourceType: 'ClientApplication', id: '123' })).toEqual('ClientApplication/123');
    expect(
      getDisplayString({
        resourceType: 'ClientApplication',
        id: '123',
        name: 'foo',
      })
    ).toEqual('foo');
    expect(
      getDisplayString({
        resourceType: 'Device',
        deviceName: [{ name: 'Foo' }],
      })
    ).toEqual('Foo');
    expect(getDisplayString({ resourceType: 'Device', id: '123', deviceName: [{}] })).toEqual('Device/123');
    expect(getDisplayString({ resourceType: 'Device', id: '123', deviceName: [] })).toEqual('Device/123');
    expect(getDisplayString({ resourceType: 'User', email: 'foo@example.com' })).toEqual('foo@example.com');
    expect(getDisplayString({ resourceType: 'User', id: '123' })).toEqual('User/123');
  });

  test('getImageSrc', () => {
    expect(getImageSrc({ resourceType: 'Observation' })).toBeUndefined();
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
    ).toEqual('http://abc/xyz.jpg');
    expect(
      getImageSrc({
        resourceType: 'Bot',
        photo: {
          url: 'http://abc/xyz.jpg',
          contentType: 'image/jpeg',
        },
      })
    ).toEqual('http://abc/xyz.jpg');
    expect(getImageSrc({ resourceType: 'Bot' })).toBeUndefined();
    expect(getImageSrc({ resourceType: 'Bot', photo: {} })).toBeUndefined();
  });

  test('Convert ArrayBuffer to hex string', () => {
    const input = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const output = arrayBufferToHex(input);
    expect(output).toBe('000102030405060708090a');
  });

  test('Convert ArrayBuffer to base-64 encoded string', () => {
    const input = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const output = arrayBufferToBase64(input);
    expect(output).toBe('AAECAwQFBgcICQo=');
  });

  test('Get date property', () => {
    expect(getDateProperty(undefined)).toBeUndefined();
    expect(getDateProperty('')).toBeUndefined();
    expect(getDateProperty('2020-01-01')).toEqual(new Date('2020-01-01'));
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
    expect(calculateAgeString('2020-01-01', '2020-01-01')).toEqual('000D');
    expect(calculateAgeString('2020-01-01', '2020-01-02')).toEqual('001D');
    expect(calculateAgeString('2020-01-01', '2020-02-01')).toEqual('001M');
    expect(calculateAgeString('2020-01-01', '2020-02-02')).toEqual('001M');
    expect(calculateAgeString('2020-01-01', '2020-03-01')).toEqual('002M');
    expect(calculateAgeString('2020-01-01', '2020-03-02')).toEqual('002M');
    expect(calculateAgeString('2020-01-01', '2021-01-01')).toEqual('012M');
    expect(calculateAgeString('2020-01-01', '2021-01-02')).toEqual('012M');
    expect(calculateAgeString('2020-01-01', '2021-02-01')).toEqual('013M');
    expect(calculateAgeString('2020-01-01', '2021-02-02')).toEqual('013M');
    expect(calculateAgeString('2020-01-01', '2022-01-01')).toEqual('002Y');
  });

  test('Get Questionnaire answers', () => {
    expect(
      getQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
      })
    ).toMatchObject({});
    expect(
      getQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
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
      })
    ).toMatchObject({});

    expect(
      getAllQuestionnaireAnswers({
        resourceType: 'QuestionnaireResponse',
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
  });

  test('Get identifier', () => {
    expect(getIdentifier({} as unknown as Resource, 'x')).toBeUndefined();
    expect(getIdentifier({ identifier: null } as unknown as Resource, 'x')).toBeUndefined();
    expect(getIdentifier({ identifier: undefined } as unknown as Resource, 'x')).toBeUndefined();
    expect(getIdentifier({ identifier: [] } as unknown as Resource, 'x')).toBeUndefined();
    expect(getIdentifier({ identifier: {} } as unknown as Resource, 'x')).toBeUndefined();

    expect(getIdentifier({ resourceType: 'Patient', identifier: [] }, 'x')).toBeUndefined();
    expect(getIdentifier({ resourceType: 'Patient', identifier: [{ system: 'x', value: 'y' }] }, 'x')).toEqual('y');
    expect(getIdentifier({ resourceType: 'Patient', identifier: [{ system: 'y', value: 'y' }] }, 'x')).toBeUndefined();

    expect(getIdentifier({ resourceType: 'SpecimenDefinition', identifier: {} }, 'x')).toBeUndefined();
    expect(getIdentifier({ resourceType: 'SpecimenDefinition', identifier: { system: 'x', value: 'y' } }, 'x')).toEqual(
      'y'
    );
    expect(
      getIdentifier({ resourceType: 'SpecimenDefinition', identifier: { system: 'y', value: 'y' } }, 'x')
    ).toBeUndefined();
  });

  test('Set identifier', () => {
    const r1: Patient = { resourceType: 'Patient' };
    setIdentifier(r1, 'x', 'y');
    expect(r1).toEqual({ resourceType: 'Patient', identifier: [{ system: 'x', value: 'y' }] });

    const r2: Patient = { resourceType: 'Patient', identifier: [] };
    setIdentifier(r2, 'x', 'y');
    expect(r2).toEqual({ resourceType: 'Patient', identifier: [{ system: 'x', value: 'y' }] });

    const r3: Patient = { resourceType: 'Patient', identifier: [{ system: 'a', value: 'b' }] };
    setIdentifier(r3, 'x', 'y');
    expect(r3).toEqual({
      resourceType: 'Patient',
      identifier: [
        { system: 'a', value: 'b' },
        { system: 'x', value: 'y' },
      ],
    });

    const r4: Patient = { resourceType: 'Patient', identifier: [{ system: 'x', value: 'b' }] };
    setIdentifier(r4, 'x', 'y');
    expect(r4).toEqual({
      resourceType: 'Patient',
      identifier: [{ system: 'x', value: 'y' }],
    });
  });

  test('Get extension value', () => {
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
    expect(stringify(null)).toBeUndefined();
    expect(stringify(undefined)).toBeUndefined();
    expect(stringify('foo')).toEqual('"foo"');
    expect(stringify({ x: 'y' })).toEqual('{"x":"y"}');
    expect(stringify({ x: 123 })).toEqual('{"x":123}');
    expect(stringify({ x: undefined })).toEqual('{}');
    expect(stringify({ x: null })).toEqual('{}');
    expect(stringify({ x: {} })).toEqual('{}');
    expect(stringify({ x: { y: 'z' } })).toEqual('{"x":{"y":"z"}}');
    expect(stringify({ x: 2 }, true)).toEqual('{\n  "x": 2\n}');
    expect(stringify({ resourceType: 'Patient', address: [{ line: [''] }] })).toEqual(
      '{"resourceType":"Patient","address":[{"line":[""]}]}'
    );
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
    expect(deepEquals({ value: 0 }, { value: 0 })).toEqual(true);
    expect(deepEquals({ value: 0 }, { value: 1 })).toEqual(false);
    expect(deepEquals({ value: 0 }, { value: true })).toEqual(false);
    expect(deepEquals({ value: 0 }, { value: 'x' })).toEqual(false);
    expect(deepEquals({ value: 0 }, { value: {} })).toEqual(false);

    // Booleans
    expect(deepEquals({ value: true }, { value: true })).toEqual(true);
    expect(deepEquals({ value: true }, { value: false })).toEqual(false);
    expect(deepEquals({ value: true }, { value: 0 })).toEqual(false);
    expect(deepEquals({ value: true }, { value: 'x' })).toEqual(false);
    expect(deepEquals({ value: true }, { value: {} })).toEqual(false);

    // Strings
    expect(deepEquals({ value: 'x' }, { value: 'x' })).toEqual(true);
    expect(deepEquals({ value: 'x' }, { value: 'y' })).toEqual(false);
    expect(deepEquals({ value: 'x' }, { value: 0 })).toEqual(false);
    expect(deepEquals({ value: 'x' }, { value: true })).toEqual(false);
    expect(deepEquals({ value: 'x' }, { value: {} })).toEqual(false);

    // Objects
    expect(deepEquals({ value: {} }, { value: {} })).toEqual(true);
    expect(deepEquals({ value: { x: 1 } }, { value: { x: 1 } })).toEqual(true);
    expect(deepEquals({ value: { x: 1, y: '2' } }, { value: { x: 1, y: '2' } })).toEqual(true);
    expect(deepEquals({ value: { x: 1, y: '2' } }, { value: { y: '2', x: 1 } })).toEqual(true);
    expect(deepEquals({ value: { x: 1, y: '2', z: { n: 1 } } }, { value: { x: 1, y: '2', z: { n: 1 } } })).toEqual(
      true
    );
    expect(deepEquals({ value: { x: 1, y: '2', z: { n: 1 } } }, { value: { y: '2', x: 1, z: { n: 1 } } })).toEqual(
      true
    );
    expect(deepEquals({ value: { x: 1 } }, { value: { x: 2 } })).toEqual(false);
    expect(deepEquals({ value: { x: 1 } }, { value: { y: 1 } })).toEqual(false);
    expect(deepEquals({ value: 1 }, { value: { value: 1 } })).toEqual(false);

    // Arrays
    expect(deepEquals({ value: [] }, { value: [] })).toEqual(true);
    expect(deepEquals({ value: [1, 2, 3] }, { value: [1, 2, 3] })).toEqual(true);
    expect(deepEquals({ value: [] }, { value: [1] })).toEqual(false);
    expect(deepEquals({ value: [1, 2, 3] }, { value: [1, 2] })).toEqual(false);
    expect(deepEquals({ value: [1, 2, 3] }, { value: [1, 2, 4] })).toEqual(false);
    expect(deepEquals({ value: [] }, { value: [true] })).toEqual(false);
    expect(deepEquals({ value: [] }, { value: [{}] })).toEqual(false);
    expect(deepEquals({ value: [1] }, { value: { value: 1 } })).toEqual(false);

    // Resources
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Patient' })).toEqual(true);
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Observation' })).toEqual(false);
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Patient', x: 'y' })).toEqual(false);
    expect(deepEquals({ resourceType: 'Patient', x: 'y' }, { resourceType: 'Patient' })).toEqual(false);
    expect(
      deepEquals(
        { resourceType: 'Patient', meta: { versionId: '1' } },
        { resourceType: 'Patient', meta: { versionId: '1' } }
      )
    ).toEqual(true);
    expect(
      deepEquals(
        { resourceType: 'Patient', meta: { lastUpdated: '1' } },
        { resourceType: 'Patient', meta: { lastUpdated: '1' } }
      )
    ).toEqual(true);

    // Ignore changes to certain meta fields
    expect(
      deepEquals(
        { resourceType: 'Patient', meta: { versionId: '1' } },
        { resourceType: 'Patient', meta: { versionId: '2' } }
      )
    ).toEqual(true);
    expect(
      deepEquals(
        { resourceType: 'Patient', meta: { lastUpdated: '1' } },
        { resourceType: 'Patient', meta: { lastUpdated: '2' } }
      )
    ).toEqual(true);
    expect(
      deepEquals({ resourceType: 'Patient', meta: { author: '1' } }, { resourceType: 'Patient', meta: { author: '2' } })
    ).toEqual(true);
  });

  test('deepIncludes', () => {
    expect(deepIncludes({ value: 1 }, { value: 1 })).toEqual(true);
    expect(deepIncludes({ value: 1 }, { value: 2 })).toEqual(false);
    expect(deepIncludes({ value: 1 }, { value: {} })).toEqual(false);
    expect(deepIncludes({ value: {} }, { value: {} })).toEqual(true);
    expect(deepIncludes({ value: { x: 1 } }, { value: { x: 1 } })).toEqual(true);
    expect(deepIncludes({ value: { x: 1, y: '2' } }, { value: { x: 1, y: '2', z: 4 } })).toEqual(true);
    expect(deepIncludes([{ value: 1 }, { value: 2 }], [{ value: 2 }, { value: 1 }, { y: 6 }])).toEqual(true);
    expect(deepIncludes([{ value: 1 }], { value: 1 })).toEqual(false);
    expect(deepIncludes([{ value: 1 }], [{ y: 2, z: 3 }])).toEqual(false);
  });

  test('deepClone', () => {
    const input = { foo: 'bar' };
    const output = deepClone(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  test('Capitalize', () => {
    expect(capitalize('id')).toEqual('Id');
    expect(capitalize('Id')).toEqual('Id');
    expect(capitalize('foo')).toEqual('Foo');
    expect(capitalize('FOO')).toEqual('FOO');
    expect(capitalize('你好')).toEqual('你好');
    expect(capitalize('dinç')).toEqual('Dinç');
  });

  test('isLowerCase', () => {
    expect(isLowerCase('a')).toEqual(true);
    expect(isLowerCase('A')).toEqual(false);
    expect(isLowerCase('3')).toEqual(false);
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
    };

    const def2: ObservationDefinition = {
      resourceType: 'ObservationDefinition',
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
    expect(result).toEqual(expectedResult);
  });

  test('Result is undefined for not finding any matching code', () => {
    const observations: ResourceWithCode[] = [
      {
        resourceType: 'Observation',
        id: '1',
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
    expect(result).toEqual(undefined);
  });

  test('Find by code if code is string', () => {
    const observations: ResourceWithCode[] = [
      {
        resourceType: 'Observation',
        id: '1',
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
    expect(result).toEqual(observations[0]);
  });

  test('splitN', () => {
    expect(
      splitN('_has:Observation:subject:encounter:Encounter._has:DiagnosticReport:encounter:result.status', ':', 3)
    ).toEqual(['_has', 'Observation', 'subject:encounter:Encounter._has:DiagnosticReport:encounter:result.status']);
    expect(splitN('organization', ':', 2)).toEqual(['organization']);
  });
});
