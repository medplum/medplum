import { createReference, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'crypto';
import { main } from '.';
import { createMedplumClient } from './util/client';

jest.mock('./util/client');

let medplum: MedplumClient;
const processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());

describe('CLI rest', () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
    medplum = new MockClient();
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn<never, any>();

    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);
  });

  afterEach(() => {
    process.env = env;
  });
  test('Delete command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(['node', 'index.js', 'delete', `Patient/${patient.id}`]);
    expect(console.log).toBeCalledWith(expect.stringMatching('OK'));
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

    expect(console.log).toBeCalledWith(expect.stringMatching(patient.id as string));
  });

  test('Get not found', async () => {
    await main(['node', 'index.js', 'get', `Patient/${randomUUID()}`]);
    expect(console.error).toBeCalledWith(expect.stringMatching('Error: Not found'));
  });

  test('Get admin urls', async () => {
    await main(['node', 'index.js', 'get', 'admin/projects/123']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Project 123'));
  });

  test('Get command with as-transaction flag', async () => {
    await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(['node', 'index.js', 'get', '--as-transaction', `Patient?_count=2`]);
    expect(console.log).toBeCalledWith(expect.stringMatching('urn:uuid'));
  });

  test('Get command with fhir-url-path flag', async () => {
    const medplumGetSpy = jest.spyOn(medplum, 'get').mockImplementation((): any => {
      return {
        text: jest.fn(),
      };
    });

    await main(['node', 'index.js', 'get', `Patient`, '--fhir-url-path', 'fhirpathtest']);
    expect(medplumGetSpy).toBeCalledWith('fhirpathtest/Patient');
  });

  test('Get command with invalid flag', async () => {
    await medplum.createResource<Patient>({ resourceType: 'Patient' });

    await main(['node', 'index.js', 'get', '--bad-flag', `Patient?_count=2`]);
    expect(processError).toBeCalledWith(expect.stringContaining(`error: unknown option '--bad-flag'`));
  });

  test('Post command', async () => {
    await main(['node', 'index.js', 'post', 'Patient', '{ "resourceType": "Patient" }']);
    expect(console.log).toBeCalledWith(expect.stringMatching('Patient'));
  });

  test('Put command', async () => {
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
    await main(['node', 'index.js', 'put', `Patient/${patient.id}`, JSON.stringify({ ...patient, gender: 'male' })]);
    expect(console.log).toBeCalledWith(expect.stringMatching('male'));
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
    expect(console.log).toBeCalledWith(expect.stringMatching('active'));
  });
});
