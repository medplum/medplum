import { createReference, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID, webcrypto } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { sep } from 'node:path';
import { main } from '.';
import { FileSystemStorage } from './storage';
import { createMedplumClient } from './util/client';

jest.mock('node:os');
jest.mock('fast-glob', () => ({
  sync: jest.fn(() => []),
}));
jest.mock('./util/client');

describe('CLI rest', () => {
  const testHomeDir = mkdtempSync(__dirname + sep + 'storage-');
  const env = process.env;
  let medplum: MedplumClient;
  let processError: jest.SpyInstance;

  beforeAll(async () => {
    (os.homedir as unknown as jest.Mock).mockReturnValue(testHomeDir);
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());
  });

  afterAll(() => {
    rmSync(testHomeDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
    medplum = new MockClient();
    console.log = jest.fn();
    console.error = jest.fn();

    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);
  });

  afterEach(() => {
    process.env = env;
  });

  test('Delete command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(['node', 'index.js', 'delete', `Patient/${patient.id}`]);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('OK'));
    try {
      await medplum.readReference(createReference(patient));
      throw new Error('Expected error');
    } catch (err) {
      expect((err as Error).message).toBe('Not found');
    }
  });

  test('Get command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(['node', 'index.js', 'get', `Patient/${patient.id}`]);

    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(patient.id as string));
  });

  test('Get not found', async () => {
    await expect(main(['node', 'index.js', 'get', `Patient/${randomUUID()}`])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringMatching('Error: Not found'));
  });

  test('Get admin urls', async () => {
    await main(['node', 'index.js', 'get', 'admin/projects/123']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Project 123'));
  });

  test('Get command with as-transaction flag', async () => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
    await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(['node', 'index.js', 'get', '--as-transaction', `Patient?_count=2`]);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('urn:uuid'));
  });

  test('Get command with fhir-url flag', async () => {
    await main(['node', 'index.js', 'get', `Patient`, '--fhir-url', 'fhirulrtest']);

    expect(createMedplumClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fhirUrlPath: 'fhirulrtest',
      })
    );
  });

  test('Get command with fhir-url-path flag', async () => {
    await main(['node', 'index.js', 'get', `Patient`, '--fhir-url-path', 'fhirpathtest']);

    expect(createMedplumClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fhirUrlPath: 'fhirpathtest',
      })
    );
  });

  test('Get command with invalid flag', async () => {
    await medplum.createResource<Patient>({ resourceType: 'Patient' });

    await expect(main(['node', 'index.js', 'get', '--bad-flag', `Patient?_count=2`])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringContaining(`error: unknown option '--bad-flag'`));
  });

  test('Post command', async () => {
    await main(['node', 'index.js', 'post', 'Patient', '{ "resourceType": "Patient" }']);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Patient'));
  });

  test('Basic Auth profile request', async () => {
    const profileName = 'testProfile';
    const obj = {
      authType: 'basic',
      baseUrl: 'https://valid.gov',
      fhirUrlPath: 'api/v2',
      tokenUrl: 'https://validtoken.gov',
      clientId: 'validClientId',
      clientSecret: 'validClientSecret',
    };
    const storage = new FileSystemStorage(profileName);
    storage.setObject('options', obj);

    await main(['node', 'index.js', 'post', 'Patient', '{ "resourceType": "Patient" }', '-p', profileName]);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Patient'));

    await main(['node', 'index.js', 'get', 'Patient', '-p', profileName]);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('Patient'));
  });

  test('Post command with empty body', async () => {
    await expect(main(['node', 'index.js', 'post', 'Patient', ''])).rejects.toThrow('Process exited with exit code 1');
    expect(processError).toHaveBeenCalledWith(expect.stringMatching('Error: Cannot read properties of undefined'));
  });

  test('Post command with invalid json', async () => {
    await expect(main(['node', 'index.js', 'post', 'Patient', '{ "resourceType" }'])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringMatching('Error:'));
  });

  test('Put command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(['node', 'index.js', 'put', `Patient/${patient.id}`, JSON.stringify({ ...patient, gender: 'male' })]);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('male'));
  });

  test('Patch command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main([
      'node',
      'index.js',
      'patch',
      `Patient/${patient.id}`,
      '[{"op":"add","path":"/active","value":[true]}]',
    ]);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching('active'));
  });
});
