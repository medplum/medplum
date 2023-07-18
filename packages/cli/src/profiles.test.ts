import { main } from '.';
import { FileSystemStorage } from './storage';
import os from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';

jest.mock('os');
jest.mock('fast-glob', () => ({
  sync: jest.fn(() => []),
}));

const testHomeDir = mkdtempSync(__dirname + sep + 'storage-');

describe('Profiles', () => {
  beforeEach(async () => {
    console.log = jest.fn();
  });

  beforeAll(async () => {
    (os.homedir as unknown as jest.Mock).mockReturnValue(testHomeDir);
  });

  afterAll(async () => {
    rmSync(testHomeDir, { recursive: true, force: true });
  });

  test('Profiles', async () => {
    const profileName = 'testProfile';
    const obj = {
      authType: 'basic',
      baseUrl: 'https://valid.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'https://validtoken.gov',
    };

    await main([
      'node',
      'index.js',
      'profile',
      'set',
      profileName,
      '--auth-type',
      obj.authType,
      '--base-url',
      obj.baseUrl,
      '--fhir-url-path',
      obj.fhirUrlPath,
      '--token-url',
      obj.tokenUrl,
    ]);

    const storage = new FileSystemStorage(profileName);

    // Describe profile
    await main(['node', 'index.js', 'profile', 'describe', profileName]);
    expect(console.log).toBeCalledWith(obj);

    expect(console.log).toBeCalledWith(expect.stringMatching('testProfile profile create'));

    // Replace the previous values
    const obj2 = {
      authType: 'jwt-bearer',
      baseUrl: 'https://valid2.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'https://validtoken2.gov',
    };

    await main([
      'node',
      'index.js',
      'profile',
      'set',
      profileName,
      '--auth-type',
      obj2.authType,
      '--base-url',
      obj2.baseUrl,
      '--fhir-url-path',
      obj2.fhirUrlPath,
      '--token-url',
      obj2.tokenUrl,
    ]);
    expect(storage.getObject('options')).not.toEqual(obj);
    expect(storage.getObject('options')).toEqual(obj2);

    // Add another profile
    const profileName2 = 'testProfile2';
    await main([
      'node',
      'index.js',
      'profile',
      'set',
      profileName2,
      '--auth-type',
      obj.authType,
      '--base-url',
      obj.baseUrl,
      '--fhir-url-path',
      obj.fhirUrlPath,
      '--token-url',
      obj.tokenUrl,
    ]);
    const storage2 = new FileSystemStorage(profileName2);
    expect(storage2.getObject('options')).toEqual(obj);

    // List the 2 profiles
    await main(['node', 'index.js', 'profile', 'list']);
    expect(console.log).toBeCalledWith([
      { profileName, profile: obj2 },
      { profileName: profileName2, profile: obj },
    ]);

    // Delete the first profile
    await main(['node', 'index.js', 'profile', 'remove', profileName]);

    // ProfileName should be undefined, but profileName2 should still exist
    await main(['node', 'index.js', 'profile', 'list']);
    expect(console.log).toBeCalledWith([{ profileName: profileName2, profile: obj }]);
  });
});
