// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, getReferenceString } from '@medplum/core';
import type { ContactPoint, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { getProjectSystemRepo } from '../fhir/repo';
import { addTestUser, createTestProject } from '../test.setup';

describe('OAuth2 UserInfo', () => {
  const app = express();
  let project: WithId<Project>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    ({ project } = await createTestProject());
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get userinfo with user email', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.access_token).toBeDefined();

    const res3 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + res2.body.access_token);
    expect(res3.status).toBe(200);
    expect(res3.body.sub).toBeDefined();
    expect(res3.body.profile).toBeDefined();
    expect(res3.body.name).toBe('Medplum Admin');
    expect(res3.body.given_name).toBe('Medplum');
    expect(res3.body.family_name).toBe('Admin');
    expect(res3.body.email).toBe('admin@example.com');
  });

  test('Get userinfo with profile email', async () => {
    const email = `profile${randomUUID()}@example.com`;
    const password = randomUUID();
    const { user, project } = await registerNew({
      email,
      password,
      firstName: 'Profile',
      lastName: 'User',
      projectName: 'Userinfo Test Project',
    });
    const res = await request(app).post('/auth/login').type('json').send({
      email,
      password,
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.access_token).toBeDefined();
    const accessToken = res2.body.access_token;

    // Clear out `email` field
    const systemRepo = await getProjectSystemRepo(project);
    await systemRepo.updateResource({
      ...user,
      email: undefined,
    });
    const res3 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.sub).toBeDefined();
    expect(res3.body.profile).toBeDefined();
    expect(res3.body.name).toBe('Profile User');
    expect(res3.body.given_name).toBe('Profile');
    expect(res3.body.family_name).toBe('User');
    expect(res3.body.email).toBe(email);
  });

  test('Get userinfo with phone', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.access_token).toBeDefined();

    // Set a phone number
    const telecom: ContactPoint[] = [
      {
        system: 'email',
        value: 'admin@example.com',
      },
      {
        system: 'phone',
        value: randomUUID(),
      },
    ];
    const res3 = await request(app)
      .patch(`/fhir/R4/${res2.body.profile.reference}`)
      .set('Authorization', 'Bearer ' + res2.body.access_token)
      .type(ContentType.JSON_PATCH)
      .send([
        {
          op: 'replace',
          path: '/telecom',
          value: telecom,
        },
      ]);
    expect(res3.status).toBe(200);

    const res4 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + res2.body.access_token);
    expect(res4.status).toBe(200);
    expect(res4.body.phone_number).toBe(telecom[1].value);
  });

  test('Get userinfo with address', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid profile email phone address',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.access_token).toBeDefined();

    // Get the practitioner
    const res3 = await request(app)
      .get(`/fhir/R4/${res2.body.profile.reference}`)
      .set('Authorization', 'Bearer ' + res2.body.access_token);
    expect(res3.status).toBe(200);

    // Update the practitioner with an address
    const address = randomUUID();
    const res4 = await request(app)
      .put(`/fhir/R4/${res2.body.profile.reference}`)
      .set('Authorization', 'Bearer ' + res2.body.access_token)
      .type(ContentType.FHIR_JSON)
      .send({
        ...res3.body,
        address: [{ city: address }],
      });
    expect(res4.status).toBe(200);

    const res5 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + res2.body.access_token);
    expect(res5.status).toBe(200);
    expect(res5.body.address.formatted).toBe(address);
  });

  test('Get userinfo with only openid', async () => {
    const res = await request(app).post('/auth/login').type('json').send({
      email: 'admin@example.com',
      password: 'medplum_admin',
      scope: 'openid',
      codeChallenge: 'xyz',
      codeChallengeMethod: 'plain',
    });
    expect(res.status).toBe(200);

    const res2 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res.body.code,
      code_verifier: 'xyz',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.access_token).toBeDefined();

    const res3 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + res2.body.access_token);
    expect(res3.status).toBe(200);
    expect(res3.body.sub).toBeDefined();
    expect(res3.body.profile).toBeUndefined();
    expect(res3.body.name).toBeUndefined();
    expect(res3.body.given_name).toBeUndefined();
    expect(res3.body.family_name).toBeUndefined();
    expect(res3.body.email).toBeUndefined();
    expect(res3.body.phone_number).toBeUndefined();
    expect(res3.body.address).toBeUndefined();
  });

  test('Profile with empty resource', async () => {
    const testUser = await addTestUser(project, { scope: 'openid profile email phone address' });
    const { user, profile, accessToken } = testUser;

    const res1 = await request(app)
      .put(`/fhir/R4/${getReferenceString(profile)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        resourceType: profile.resourceType,
        id: profile.id,
      });
    expect(res1.status).toBe(200);

    const res3 = await request(app).get(`/oauth2/userinfo`).set('Authorization', `Bearer ${accessToken}`);
    expect(res3.status).toBe(200);
    expect(res3.body.sub).toStrictEqual(user.id);
    expect(res3.body.email).toStrictEqual(user.email);
    expect(res3.body.profile).toStrictEqual(getReferenceString(profile));
    expect(res3.body.name).toBeUndefined();
    expect(res3.body.given_name).toBeUndefined();
    expect(res3.body.middle_name).toBeUndefined();
    expect(res3.body.family_name).toBeUndefined();
    expect(res3.body.phone_number).toBeUndefined();
    expect(res3.body.address).toBeUndefined();
  });

  test('Profile with full resource', async () => {
    const testUser = await addTestUser(project, { scope: 'openid profile email phone address' });
    const { user, profile, accessToken } = testUser;

    const res1 = await request(app)
      .put(`/fhir/R4/${getReferenceString(profile)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        resourceType: profile.resourceType,
        id: profile.id,
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/timezone',
            valueCode: 'US/Pacific',
          },
        ],
        birthDate: '1970-01-01',
        gender: 'male',
        name: [
          {
            use: 'official',
            given: ['Homer', 'J'],
            family: 'Simpson',
          },
          {
            use: 'nickname',
            given: ['Homie'],
          },
        ],
        telecom: [
          {
            system: 'email',
            use: 'work',
            value: 'homer.simpson@example.com',
          },
          {
            system: 'email',
            use: 'work',
            value: 'homer.simpson@example.com',
          },
          {
            system: 'url',
            use: 'work',
            value: 'https://www.example.com/',
          },
        ],
        address: [
          {
            line: ['742 Evergreen Terrace'],
            city: 'Springfield',
            state: 'IL',
            postalCode: '12345',
          },
        ],
        photo: [
          {
            contentType: 'image/webp',
            url: 'Binary/123',
            title: 'homer-simpson.webp',
          },
        ],
      });
    expect(res1.status).toBe(200);

    const res3 = await request(app).get(`/oauth2/userinfo`).set('Authorization', `Bearer ${accessToken}`);
    expect(res3.status).toBe(200);
    expect(res3.body.sub).toStrictEqual(user.id);
    expect(res3.body.email).toStrictEqual(user.email);
    expect(res3.body.profile).toStrictEqual(getReferenceString(profile));
    expect(res3.body.name).toStrictEqual('Homer J Simpson');
    expect(res3.body.family_name).toStrictEqual('Simpson');
    expect(res3.body.given_name).toStrictEqual('Homer');
    expect(res3.body.middle_name).toStrictEqual('J');
    expect(res3.body.birthdate).toStrictEqual('1970-01-01');
    expect(res3.body.gender).toStrictEqual('male');
    expect(res3.body.picture).toStrictEqual('Binary/123');
    expect(res3.body.nickname).toStrictEqual('Homie');
    expect(res3.body.website).toStrictEqual('https://www.example.com/');
    expect(res3.body.preferred_username).toStrictEqual('homer.simpson');
    expect(res3.body.zoneinfo).toStrictEqual('US/Pacific');
    expect(res3.body.address).toStrictEqual({
      formatted: '742 Evergreen Terrace, Springfield, IL, 12345',
      street_address: '742 Evergreen Terrace',
      locality: 'Springfield',
      region: 'IL',
      postal_code: '12345',
    });
  });
});
