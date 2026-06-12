// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type {
  Binary,
  Bundle,
  Extension,
  OperationOutcome,
  Package,
  PackageInstallation,
  PackageRelease,
  Project,
  Questionnaire,
} from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import * as botExecute from '../../bots/execute';
import { loadTestConfig } from '../../config/loader';
import * as storage from '../../storage/loader';
import type { BinaryStorage } from '../../storage/types';
import { addTestUser, createTestProject, withTestContext } from '../../test.setup';
import { getGlobalSystemRepo } from '../repo';
import {
  PackageInstallationConfigHashUrl,
  PackageInstallationErrorPhaseUrl,
  PackageReleaseImplProjectUrl,
  PackageReleaseSetupBotUrl,
} from './packageinstall';

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

  test('Project admin can browse and install a release from a linked catalog project', async () => {
    const systemRepo = getGlobalSystemRepo();

    // Catalog project publishes the package and exports the catalog types (option 1: link + export).
    const { project: catalogProject } = await createTestProject({
      project: { exportedResourceType: ['Package', 'PackageRelease'] },
    });

    // Customer project links to the catalog and authenticates as a project admin.
    const customer = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: { link: [{ project: createReference(catalogProject) }] },
    });

    const bundle: Bundle = {
      resourceType: 'Bundle',
      meta: { project: customer.project.id },
      type: 'transaction',
      entry: [
        {
          resource: { resourceType: 'Patient', name: [{ given: ['Catalog'], family: 'Install' }] },
          request: { method: 'POST', url: 'Patient' },
        },
      ],
    };

    // Package, Binary, and PackageRelease all live in the catalog project.
    const pkg = await withTestContext(() =>
      systemRepo.createResource<Package>({
        resourceType: 'Package',
        meta: { project: catalogProject.id },
        status: 'active',
        name: 'Linked Catalog Package',
        author: { reference: 'Organization/' + randomUUID() },
      })
    );
    const binary = await withTestContext(() =>
      systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        meta: { project: catalogProject.id },
        contentType: ContentType.FHIR_JSON,
      })
    );
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
        meta: { project: catalogProject.id },
        package: createReference(pkg),
        version: '1.0.0',
        content: { contentType: ContentType.FHIR_JSON, url: `Binary/${binary.id}` },
      })
    );

    const mockBinaryStorage = new MockBinaryStorage(JSON.stringify(bundle));
    jest.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);

    // Browse: the customer admin can read the catalog release cross-link.
    const browse = await request(app)
      .get(`/fhir/R4/PackageRelease/${packageRelease.id}`)
      .set('Authorization', 'Bearer ' + customer.accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send();
    expect(browse.status).toBe(200);

    // Install: $install succeeds even though the release + Binary live in the catalog project.
    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${packageRelease.id}/$install`)
      .set('Authorization', 'Bearer ' + customer.accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .get(`/fhir/R4/PackageInstallation?version=1.0.0`)
      .set('Authorization', 'Bearer ' + customer.accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send();
    expect(res2.status).toBe(200);
    const installations = res2.body.entry?.map((e: any) => e.resource) as PackageInstallation[];
    expect(installations?.length).toBe(1);
    expect(installations[0].status).toBe('installed');
    // PackageInstallation is not a catalog type, so it stays scoped to the caller's
    // project. Finding it via the customer's own admin token proves the install record
    // landed in the customer project, not the catalog.
    expect(installations[0].packageRelease?.reference).toBe(`PackageRelease/${packageRelease.id}`);
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

  function setupBotBundle(identifier: string): Bundle {
    return {
      resourceType: 'Bundle',
      meta: { project: project.id },
      type: 'transaction',
      entry: [
        {
          resource: {
            resourceType: 'Bot',
            name: `Setup Bot ${identifier}`,
            runtimeVersion: 'awslambda',
            identifier: [{ system: 'https://www.medplum.com/bots', value: identifier }],
          },
          request: { method: 'POST', url: 'Bot' },
        },
      ],
    };
  }

  async function publishRelease(
    bundle: Bundle,
    options?: { version?: string; setupBot?: string; implProject?: string }
  ): Promise<WithId<PackageRelease>> {
    const systemRepo = getGlobalSystemRepo();
    const binary = await withTestContext(() =>
      systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        meta: { project: project.id },
        contentType: ContentType.FHIR_JSON,
      })
    );
    const extension: Extension[] = [];
    if (options?.setupBot) {
      extension.push({ url: PackageReleaseSetupBotUrl, valueString: options.setupBot });
    }
    if (options?.implProject) {
      extension.push({
        url: PackageReleaseImplProjectUrl,
        valueReference: { reference: 'Project/' + options.implProject },
      });
    }
    const release = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
        meta: { project: project.id },
        package: { reference: 'Package/' + randomUUID() },
        version: options?.version ?? '1.0.0',
        content: { contentType: ContentType.FHIR_JSON, url: `Binary/${binary.id}` },
        extension: extension.length > 0 ? extension : undefined,
      })
    );
    const mockBinaryStorage = new MockBinaryStorage(JSON.stringify(bundle));
    jest.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);
    return release;
  }

  async function searchInstallations(version: string): Promise<PackageInstallation[]> {
    const res = await request(app)
      .get(`/fhir/R4/PackageInstallation?version=${version}`)
      .set('Authorization', 'Bearer ' + adminAccessToken);
    return res.body.entry?.map((e: any) => e.resource) ?? [];
  }

  async function countBots(identifier: string): Promise<number> {
    const res = await request(app)
      .get(`/fhir/R4/Bot?identifier=${identifier}`)
      .set('Authorization', 'Bearer ' + adminAccessToken);
    return res.body.entry?.length ?? 0;
  }

  test('Stage 2 setupBot returns credentials and links impl project', async () => {
    const implProject = await withTestContext(() =>
      getGlobalSystemRepo().createResource<Project>({ resourceType: 'Project', name: 'impl-' + randomUUID() })
    );
    const creds: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'information', code: 'informational', details: { text: 'client_id=abc;client_secret=xyz' } }],
    };
    const execSpy = jest
      .spyOn(botExecute, 'executeBot')
      .mockResolvedValue({ success: true, logResult: '', returnValue: creds });

    const release = await publishRelease(setupBotBundle('test-setup-a'), {
      setupBot: 'test-setup-a',
      implProject: implProject.id,
      version: '10.0.0',
    });

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(res.body.issue[0].details.text).toContain('client_id=abc');

    // setupBot invoked once with the installation + settings
    expect(execSpy).toHaveBeenCalledTimes(1);
    const input = execSpy.mock.calls[0][0].input as { installation: PackageInstallation; settings: unknown };
    expect(input.installation.resourceType).toBe('PackageInstallation');
    expect(input.settings).toBeDefined();

    // impl project linked
    const updatedProject = await getGlobalSystemRepo().readResource<Project>('Project', project.id);
    expect(updatedProject.link?.some((l) => l.project?.reference === 'Project/' + implProject.id)).toBe(true);

    const installations = await searchInstallations('10.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('installed');
  });

  test('setupBot failure records errorPhase and re-invoke skips Stage 1', async () => {
    const creds: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'information', code: 'informational', details: { text: 'ok' } }],
    };
    jest
      .spyOn(botExecute, 'executeBot')
      .mockResolvedValueOnce({ success: false, logResult: 'kaboom' })
      .mockResolvedValue({ success: true, logResult: '', returnValue: creds });

    const release = await publishRelease(setupBotBundle('test-setup-b'), {
      setupBot: 'test-setup-b',
      version: '11.0.0',
    });

    // First attempt: setupBot fails
    const res1 = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).not.toBe(200);

    let installations = await searchInstallations('11.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('error');
    expect(installations[0].extension?.find((e) => e.url === PackageInstallationErrorPhaseUrl)?.valueCode).toBe(
      'setup-bot'
    );
    expect(await countBots('test-setup-b')).toBe(1);

    // Re-invoke: Stage 1 is skipped (committed), setupBot re-runs and succeeds
    const res2 = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res2.status).toBe(200);

    // Still only one bot — Stage 1 did not run a second time
    expect(await countBots('test-setup-b')).toBe(1);

    installations = await searchInstallations('11.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('installed');
    expect(installations[0].extension?.find((e) => e.url === PackageInstallationErrorPhaseUrl)).toBeUndefined();
  });

  test('Identical re-invoke is an idempotent no-op', async () => {
    const creds: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'information', code: 'informational', details: { text: 'ok' } }],
    };
    const execSpy = jest
      .spyOn(botExecute, 'executeBot')
      .mockResolvedValue({ success: true, logResult: '', returnValue: creds });

    const release = await publishRelease(setupBotBundle('test-setup-c'), {
      setupBot: 'test-setup-c',
      version: '12.0.0',
    });

    const res1 = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res2.status).toBe(200);

    // No-op short-circuits before Stage 2, so the bot ran only once
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(await countBots('test-setup-c')).toBe(1);

    const installations = await searchInstallations('12.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('installed');
    expect(
      installations[0].extension?.find((e) => e.url === PackageInstallationConfigHashUrl)?.valueString
    ).toBeDefined();
  });

  test('Concurrent in-flight install returns 409', async () => {
    const release = await publishRelease(setupBotBundle('test-setup-d'), { version: '13.0.0' });

    // Pre-existing in-progress record (recent), simulating another caller in flight
    await withTestContext(() =>
      getGlobalSystemRepo().createResource<PackageInstallation>({
        resourceType: 'PackageInstallation',
        meta: { project: project.id },
        package: release.package,
        packageRelease: createReference(release),
        version: '13.0.0',
        status: 'installing',
        installedBy: { reference: 'Practitioner/' + randomUUID() },
      })
    );

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(409);
  });

  test('Validates settings against bundled Questionnaire', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      status: 'active',
      item: [{ linkId: 'API_KEY', text: 'API Key', type: 'string', required: true }],
    };
    const bundle: Bundle = {
      resourceType: 'Bundle',
      meta: { project: project.id },
      type: 'transaction',
      entry: [{ resource: questionnaire, request: { method: 'POST', url: 'Questionnaire' } }],
    };
    const release = await publishRelease(bundle, { version: '14.0.0' });

    // Missing the required API_KEY → 400
    const res1 = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).toBe(400);
    expect(res1.body.issue[0].details.text).toContain('API_KEY');

    // Required value supplied → 200
    const res2 = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'API_KEY', valueString: 'secret' }] });
    expect(res2.status).toBe(200);

    const installations = await searchInstallations('14.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('installed');
  });
});
