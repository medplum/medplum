import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { getReferenceString } from '@medplum/core';
import { BundleEntry, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import { simpleParser } from 'mailparser';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { addTestUser, setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';

jest.mock('@aws-sdk/client-sesv2');
jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Admin Invite', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    (SESv2Client as unknown as jest.Mock).mockClear();
    (SendEmailCommand as unknown as jest.Mock).mockClear();
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('New user to project', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args.Destination.ToAddresses[0]).toBe(bobEmail);

    const parsed = await simpleParser(args.Content.Raw.Data);
    expect(parsed.subject).toBe('Welcome to Medplum');
  });

  test('Existing user to project', async () => {
    // First, Alice creates a project
    const aliceRegistration = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

    // Second, Bob creates a project
    const bobEmail = `bob${randomUUID()}@example.com`;
    await registerNew({
      firstName: 'Bob',
      lastName: 'Jones',
      projectName: 'Bob Project',
      email: bobEmail,
      password: 'password!@#',
    });

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
    expect(SESv2Client).toHaveBeenCalledTimes(1);
    expect(SendEmailCommand).toHaveBeenCalledTimes(1);

    const args = (SendEmailCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(args.Destination.ToAddresses[0]).toBe(bobEmail);

    const parsed = await simpleParser(args.Content.Raw.Data);
    expect(parsed.subject).toBe('Medplum: Welcome to Alice Project');
  });

  test('Existing practitioner to project', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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

  test('Access denied', async () => {
    // First, Alice creates a project
    const aliceRegistration = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
    expect(SESv2Client).not.toHaveBeenCalled();
    expect(SendEmailCommand).not.toHaveBeenCalled();
  });

  test('Input validation', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
    expect(SESv2Client).not.toHaveBeenCalled();
    expect(SendEmailCommand).not.toHaveBeenCalled();
  });

  test('Do not send email', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
    expect(SESv2Client).toHaveBeenCalledTimes(0);
    expect(SendEmailCommand).toHaveBeenCalledTimes(0);
  });

  test('Invite by externalId', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
    expect(SESv2Client).toHaveBeenCalledTimes(0);
    expect(SendEmailCommand).toHaveBeenCalledTimes(0);
  });

  test('Invite as client', async () => {
    // First, Alice creates a project
    const { project, accessToken, client } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
      .set('Content-Type', 'application/json')
      .send({
        resourceType: 'Patient',
        firstName: 'Bob',
        lastName: 'Jones',
        email: bobEmail,
      });
    expect(res8.status).toBe(200);
    expect(res8.body.profile.reference).toContain('Patient/');
  });
});
