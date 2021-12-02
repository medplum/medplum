import { arrayBufferToBase64, arrayBufferToHex, capitalize, createReference, deepEquals, getDateProperty, getDisplayString, getImageSrc, isLowerCase, isProfileResource, stringify } from './utils';

if (typeof btoa === 'undefined') {
  global.btoa = function (str) {
    return Buffer.from(str).toString('base64');
  };
}

describe('Core Utils', () => {

  test('Create reference', () => {
    expect(createReference({
      resourceType: 'Patient',
      id: '123',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }]
    })).toMatchObject({
      reference: 'Patient/123',
      display: 'Alice Smith'
    });

    expect(createReference({
      resourceType: 'Device', id: '123'
    })).toMatchObject({
      reference: 'Device/123'
    });
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
    expect(getDisplayString({ resourceType: 'ClientApplication', id: '123' })).toEqual('ClientApplication/123');
    expect(getDisplayString({ resourceType: 'ClientApplication', id: '123', name: 'foo' })).toEqual('foo');
    expect(getDisplayString({ resourceType: 'Device', deviceName: [{ name: 'Foo' }] })).toEqual('Foo');
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
    expect(getImageSrc({
      resourceType: 'Patient',
      photo: [{
        url: 'http://abc/xyz.txt',
        contentType: 'text/plain'
      }]
    })).toBeUndefined();
    expect(getImageSrc({
      resourceType: 'Patient',
      photo: [{
        contentType: 'image/jpeg'
      }]
    })).toBeUndefined();
    expect(getImageSrc({
      resourceType: 'Patient',
      photo: [{
        url: 'http://abc/xyz.jpg',
        contentType: 'image/jpeg'
      }]
    })).toEqual('http://abc/xyz.jpg');
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
    expect(stringify({x: 2}, true)).toEqual('{\n  "x": 2\n}');
  });

  test('Deep equals', () => {
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
    expect(deepEquals({ value: { x: 1, y: '2', z: { n: 1 } } }, { value: { x: 1, y: '2', z: { n: 1 } } })).toEqual(true);
    expect(deepEquals({ value: { x: 1, y: '2', z: { n: 1 } } }, { value: { y: '2', x: 1, z: { n: 1 } } })).toEqual(true);
    expect(deepEquals({ value: { x: 1 } }, { value: { x: 2 } })).toEqual(false);
    expect(deepEquals({ value: { x: 1 } }, { value: { y: 1 } })).toEqual(false);

    // Arrays
    expect(deepEquals({ value: [] }, { value: [] })).toEqual(true);
    expect(deepEquals({ value: [1, 2, 3] }, { value: [1, 2, 3] })).toEqual(true);
    expect(deepEquals({ value: [] }, { value: [1] })).toEqual(false);
    expect(deepEquals({ value: [1, 2, 3] }, { value: [1, 2] })).toEqual(false);
    expect(deepEquals({ value: [] }, { value: [true] })).toEqual(false);
    expect(deepEquals({ value: [] }, { value: [{}] })).toEqual(false);

    // Resources
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Patient' })).toEqual(true);
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Observation' })).toEqual(false);
    expect(deepEquals({ resourceType: 'Patient' }, { resourceType: 'Patient', x: 'y' })).toEqual(false);
    expect(deepEquals({ resourceType: 'Patient', x: 'y' }, { resourceType: 'Patient' })).toEqual(false);
    expect(deepEquals(
      { resourceType: 'Patient', meta: { versionId: '1' } },
      { resourceType: 'Patient', meta: { versionId: '1' } })).toEqual(true);
    expect(deepEquals(
      { resourceType: 'Patient', meta: { lastUpdated: '1' } },
      { resourceType: 'Patient', meta: { lastUpdated: '1' } })).toEqual(true);
  });

  test('Capitalize', () => {
    expect(capitalize('foo')).toEqual('Foo');
  });

  test('isLowerCase', () => {
    expect(isLowerCase('a')).toEqual(true);
    expect(isLowerCase('A')).toEqual(false);
  });

});
