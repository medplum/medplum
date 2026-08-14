// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, resolveId } from '@medplum/core';
import type {
  Binary,
  Bot,
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
import { vi } from 'vitest';
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
    vi.restoreAllMocks();
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
    expect(res).toHaveStatus(403);
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
    vi.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${packageRelease.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res).toHaveStatus(200);

    const res2 = await request(app)
      .get(`/fhir/R4/PackageInstallation?version=${packageRelease.version}`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res2).toHaveStatus(200);
    const installations = res2.body.entry.map((e: any) => e.resource) as PackageInstallation[];
    expect(installations.length).toBe(1);
    expect(installations[0].status).toBe('installed');
    expect(installations[0].version).toBe('1.0.0');
  });

  test('Install Bundle of conditional upserts is not limited by the serializable entry cap', async () => {
    const systemRepo = getGlobalSystemRepo();
    const identifierSystem = 'https://example.com/' + randomUUID();

    // The entry caps only apply when the Bundle is processed as a transaction,
    // which requires the project feature.
    const txProject = await createTestProject({
      withAccessToken: true,
      project: { features: ['transaction-bundles'] },
      membership: { admin: true },
    });
    const txToken = txProject.accessToken;

    // Deliberately larger than maxSerializableTransactionEntries. Install Bundles
    // are written as conditional upserts so an install can be re-run, which would
    // otherwise force the whole transaction to be serializable and cap its size.
    const entryCount = 20;
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: Array.from({ length: entryCount }, (_, i) => ({
        resource: {
          resourceType: 'Patient' as const,
          identifier: [{ system: identifierSystem, value: `p${i}` }],
        },
        request: {
          method: 'PUT' as const,
          url: `Patient?identifier=${encodeURIComponent(identifierSystem)}|p${i}`,
        },
      })),
    };

    // The same Bundle submitted directly is rejected, which is the behavior the
    // install path has to avoid inheriting.
    const direct = await request(app)
      .post('/fhir/R4')
      .set('Authorization', 'Bearer ' + txToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(bundle);
    expect(direct.status).toBe(400);
    expect(direct.body.issue[0].details.text).toMatch(/too many entries/);

    const binary = await withTestContext(() =>
      systemRepo.createResource<Binary>({
        resourceType: 'Binary',
        meta: { project: txProject.project.id },
        contentType: ContentType.FHIR_JSON,
      })
    );
    const packageRelease = await withTestContext(() =>
      systemRepo.createResource<PackageRelease>({
        resourceType: 'PackageRelease',
        meta: { project: txProject.project.id },
        package: { reference: 'Package/' + randomUUID() },
        version: '1.0.0',
        content: { contentType: ContentType.FHIR_JSON, url: `Binary/${binary.id}` },
      })
    );
    vi.spyOn(storage, 'getBinaryStorage').mockImplementation(
      () => new MockBinaryStorage(JSON.stringify(bundle)) as unknown as BinaryStorage
    );

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${packageRelease.id}/$install`)
      .set('Authorization', 'Bearer ' + txToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(200);

    const created = await request(app)
      .get(`/fhir/R4/Patient?identifier=${encodeURIComponent(identifierSystem + '|p0')}`)
      .set('Authorization', 'Bearer ' + txToken);
    expect(created.body.entry).toHaveLength(1);
    const firstId = created.body.entry[0].resource.id;

    // Re-installing has to converge on the same resources rather than duplicate
    // them, which is the whole reason the entries are conditional.
    const reinstall = await request(app)
      .post(`/fhir/R4/PackageRelease/${packageRelease.id}/$install`)
      .set('Authorization', 'Bearer ' + txToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'force', valueBoolean: true }] });
    expect(reinstall.status).toBe(200);

    const after = await request(app)
      .get(`/fhir/R4/Patient?identifier=${encodeURIComponent(identifierSystem + '|p0')}`)
      .set('Authorization', 'Bearer ' + txToken);
    expect(after.body.entry).toHaveLength(1);
    expect(after.body.entry[0].resource.id).toBe(firstId);
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
    vi.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);

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
    vi.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);

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
    expect(res2).toHaveStatus(200);
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
    expect(res).toHaveStatus(404);
  });

  // A minimal install Bundle: one customer-side proxy Bot, which doubles as the
  // probe for whether the install bundle re-ran (see countBots). The setup bot is no
  // longer part of the Bundle — it is published into the impl project instead.
  function installBundle(identifier: string): Bundle {
    return {
      resourceType: 'Bundle',
      meta: { project: project.id },
      type: 'transaction',
      entry: [
        {
          resource: {
            resourceType: 'Bot',
            name: `Proxy Bot ${identifier}`,
            runtimeVersion: 'awslambda',
            identifier: [{ system: 'https://www.medplum.com/bots', value: identifier }],
          },
          request: { method: 'POST', url: 'Bot' },
        },
      ],
    };
  }

  // Creates an impl project holding a published, version-tagged setup bot, which
  // is how a real publisher ships a post-install hook.
  async function publishImplProjectWithSetupBot(
    setupBotIdentifier: string,
    options?: { runAsUser?: boolean }
  ): Promise<{ implProject: WithId<Project>; setupBot: WithId<Bot> }> {
    const systemRepo = getGlobalSystemRepo();
    const implProject = await withTestContext(() =>
      systemRepo.createResource<Project>({
        resourceType: 'Project',
        name: 'impl-' + randomUUID(),
        features: ['bots'],
      })
    );
    const setupBot = await withTestContext(() =>
      systemRepo.createResource<Bot>({
        resourceType: 'Bot',
        meta: { project: implProject.id },
        name: `Setup Bot ${setupBotIdentifier}`,
        runtimeVersion: 'awslambda',
        // Runs as the installing project admin so it can write into their project.
        runAsUser: options?.runAsUser ?? true,
        identifier: [{ system: 'https://www.medplum.com/bots', value: setupBotIdentifier }],
      })
    );
    return { implProject, setupBot };
  }

  async function publishRelease(
    bundle: Bundle,
    options?: { version?: string; setupBot?: string; implProject?: string; packageRef?: string }
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
        package: { reference: options?.packageRef ?? 'Package/' + randomUUID() },
        version: options?.version ?? '1.0.0',
        content: { contentType: ContentType.FHIR_JSON, url: `Binary/${binary.id}` },
        extension: extension.length > 0 ? extension : undefined,
      })
    );
    const mockBinaryStorage = new MockBinaryStorage(JSON.stringify(bundle));
    vi.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);
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

  test('Setup-bot phase returns credentials and links impl project', async () => {
    const { implProject, setupBot } = await publishImplProjectWithSetupBot('test-setup-a');
    const creds: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'information', code: 'informational', details: { text: 'client_id=abc;client_secret=xyz' } }],
    };
    const execSpy = vi
      .spyOn(botExecute, 'executeBot')
      .mockResolvedValue({ success: true, logResult: '', returnValue: creds });

    const release = await publishRelease(installBundle('test-proxy-a'), {
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
    const call = execSpy.mock.calls[0][0];
    const input = call.input as { installation: PackageInstallation; settings: unknown };
    expect(input.installation.resourceType).toBe('PackageInstallation');
    expect(input.settings).toBeDefined();

    // The bot that ran is the published impl-project bot, not a customer-side copy.
    expect(call.bot.id).toStrictEqual(setupBot.id);
    expect(call.bot.meta?.project).toStrictEqual(implProject.id);

    // runAsUser: true, so it executes as the installing admin and writes into
    // the customer project rather than as a non-admin bot membership.
    expect(resolveId(call.runAs.project)).toStrictEqual(project.id);

    // impl project linked
    const updatedProject = await getGlobalSystemRepo().readResource<Project>('Project', project.id);
    expect(updatedProject.link?.some((l) => l.project?.reference === 'Project/' + implProject.id)).toBe(true);

    const installations = await searchInstallations('10.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('installed');
  });

  test('setupBot failure records errorPhase and re-invoke skips the install bundle', async () => {
    const creds: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'information', code: 'informational', details: { text: 'ok' } }],
    };
    vi.spyOn(botExecute, 'executeBot')
      .mockResolvedValueOnce({ success: false, logResult: 'kaboom' })
      .mockResolvedValue({ success: true, logResult: '', returnValue: creds });

    const { implProject } = await publishImplProjectWithSetupBot('test-setup-b');
    const release = await publishRelease(installBundle('test-proxy-b'), {
      setupBot: 'test-setup-b',
      implProject: implProject.id,
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
    expect(await countBots('test-proxy-b')).toBe(1);

    // Re-invoke: the install bundle is skipped (committed), setupBot re-runs and succeeds
    const res2 = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res2.status).toBe(200);

    // Still only one bot — the install bundle did not run a second time
    expect(await countBots('test-proxy-b')).toBe(1);

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
    const execSpy = vi
      .spyOn(botExecute, 'executeBot')
      .mockResolvedValue({ success: true, logResult: '', returnValue: creds });

    const { implProject } = await publishImplProjectWithSetupBot('test-setup-c');
    const release = await publishRelease(installBundle('test-proxy-c'), {
      setupBot: 'test-setup-c',
      implProject: implProject.id,
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

    // No-op short-circuits before the setup-bot phase, so the bot ran only once
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(await countBots('test-proxy-c')).toBe(1);

    const installations = await searchInstallations('12.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('installed');
    expect(
      installations[0].extension?.find((e) => e.url === PackageInstallationConfigHashUrl)?.valueString
    ).toBeDefined();
  });

  test('setupBot declared without an impl project is rejected', async () => {
    const execSpy = vi.spyOn(botExecute, 'executeBot');

    const release = await publishRelease(installBundle('test-proxy-e'), {
      setupBot: 'test-setup-e',
      version: '20.0.0',
    });

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).not.toBe(200);
    expect(res.body.issue[0].details.text).toContain('no impl project');
    expect(execSpy).not.toHaveBeenCalled();

    const installations = await searchInstallations('20.0.0');
    expect(installations[0].status).toBe('error');
    expect(installations[0].extension?.find((e) => e.url === PackageInstallationErrorPhaseUrl)?.valueCode).toBe(
      'setup-bot'
    );
  });

  test('A customer-project bot cannot impersonate the published setupBot', async () => {
    const { implProject, setupBot } = await publishImplProjectWithSetupBot('test-setup-f');
    const execSpy = vi
      .spyOn(botExecute, 'executeBot')
      .mockResolvedValue({ success: true, logResult: '', returnValue: undefined });

    // A bot in the *calling* project sharing the setup bot's identifier. Resolution
    // is scoped to the impl project, so this must be ignored rather than preferred.
    const impostor = await withTestContext(() =>
      getGlobalSystemRepo().createResource<Bot>({
        resourceType: 'Bot',
        meta: { project: project.id },
        name: 'Impostor',
        runtimeVersion: 'awslambda',
        identifier: [{ system: 'https://www.medplum.com/bots', value: 'test-setup-f' }],
      })
    );

    const release = await publishRelease(installBundle('test-proxy-f'), {
      setupBot: 'test-setup-f',
      implProject: implProject.id,
      version: '21.0.0',
    });

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(200);

    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy.mock.calls[0][0].bot.id).toStrictEqual(setupBot.id);
    expect(execSpy.mock.calls[0][0].bot.id).not.toStrictEqual(impostor.id);
  });

  test('Installing a different version over an installed package is refused, not silently skipped', async () => {
    const packageRef = 'Package/' + randomUUID();
    const { implProject } = await publishImplProjectWithSetupBot('test-setup-v1');
    vi.spyOn(botExecute, 'executeBot').mockResolvedValue({ success: true, logResult: '', returnValue: undefined });

    const v1 = await publishRelease(installBundle('test-proxy-v1'), {
      packageRef,
      setupBot: 'test-setup-v1',
      implProject: implProject.id,
      version: '30.0.0',
    });
    const res1 = await request(app)
      .post(`/fhir/R4/PackageRelease/${v1.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).toBe(200);

    // Same package, new version, identical (empty) settings — so the config hash
    // matches and the old code would have returned allOk having applied nothing.
    const v2 = await publishRelease(installBundle('test-proxy-v2'), {
      packageRef,
      setupBot: 'test-setup-v1',
      implProject: implProject.id,
      version: '31.0.0',
    });
    const res2 = await request(app)
      .post(`/fhir/R4/PackageRelease/${v2.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res2.status).toBe(409);
    expect(res2.body.issue[0].details.text).toContain('upgrade');

    // v2's Bundle was not applied, and the record still describes v1.
    expect(await countBots('test-proxy-v2')).toBe(0);
    expect(await searchInstallations('31.0.0')).toHaveLength(0);
    const installations = await searchInstallations('30.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('installed');
  });

  test('A failed install can still be recovered by a newer release', async () => {
    const packageRef = 'Package/' + randomUUID();
    const { implProject } = await publishImplProjectWithSetupBot('test-setup-recover');
    vi.spyOn(botExecute, 'executeBot')
      .mockResolvedValueOnce({ success: false, logResult: 'kaboom' })
      .mockResolvedValue({ success: true, logResult: '', returnValue: undefined });

    const v1 = await publishRelease(installBundle('test-proxy-r1'), {
      packageRef,
      setupBot: 'test-setup-recover',
      implProject: implProject.id,
      version: '32.0.0',
    });
    const res1 = await request(app)
      .post(`/fhir/R4/PackageRelease/${v1.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).not.toBe(200);
    expect(
      (await searchInstallations('32.0.0'))[0].extension?.find((e) => e.url === PackageInstallationErrorPhaseUrl)
        ?.valueCode
    ).toBe('setup-bot');

    // The prior failure was in the setupBot, which normally means the install bundle
    // is skipped. Across versions it must not be, because what the install bundle
    // committed belongs to v1 —
    // and project admins cannot clear a PackageInstallation themselves, so refusing
    // here would wedge them permanently.
    const v2 = await publishRelease(installBundle('test-proxy-r2'), {
      packageRef,
      setupBot: 'test-setup-recover',
      implProject: implProject.id,
      version: '33.0.0',
    });
    const res2 = await request(app)
      .post(`/fhir/R4/PackageRelease/${v2.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res2.status).toBe(200);

    // The install bundle ran for the new version.
    expect(await countBots('test-proxy-r2')).toBe(1);
    const installations = await searchInstallations('33.0.0');
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('installed');
  });

  test('A setup bot published without runAsUser is refused', async () => {
    const { implProject } = await publishImplProjectWithSetupBot('test-setup-noimpersonate', { runAsUser: false });
    const execSpy = vi.spyOn(botExecute, 'executeBot');

    const release = await publishRelease(installBundle('test-proxy-g'), {
      setupBot: 'test-setup-noimpersonate',
      implProject: implProject.id,
      version: '34.0.0',
    });

    const res = await request(app)
      .post(`/fhir/R4/PackageRelease/${release.id}/$install`)
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).not.toBe(200);
    expect(res.body.issue[0].details.text).toContain('runAsUser');

    // Refused before execution, so it never ran with the impl project's privileges.
    expect(execSpy).not.toHaveBeenCalled();
  });

  test('Concurrent in-flight install returns 409', async () => {
    const release = await publishRelease(installBundle('test-proxy-d'), { version: '13.0.0' });

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
