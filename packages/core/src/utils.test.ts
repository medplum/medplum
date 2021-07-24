import { arrayBufferToBase64, arrayBufferToHex, createReference, getDateProperty, getDisplayString, getImageSrc, isProfileResource } from './utils';

if (typeof btoa === 'undefined') {
  global.btoa = function (str) {
    return Buffer.from(str).toString('base64');
  };
}

test('Create reference', () => {
  const reference = createReference({
    resourceType: 'Patient',
    id: '123',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  });

  expect(reference).not.toBeUndefined();
  expect(reference.display).toEqual('Alice Smith');
  expect(reference.reference).toEqual('Patient/123');
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
  expect(getDateProperty(new Date('2020-01-01'))).toEqual(new Date('2020-01-01'));
  expect(getDateProperty('2020-01-01')).toEqual(new Date('2020-01-01'));
});
