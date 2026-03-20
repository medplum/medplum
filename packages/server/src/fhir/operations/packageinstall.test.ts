// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType } from '@medplum/core';
import type { Binary, Bundle, PackageInstallation, PackageRelease, Project } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import * as storage from '../../storage/loader';
import type { BinaryStorage } from '../../storage/types';
import { addTestUser, createTestProject, withTestContext } from '../../test.setup';
import { getGlobalSystemRepo } from '../repo';

class MockBinaryStorage {
  private content: string;

  constructor(content: string) {
    this.content = content;
  }

  writeBinary(): Promise<void> {
    return Promise.resolve();
  }

  readBinary(): Promise<Readable> {
    const stream = new Readable();
    stream.push(this.content);
    stream.push(null);
    return Promise.resolve(stream);
  }
}

describe('PackageRelease $install', () => {
  const app = express();
  let project: WithId<Project>;
  let adminAccessToken: string;
  let nonAdminAccessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    const testProject = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
    });

    const testUser = await addTestUser(testProject.project);

    project = testProject.project;
    adminAccessToken = testProject.accessToken;
    nonAdminAccessToken = testUser.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Require semver version string', async () => {
    const systemRepo = getGlobalSystemRepo();
    await expect(async () =>
      withTestContext(() =>
        systemRepo.createResource<PackageRelease>({
          resourceType: 'PackageRelease',
          meta: { project: project.id },
          package: { reference: 'Package/' + randomUUID() },
          version: 'not-a-semver',
          content: {
            contentType: ContentType.FHIR_JSON,
            url: `Binary/${randomUUID()}`,
          },
        })
      )
    ).rejects.toThrow(/Version must be in semantic versioning format/);
  });

  test('Forbidden for non-admin user', async () => {
    const systemRepo = getGlobalSystemRepo();
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
        meta: { project: project.id },
        package: { reference: 'Package/' + randomUUID() },
        version: '1.0.0',
        content: {
          contentType: ContentType.FHIR_JSON,
          url: `Binary/${randomUUID()}`,
        },
      })
    );

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${packageRelease.id}/$install`)
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(403);
  });

  test('Success for admin user', async () => {
    const systemRepo = getGlobalSystemRepo();

    // Create a test bundle to install
    const bundle: Bundle = {
      resourceType: 'Bundle',
      meta: { project: project.id },
      type: 'transaction',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            name: [{ given: ['Test'], family: 'Patient' }],
          },
          request: {
            method: 'POST',
            url: 'Patient',
          },
        },
      ],
    };

    // Create Binary with bundle content
    const binary = await withTestContext(() =>
      systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        meta: { project: project.id },
        contentType: ContentType.FHIR_JSON,
      })
    );

    // Create PackageRelease
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
        meta: { project: project.id },
        package: { reference: 'Package/' + randomUUID() },
        version: '1.0.0',
        content: {
          contentType: ContentType.FHIR_JSON,
          url: `Binary/${binary.id}`,
        },
      })
    );

    // Mock binary storage
    const mockBinaryStorage = new MockBinaryStorage(JSON.stringify(bundle));
    jest.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${packageRelease.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .get(`/fhir/R4/PackageInstallation?version=${packageRelease.version}`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res2.status).toBe(200);
    const installations = res2.body.entry.map((e: any) => e.resource) as PackageInstallation[];
    expect(installations.length).toBe(1);
    expect(installations[0].status).toBe('installed');
    expect(installations[0].version).toBe('1.0.0');
  });

  test('Error handling when bundle processing fails', async () => {
    const systemRepo = getGlobalSystemRepo();

    // Create a malformed bundle
    const malformedBundle = {
      resourceType: 'Bundle',
      meta: { project: project.id },
      type: 'transaction',
      entry: [
        {
          resource: {
            resourceType: 'XYZ', // Invalid resource type to cause processing error
          },
          request: {
            method: 'POST',
            url: 'Patient',
          },
        },
      ],
    };

    // Create Binary that will point to the malformed bundle
    const binary = await withTestContext(() =>
      systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        meta: { project: project.id },
        contentType: ContentType.FHIR_JSON,
      })
    );

    // Create PackageRelease
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
        meta: { project: project.id },
        package: { reference: 'Package/' + randomUUID() },
        version: '3.0.0',
        content: {
          contentType: ContentType.FHIR_JSON,
          url: `Binary/${binary.id}`,
        },
      })
    );

    // Mock binary storage
    const mockBinaryStorage = new MockBinaryStorage(JSON.stringify(malformedBundle));
    jest.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${packageRelease.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});

    // Should return an error outcome
    expect(res.status).not.toBe(200);
    expect(res.body.resourceType).toBe('OperationOutcome');

    const res2 = await request(app)
      .get(`/fhir/R4/PackageInstallation?version=${packageRelease.version}`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res2.status).toBe(200);
    const installations = res2.body.entry.map((e: any) => e.resource) as PackageInstallation[];
    expect(installations.length).toBe(1);
    expect(installations[0].status).toBe('error');
  });

  test('Missing PackageRelease', async () => {
    const nonExistentId = randomUUID();

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${nonExistentId}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(404);
  });
});
