import { ContentType, ProfileResource, WithId } from '@medplum/core';
import { ContactPoint, Parameters, Practitioner, Project, User } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { inviteUser } from '../../admin/invite';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import { Repository } from '../repo';

describe('User/$update-email', () => {
  const app = express();
  let repo: Repository;
  let project: WithId<Project>;
  let accessToken: string;
  let email: string;
  let user: WithId<User>;
  let profile: WithId<ProfileResource>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    ({ project, accessToken, repo } = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
      withRepo: true,
    }));

    email = `user+${randomUUID()}@example.com`;
    ({ user, profile } = await inviteUser({
      project,
      email,
      sendEmail: false,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'User',
      scope: 'project',
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Updates user email and profile email', async () => {
    const newEmail = `user+${randomUUID()}@example.com`;
    const res = await request(app)
      .post(`/fhir/R4/User/${user.id}/$update-email`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'email', valueString: newEmail },
          { name: 'updateProfileTelecom', valueBoolean: true },
          { name: 'skipEmailVerification', valueBoolean: true },
        ],
      } satisfies Parameters);
    expect(res.status).toBe(200);
    const updated = res.body as User;

    expect(updated.email).toStrictEqual(newEmail);

    const practitioner = await repo.readResource<Practitioner>('Practitioner', profile.id);
    expect(practitioner.telecom).toStrictEqual(
      expect.arrayContaining<ContactPoint>([
        { use: 'old', system: 'email', value: email },
        { use: 'work', system: 'email', value: newEmail },
      ])
    );
  });
});
