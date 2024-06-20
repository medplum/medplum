import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { ContentType, createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import { BundleEntry, Practitioner, ProjectMembership } from '@medplum/fhirtypes';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import { simpleParser } from 'mailparser';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { addTestUser, initTestAuth, setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Admin Invite', () => {
  let mockSESv2Client: AwsClientStub<SESv2Client>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.emailProvider = 'awsses';
    await withTestContext(() => initApp(app, config));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    mockSESv2Client = mockClient(SESv2Client);
    mockSESv2Client.on(SendEmailCommand).resolves({ MessageId: 'ID_TEST_123' });

    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  afterEach(() => {
    mockSESv2Client.restore();
  });

  test('New user to project', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to the project
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });

    expect(res2.status).toBe(200);
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe(bobEmail);

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));

    expect(parsed.subject).toBe('Welcome to Medplum');
  });

  test('Existing user to project', async () => {
    // First, Alice creates a project
    const aliceRegistration = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Bob creates a project
    const bobEmail = `bob${randomUUID()}@example.com`;
    await withTestContext(() =>
      registerNew({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: bobEmail,
        password: 'password!@#',
      })
    );

    // Third, Alice invites Bob to the project
    // Because Bob already has an account, no emails should be sent
    const res3 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/invite')
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });

    expect(res3.status).toBe(200);
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe(bobEmail);

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Medplum: Welcome to Alice Project');
  });

  test('Existing practitioner to project', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice creates a Practitioner resource
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/fhir/R4/Practitioner')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'Practitioner',
        name: [{ given: ['Bob'], family: 'Jones' }],
        telecom: [{ system: 'email', value: bobEmail }],
      });
    expect(res2.status).toBe(201);
    expect(res2.body.id).toBeDefined();

    // Third, Alice invites Bob to the project
    // Because there is already a practitioner with the same email,
    // we should reuse the existing Practitioner resource
    const res3 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });

    expect(res3.status).toBe(200);
    expect(res3.body.profile.reference).toEqual(getReferenceString(res2.body));
  });

  test('Specified practitioner to project', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice creates a Practitioner resource
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/fhir/R4/Practitioner')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        resourceType: 'Practitioner',
        name: [{ given: ['Bob'], family: 'Jones' }],
      });
    expect(res2.status).toBe(201);
    expect(res2.body.id).toBeDefined();

    // Third, Alice invites Bob to the project
    // Alice specifies the practitioner in the membership.
    // This should work, even though the practitioner does not have an email.
    const res3 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
        membership: {
          profile: createReference(res2.body as Practitioner),
        },
      });

    expect(res3.status).toBe(200);
    expect(res3.body.profile.reference).toEqual(getReferenceString(res2.body));
  });

  test('Access denied', async () => {
    // First, Alice creates a project
    const aliceRegistration = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to project
    const bobRegistration = await addTestUser(aliceRegistration.project);

    // Third, Bob tries to invite Carol to Alice's project
    // In this example, Bob is not an admin of Alice's project
    // So access is denied
    const res3 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/invite')
      .set('Authorization', 'Bearer ' + bobRegistration.accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Carol',
        lastName: 'Brown',
        email: `carol${randomUUID()}@example.com`,
      });

    expect(res3.status).toBe(403);
    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client).not.toHaveReceivedCommand(SendEmailCommand);
  });

  test('Input validation', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to the project
    // But she forgets his email address
    // So the request should fail
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: '',
      });

    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client).not.toHaveReceivedCommand(SendEmailCommand);
  });

  test('Do not send email', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to the project
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
        sendEmail: false,
      });

    expect(res2.status).toBe(200);
    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client).not.toHaveReceivedCommand(SendEmailCommand);
  });

  test('Invite by externalId', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to the project
    const bobSub = randomUUID();
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        firstName: 'Bob',
        lastName: 'Jones',
        externalId: bobSub,
      });

    expect(res2.status).toBe(200);
    expect(res2.body.profile.reference).toContain('Patient/');
    expect(res2.body.admin).toBe(undefined);
    expect(mockSESv2Client.send.callCount).toBe(0);
    expect(mockSESv2Client).not.toHaveReceivedCommand(SendEmailCommand);
  });

  test('Duplicate externalId', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to the project
    const bobSub = randomUUID();
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        firstName: 'Bob',
        lastName: 'Jones',
        externalId: bobSub,
      });

    expect(res2.status).toBe(200);

    // Third, Alice tries to invite Carol to the project with the same externalId
    // This should fail
    const carolSub = bobSub;
    const res3 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        firstName: 'Carol',
        lastName: 'White',
        externalId: carolSub,
      });

    expect(res3.status).toBe(409);
    expect(res3.body.issue[0].details.text).toMatch(/already exists/);
  });

  test('Reuse deleted externalId', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Alice invites Bob to the project
    const bobSub = randomUUID();
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        firstName: 'Bob',
        lastName: 'Jones',
        externalId: bobSub,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.profile.reference).toContain('Patient/');

    // Delete the ProjectMembership
    // ProjectMembership.externalId has a unique constraint
    // That column must be cleared
    const res3 = await request(app)
      .delete('/fhir/R4/ProjectMembership/' + res2.body.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res3.status).toBe(200);

    // Alice invites Bob to the project again
    // Make sure that we can reuse the same externalId
    const res4 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        firstName: 'Bob',
        lastName: 'Jones',
        externalId: bobSub,
      });
    expect(res4.status).toBe(200);
    expect(res4.body.profile.reference).toContain('Patient/');
  });

  test('Invite as client', async () => {
    // First, Alice creates a project
    const { project, accessToken, client } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Get the client membership
    const res2 = await request(app)
      .get('/fhir/R4/ProjectMembership?profile=' + getReferenceString(client))
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);

    const clientMembership = res2.body.entry.find(
      (e: BundleEntry<ProjectMembership>) => e.resource?.profile?.reference === getReferenceString(client)
    )?.resource;
    expect(clientMembership).toBeDefined();

    // Get the client membership details
    const res4 = await request(app)
      .get('/admin/projects/' + project.id + '/members/' + clientMembership.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);

    // Promote the client to admin
    const res7 = await request(app)
      .post('/admin/projects/' + project.id + '/members/' + clientMembership.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        ...res4.body,
        admin: true,
      });
    expect(res7.status).toBe(200);

    // Call the invite endpoint as the client
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res8 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .set('Content-Type', ContentType.JSON)
      .send({
        resourceType: 'Patient',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });
    expect(res8.status).toBe(200);
    expect(res8.body.profile.reference).toContain('Patient/');
  });

  test('Invite user as admin', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to the project
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
        admin: true,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.admin).toBe(true);
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);
  });

  test('Invite user with admin flag as false', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to the project
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
        admin: false,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.admin).toBe(false);
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);
  });

  test('Email sending error due to SES not being set up', async () => {
    mockSESv2Client.rejects('error');

    // First, Alice creates a project
    const aliceRegistration = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    const bobEmail = `bob${randomUUID()}@example.com`;

    // Alice invites Bob. Under normal circumstances the email would be sent
    const res2 = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/invite')
      .set('Authorization', 'Bearer ' + aliceRegistration.accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });
    expect(res2.status).toBe(200);
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(res2.body.issue?.[0].details.text).toBe('Could not send email. Make sure you have AWS SES set up.');
  });

  test('Super admin invite to different project', async () => {
    // First, Alice creates a project
    const aliceRegistration = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // As a super admin, invite Bob to Alice's project
    const superAdminAccessToken = await initTestAuth({ superAdmin: true });
    const res = await request(app)
      .post('/admin/projects/' + aliceRegistration.project.id + '/invite')
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: `bob${randomUUID()}@example.com`,
        sendEmail: false,
      });
    expect(res.status).toBe(200);
    expect((res.body as ProjectMembership).project?.reference).toBe(getReferenceString(aliceRegistration.project));
  });

  test('Convert capitalized email to lower case', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Second, Alice invites Bob to the project
    const upperBobEmail = `BOB${randomUUID()}@example.com`;
    const lowerBobEmail = upperBobEmail.toLowerCase();
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: upperBobEmail,
      });

    expect(res2.status).toBe(200);
    expect(res2.body.user.display).toBe(lowerBobEmail);
    expect(mockSESv2Client.send.callCount).toBe(1);
    expect(mockSESv2Client).toHaveReceivedCommandTimes(SendEmailCommand, 1);

    const inputArgs = mockSESv2Client.commandCalls(SendEmailCommand)[0].args[0].input;

    expect(inputArgs?.Destination?.ToAddresses?.[0] ?? '').toBe(lowerBobEmail);

    const parsed = await simpleParser(Readable.from(inputArgs?.Content?.Raw?.Data ?? ''));
    expect(parsed.subject).toBe('Welcome to Medplum');
  });

  test('Invite user with existing membership', async () => {
    const { project, accessToken, profile } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Invite Bob first time - should succeed
    const bobEmail = `bob${randomUUID()}@example.com`;
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toBe('ProjectMembership');

    // Invite Bob second time - should fail
    const res3 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });
    expect(res3.status).toBe(409);
    expect(normalizeErrorString(res3.body)).toEqual('User is already a member of this project');

    // Invite Bob third time with "upsert = true" - should succeed
    const res4 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
        upsert: true,
      });
    expect(res4.status).toBe(200);
    expect(res4.body.resourceType).toBe('ProjectMembership');
    expect(res4.body.id).toEqual(res2.body.id);

    // Invite Bob again with different profiile - should fail
    const res5 = await request(app)
      .post('/admin/projects/' + project.id + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
        upsert: true,
        membership: { profile: createReference(profile) },
      });
    expect(res5.status).toBe(409);
    expect(normalizeErrorString(res5.body)).toEqual(
      'User is already a member of this project with a different profile'
    );
  });
});
