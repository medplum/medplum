import { Patient } from '@medplum/fhirtypes';
import {
  arrayBufferToBase64,
  arrayBufferToHex,
  calculateAge,
  calculateAgeString,
  capitalize,
  createReference,
  deepEquals,
  getDateProperty,
  getDisplayString,
  getExtensionValue,
  getImageSrc,
  getQuestionnaireAnswers,
  isLowerCase,
  isProfileResource,
  isUUID,
  resolveId,
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

  test('resolveId', () => {
    expect(resolveId(undefined)).toBeUndefined();
    expect(resolveId({})).toBeUndefined();
    expect(resolveId({ id: '123' })).toBeUndefined();
    expect(resolveId({ reference: 'Patient' })).toBeUndefined();
    expect(resolveId({ reference: 'Patient/123' })).toBe('123');
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
    expect(getImageSrc({ resourceType: 'Patient', photo: [] })).toBeUndefined();
    expect(getImageSrc({ resourceType: 'Patient', photo: [{}] })).toBeUndefined();
    expect(
      getImageSrc({
        resourceType: 'Patient',
        photo: [
          {
            url: 'http://abc/xyz.txt',
            contentType: 'text/plain',
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
});
