// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, Operator } from '@medplum/core';
import type { Binary, Bundle, PackageInstallation, PackageRelease } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import * as storage from '../../storage/loader';
import type { BinaryStorage } from '../../storage/types';
import { initTestAuth, withTestContext } from '../../test.setup';
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
  let accessToken: string;
  let adminAccessToken: string;
  let superAdminAccessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    accessToken = await initTestAuth();
    adminAccessToken = await initTestAuth({ membership: { admin: true } });
    superAdminAccessToken = await initTestAuth({ superAdmin: true });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Forbidden for non-admin user', async () => {
    const systemRepo = getGlobalSystemRepo();
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
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
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(403);
  });

  test('Success for admin user', async () => {
    const systemRepo = getGlobalSystemRepo();

    // Create a test bundle to install
    const bundle: Bundle = {
      resourceType: 'Bundle',
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
        contentType: ContentType.FHIR_JSON,
      })
    );

    // Create PackageRelease
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
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

    // Verify PackageInstallation was created
    const installations = await withTestContext(() =>
      systemRepo.searchResources<PackageInstallation>({
        resourceType: 'PackageInstallation',
        filters: [
          {
            code: 'package-release',
            operator: Operator.EQUALS,
            value: `PackageRelease/${packageRelease.id}`,
          },
        ],
      })
    );
    expect(installations.length).toBe(1);
    expect(installations[0].status).toBe('installed');
    expect(installations[0].version).toBe('1.0.0');
  });

  test('Success for super admin user', async () => {
    const systemRepo = getGlobalSystemRepo();

    // Create a test bundle to install
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          resource: {
            resourceType: 'Organization',
            name: 'Test Organization',
          },
          request: {
            method: 'POST',
            url: 'Organization',
          },
        },
      ],
    };

    // Create Binary with bundle content
    const binary = await withTestContext(() =>
      systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.FHIR_JSON,
      })
    );

    // Create PackageRelease
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
        package: { reference: 'Package/' + randomUUID() },
        version: '2.0.0',
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
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(200);

    // Verify PackageInstallation was created
    const installations = await withTestContext(() =>
      systemRepo.searchResources<PackageInstallation>({
        resourceType: 'PackageInstallation',
        filters: [
          {
            code: 'package-release',
            operator: Operator.EQUALS,
            value: `PackageRelease/${packageRelease.id}`,
          },
        ],
      })
    );
    expect(installations.length).toBe(1);
    expect(installations[0].status).toBe('installed');
    expect(installations[0].version).toBe('2.0.0');
  });

  test('Error handling when bundle processing fails', async () => {
    const systemRepo = getGlobalSystemRepo();

    // Create a malformed bundle
    const malformedBundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            // Missing required fields to cause validation error
          },
          request: {
            method: 'POST',
            url: 'Patient',
          },
        },
      ],
    };

    // Create Binary with malformed bundle
    const binary = await withTestContext(() =>
      systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        contentType: ContentType.FHIR_JSON,
      })
    );

    // Create PackageRelease
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
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

    // Verify PackageInstallation status is 'error'
    const installations = await withTestContext(() =>
      systemRepo.searchResources<PackageInstallation>({
        resourceType: 'PackageInstallation',
        filters: [
          {
            code: 'package-release',
            operator: Operator.EQUALS,
            value: `PackageRelease/${packageRelease.id}`,
          },
        ],
      })
    );
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
