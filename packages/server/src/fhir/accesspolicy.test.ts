import { assertOk, createReference } from '@medplum/core';
import { AccessPolicy, ClientApplication, Observation, Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { seedDatabase } from '../seed';
import { getRepoForLogin, Repository, systemRepo } from './repo';

describe('AccessPolicy', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Access policy restricting read', async () => {
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });
    assertOk(createOutcome, patient);
    expect(patient).toBeDefined();

    // Empty access policy effectively blocks all reads and writes
    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
    };

    const repo2 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [readOutcome] = await repo2.readResource('Patient', patient?.id as string);
    expect(readOutcome.id).toEqual('access-denied');
  });

  test('Access policy restricting search', async () => {
    // Empty access policy effectively blocks all reads and writes
    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
    };

    const repo2 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [searchOutcome] = await repo2.search({ resourceType: 'Patient' });
    expect(searchOutcome.id).toEqual('access-denied');
  });

  test('Access policy allows public resources', async () => {
    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
    };

    const repo2 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [searchOutcome] = await repo2.search({
      resourceType: 'StructureDefinition',
    });
    expect(searchOutcome.id).toEqual('ok');
  });

  test('Access policy restricting write', async () => {
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });
    assertOk(createOutcome, patient);
    expect(patient).toBeDefined();

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
          readonly: true,
        },
      ],
    };

    const repo2 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [readOutcome, patient2] = await repo2.readResource('Patient', patient.id as string);
    assertOk(readOutcome, patient2);

    const [writeOutcome] = await repo2.updateResource(patient);
    expect(writeOutcome.id).toEqual('access-denied');
  });

  test('Access policy restricting delete', async () => {
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });
    assertOk(createOutcome, patient);
    expect(patient).toBeDefined();

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
          readonly: true,
        },
      ],
    };

    const repo2 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [readOutcome, patient2] = await repo2.readResource('Patient', patient.id as string);
    assertOk(readOutcome, patient2);

    const [deleteOutcome] = await repo2.deleteResource('Patient', patient.id as string);
    expect(deleteOutcome.id).toEqual('access-denied');
  });

  test('Access policy set compartment', async () => {
    const orgId = randomUUID();

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      compartment: {
        reference: 'Organization/' + orgId,
      },
      resource: [
        {
          resourceType: 'Patient',
          compartment: {
            reference: 'Organization/' + orgId,
          },
        },
      ],
    };

    const repo = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });
    assertOk(createOutcome, patient);
    expect(patient).toBeDefined();
    expect(patient?.meta?.account).toBeDefined();

    const [readOutcome, readPatient] = await repo.readResource('Patient', patient?.id as string);
    assertOk(readOutcome, readPatient);
    expect(readPatient).toBeDefined();
    expect(readPatient?.meta?.account).toBeDefined();
  });

  test('Access policy blocks account override', async () => {
    // Setup:
    // User has an access policy with account/compartment restriction
    // User tries to override the account
    // That should be blocked

    const orgId = randomUUID();

    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      compartment: {
        reference: 'Organization/' + orgId,
      },
      resource: [
        {
          resourceType: 'Patient',
          compartment: {
            reference: 'Organization/' + orgId,
          },
        },
      ],
    };

    const repo = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [createOutcome, patient] = await repo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
      meta: {
        account: {
          reference: 'Organization/' + randomUUID(), // naughty!
        },
      },
    });
    assertOk(createOutcome, patient);
    expect(patient.meta?.account).toBeDefined();
    expect(patient.meta?.account?.reference).toEqual('Organization/' + orgId);

    const [readOutcome, readPatient] = await repo.readResource('Patient', patient?.id as string);
    assertOk(readOutcome, readPatient);
    expect(readPatient.meta?.account).toBeDefined();
    expect(readPatient.meta?.account?.reference).toEqual('Organization/' + orgId);
  });

  test('Access policy restrict compartment', async () => {
    const org1 = randomUUID();
    const org2 = randomUUID();

    const accessPolicy1: AccessPolicy = {
      resourceType: 'AccessPolicy',
      compartment: {
        reference: 'Organization/' + org1,
      },
      resource: [
        {
          resourceType: 'Patient',
          compartment: {
            reference: 'Organization/' + org1,
          },
        },
      ],
    };

    const accessPolicy2: AccessPolicy = {
      resourceType: 'AccessPolicy',
      compartment: {
        reference: 'Organization/' + org2,
      },
      resource: [
        {
          resourceType: 'Patient',
          compartment: {
            reference: 'Organization/' + org2,
          },
        },
      ],
    };

    const repo1 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy: accessPolicy1,
    });

    const repo2 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy: accessPolicy2,
    });

    const [createOutcome1, patient1] = await repo1.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });
    assertOk(createOutcome1, patient1);
    expect(patient1).toBeDefined();
    expect(patient1?.meta?.account).toBeDefined();
    expect(patient1?.meta?.account?.reference).toEqual('Organization/' + org1);

    const [readOutcome1, readPatient1] = await repo1.readResource('Patient', patient1?.id as string);
    assertOk(readOutcome1, readPatient1);
    expect(readPatient1).toBeDefined();
    expect(readPatient1?.meta?.account).toBeDefined();

    const [createOutcome2, patient2] = await repo2.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });
    assertOk(createOutcome2, patient2);
    expect(patient2).toBeDefined();
    expect(patient2?.meta?.account).toBeDefined();
    expect(patient2?.meta?.account?.reference).toEqual('Organization/' + org2);

    const [readOutcome2, readPatient2] = await repo2.readResource('Patient', patient2?.id as string);
    assertOk(readOutcome2, readPatient2);
    expect(readPatient2).toBeDefined();
    expect(readPatient2?.meta?.account).toBeDefined();

    // Try to read patient1 with repo2
    // This should fail
    const [readOutcome3, readPatient3] = await repo2.readResource('Patient', patient1?.id as string);
    expect(readOutcome3.id).toEqual('not-found');
    expect(readPatient3).toBeUndefined();

    // Try to read patient2 with repo1
    // This should fail
    const [readOutcome4, readPatient4] = await repo1.readResource('Patient', patient2?.id as string);
    expect(readOutcome4.id).toEqual('not-found');
    expect(readPatient4).toBeUndefined();
  });

  test('ClientApplication with account restriction', async () => {
    const project = randomUUID();
    const account = 'Organization/' + randomUUID();

    // Create a ClientApplication with an account value
    const [outcome1, clientApplication] = await systemRepo.createResource<ClientApplication>({
      resourceType: 'ClientApplication',
      secret: 'foo',
      redirectUri: 'https://example.com/',
      meta: {
        account: {
          reference: account,
        },
      },
    });
    assertOk(outcome1, clientApplication);
    expect(clientApplication).toBeDefined();

    // Create a systemRepo for the ClientApplication
    // Use getRepoForLogin to generate the synthetic access policy
    const clientRepo = await getRepoForLogin({
      resourceType: 'Login',
      project: {
        reference: 'Project/' + project,
      },
      profile: createReference(clientApplication as ClientApplication),
    });

    // Create a Patient using the ClientApplication
    const [outcome2, patient] = await clientRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Al'], family: 'Bundy' }],
      birthDate: '1975-12-12',
    });
    assertOk(outcome2, patient);
    expect(patient).toBeDefined();

    // The Patient should have the account value set
    expect(patient?.meta?.account?.reference).toEqual(account);

    // Create an Observation using the ClientApplication
    const [outcome3, observation] = await clientRepo.createResource<Observation>({
      resourceType: 'Observation',
      subject: createReference(patient as Patient),
      code: {
        text: 'test',
      },
      valueString: 'positive',
    });
    assertOk(outcome3, observation);
    expect(observation).toBeDefined();

    // The Observation should have the account value set
    expect(observation?.meta?.account?.reference).toEqual(account);

    // Create a Patient outside of the account
    const [outcome4, patient2] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Peggy'], family: 'Bundy' }],
      birthDate: '1975-11-11',
    });
    assertOk(outcome4, patient2);
    expect(patient2).toBeDefined();

    // The ClientApplication should not be able to access it
    const [outcome5] = await clientRepo.readResource<Patient>('Patient', patient2?.id as string);
    expect(outcome5.id).toEqual('not-found');

    // Create an Observation outside of the account
    const [outcome6, observation2] = await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      subject: createReference(patient2 as Patient),
      code: {
        text: 'test',
      },
      valueString: 'positive',
    });
    assertOk(outcome6, observation2);
    expect(observation2).toBeDefined();

    // The ClientApplication should not be able to access it
    const [outcome7] = await clientRepo.readResource<Observation>('Observation', observation2?.id as string);
    expect(outcome7.id).toEqual('not-found');
  });

  test('Readonly fields on write', async () => {
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });
    assertOk(createOutcome, patient);
    expect(patient).toBeDefined();

    // AccessPolicy that hides Patient name
    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
          readonlyFields: ['name'],
        },
      ],
    };

    const repo2 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [readOutcome, readResource] = await repo2.readResource<Patient>('Patient', patient?.id as string);
    assertOk(readOutcome, readResource);
    expect(readResource).toMatchObject({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });

    const [writeOutcome, writeResource] = await repo2.updateResource<Patient>({
      ...readResource,
      active: true,
      name: [{ given: ['Bob'], family: 'Smith' }],
    });
    assertOk(writeOutcome, writeResource);
    expect(writeResource).toMatchObject({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
      active: true,
    });
  });

  test('Hidden fields on read', async () => {
    const [createOutcome, patient] = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1970-01-01',
    });
    assertOk(createOutcome, patient);
    expect(patient).toBeDefined();

    // AccessPolicy that hides Patient name
    const accessPolicy: AccessPolicy = {
      resourceType: 'AccessPolicy',
      resource: [
        {
          resourceType: 'Patient',
          hiddenFields: ['name'],
        },
      ],
    };

    const repo2 = new Repository({
      author: {
        reference: 'Practitioner/123',
      },
      accessPolicy,
    });

    const [readOutcome, readResource] = await repo2.readResource<Patient>('Patient', patient?.id as string);
    assertOk(readOutcome, readResource);
    expect(readResource).toMatchObject({
      resourceType: 'Patient',
      birthDate: '1970-01-01',
    });
    expect(readResource.name).toBeUndefined();

    const [readHistoryOutcome, historyBundle] = await repo2.readHistory<Patient>('Patient', patient?.id as string);
    assertOk(readHistoryOutcome, historyBundle);
    expect(historyBundle).toMatchObject({
      resourceType: 'Bundle',
      type: 'history',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            birthDate: '1970-01-01',
          },
        },
      ],
    });
    expect(historyBundle.entry?.[0]?.resource?.name).toBeUndefined();
  });
});
