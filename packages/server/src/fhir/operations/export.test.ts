// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { AccessPolicy, AsyncJob, Binary, BulkDataExportOutput, Observation, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { FileSystemStorage } from '../../storage/filesystem';
import { getBinaryStorage } from '../../storage/loader';
import { addTestUser, createTestProject, initTestAuth, waitForAsyncJob, withTestContext } from '../../test.setup';
import { getGlobalSystemRepo, Repository } from '../repo';
import { rewriteAttachments, RewriteMode } from '../rewrite';
import { exportResources, exportResourceType } from './export';
import { BulkExporter } from './utils/bulkexporter';

describe('Export', () => {
  const app = express();
  const systemRepo = getGlobalSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Requester policy protects export jobs and Binary downloads', async () =>
    withTestContext(async () => {
      const { project, repo } = await createTestProject({ withRepo: true });
      await repo.createResource<Patient>({ resourceType: 'Patient' });
      const policy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Patient', readonly: true },
          { resourceType: 'AsyncJob', criteria: 'AsyncJob?requester=%profile', readonly: true },
          { resourceType: 'Binary', readonly: true },
        ],
      };
      const owner = await addTestUser(project, { accessPolicy: structuredClone(policy) });
      const other = await addTestUser(project, { accessPolicy: structuredClone(policy) });
      // Jobs without a known requester must not match either user's policy.
      await repo.getSystemRepo().createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'completed',
        request: 'https://example.com/legacy-export',
        requestTime: new Date().toISOString(),
        meta: { project: project.id },
      });
      const initRes = await request(app)
        .get('/fhir/R4/$export?_type=Patient')
        .auth(owner.accessToken, { type: 'bearer' });
      expect(initRes).toHaveStatus(202);
      const location = new URL(initRes.headers['content-location']);
      await waitForAsyncJob(location.toString(), app, owner.accessToken);
      const jobId = location.pathname.split('/').pop() as string;
      const job = await repo.getSystemRepo().readResource<AsyncJob>('AsyncJob', jobId);
      expect(job.requester?.reference).toBe(`Practitioner/${owner.profile.id}`);
      expect(job.meta?.author?.reference).toBe('system');
      const binaryRef = job.output?.parameter?.[0].part?.find((part) => part.name === 'url')?.valueUri as string;

      for (const [user, expectedIds] of [
        [owner, [jobId]],
        [other, []],
      ] as const) {
        const searchRes = await request(app).get('/fhir/R4/AsyncJob').auth(user.accessToken, { type: 'bearer' });
        expect(searchRes).toHaveStatus(200);
        expect(searchRes.body.entry?.map((entry: { resource: AsyncJob }) => entry.resource.id) ?? []).toEqual(
          expectedIds
        );
      }
      for (const [path, deniedStatus] of [
        // Bulk polling falls back to BulkDataExport, for which this policy grants no read access.
        [location.pathname, 403],
        [`/fhir/R4/AsyncJob/${jobId}`, 404],
        [`/fhir/R4/${binaryRef}/$presigned-url`, 403],
      ] as const) {
        const denied = await request(app).get(path).auth(other.accessToken, { type: 'bearer' });
        expect(denied.status, path).toBe(deniedStatus);
        const allowed = await request(app).get(path).auth(owner.accessToken, { type: 'bearer' });
        expect(allowed).toHaveStatus(200);
      }
    }));

  test.each(['/$export', '/Patient/$export'])('Ignores foreign _project on %s', async (endpoint) =>
    withTestContext(async () => {
      const caller = await createTestProject({ withAccessToken: true, withRepo: true });
      const other = await createTestProject({ withAccessToken: true, withRepo: true });
      const ownPatient = await caller.repo.createResource<Patient>({ resourceType: 'Patient' });
      await other.repo.createResource<Patient>({ resourceType: 'Patient' });

      const initRes = await request(app)
        .get(`/fhir/R4${endpoint}?_type=Patient&_project=${other.project.id}`)
        .set('Authorization', 'Bearer ' + caller.accessToken);
      expect(initRes).toHaveStatus(202);
      const location = new URL(initRes.headers['content-location']);
      await waitForAsyncJob(location.toString(), app, caller.accessToken);
      const statusRes = await request(app)
        .get(location.pathname)
        .set('Authorization', 'Bearer ' + caller.accessToken);
      expect(statusRes).toHaveStatus(200);
      const output = statusRes.body.output as BulkDataExportOutput[];
      expect(output).toHaveLength(1);
      const content = (getBinaryStorage() as FileSystemStorage).readFileByUrlForTests(new URL(output[0].url));
      expect(
        content
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).id)
      ).toEqual([ownPatient.id]);

      const jobId = location.pathname.split('/').pop() as string;
      const job = await caller.repo.readResource<AsyncJob>('AsyncJob', jobId);
      expect(job.meta?.project).toBe(caller.project.id);
      const binaryRef = job.output?.parameter?.[0].part?.find((part) => part.name === 'url')?.valueUri as string;
      const binary = await caller.repo.readReference({ reference: binaryRef });
      expect(binary.meta?.project).toBe(caller.project.id);

      for (const method of ['get', 'delete'] as const) {
        const agent = request(app);
        const denied = await agent[method](`${location.pathname}?_project=${caller.project.id}`).set(
          'Authorization',
          'Bearer ' + other.accessToken
        );
        expect(denied).toHaveStatus(404);
      }
      const deniedBinary = await request(app)
        .get(`/fhir/R4/${binaryRef}?_project=${caller.project.id}`)
        .set('Authorization', 'Bearer ' + other.accessToken);
      expect(deniedBinary).toHaveStatus(404);
    })
  );

  test.each(['/$export', '/Patient/$export'])('Excludes linked project resources on %s', async (endpoint) =>
    withTestContext(async () => {
      const linked = await createTestProject({ withRepo: true });
      const linkedPatient = await linked.repo.createResource<Patient>({ resourceType: 'Patient' });
      const caller = await createTestProject({
        withAccessToken: true,
        withRepo: true,
        project: { link: [{ project: { reference: `Project/${linked.project.id}` } }] },
      });
      const ownPatient = await caller.repo.createResource<Patient>({ resourceType: 'Patient' });
      // Prove the linked data is ordinarily readable by the caller.
      expect((await caller.repo.readResource('Patient', linkedPatient.id)).id).toBe(linkedPatient.id);

      const initRes = await request(app)
        .get(`/fhir/R4${endpoint}?_type=Patient&_project=${linked.project.id}`)
        .auth(caller.accessToken, { type: 'bearer' });
      expect(initRes).toHaveStatus(202);
      const location = new URL(initRes.headers['content-location']);
      await waitForAsyncJob(location.toString(), app, caller.accessToken);
      const statusRes = await request(app).get(location.pathname).auth(caller.accessToken, { type: 'bearer' });
      expect(statusRes).toHaveStatus(200);
      const output = statusRes.body.output as BulkDataExportOutput[];
      expect(output).toHaveLength(1);
      const content = (getBinaryStorage() as FileSystemStorage).readFileByUrlForTests(new URL(output[0].url));
      expect(JSON.parse(content.trim()).id).toBe(ownPatient.id);
    })
  );

  test('Export Binary requires access to its AsyncJob', async () =>
    withTestContext(async () => {
      const caller = await createTestProject({ withRepo: true, withClient: true });
      const patient = await caller.repo.createResource<Patient>({ resourceType: 'Patient', active: true });
      const exporter = new BulkExporter(caller.repo);
      const job = await exporter.start('http://example.com/fhir/R4/$export');
      await exportResources(exporter, caller.project, ['Patient'], 'System');

      const restrictedRepo = new Repository({
        author: { reference: `ClientApplication/${caller.client.id}` },
        projects: [caller.project],
        currentProject: caller.project,
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            { resourceType: 'Patient', criteria: 'Patient?active=false' },
            { resourceType: 'AsyncJob', criteria: 'AsyncJob?status=active' },
            { resourceType: 'Binary', readonly: true },
          ],
        },
      });
      await expect(restrictedRepo.readResource('Patient', patient.id)).rejects.toThrow();
      await expect(restrictedRepo.readResource('AsyncJob', job.id)).rejects.toThrow();
      const binary = exporter.writers.Patient.binary;
      expect(binary.securityContext).toEqual({ reference: `AsyncJob/${job.id}` });
      await expect(restrictedRepo.readResource<Binary>('Binary', binary.id)).rejects.toThrow();
      const result = await rewriteAttachments(RewriteMode.PRESIGNED_URL, restrictedRepo, {
        url: `Binary/${binary.id}`,
      });
      expect(result.url).toBe(`Binary/${binary.id}`);
      const authorized = await rewriteAttachments(RewriteMode.PRESIGNED_URL, caller.repo, {
        url: `Binary/${binary.id}`,
      });
      const content = (getBinaryStorage() as FileSystemStorage).readFileByUrlForTests(new URL(authorized.url));
      expect(JSON.parse(content.trim()).id).toBe(patient.id);
    }));

  test('Success', async () => {
    const accessToken = await initTestAuth({ membership: { admin: true } });
    expect(accessToken).toBeDefined();

    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        address: [{ use: 'home', line: ['123 Main St'], city: 'Anywhere', state: 'CA', postalCode: '90210' }],
        telecom: [
          { system: 'phone', value: '555-555-5555' },
          { system: 'email', value: 'alice@example.com' },
        ],
      });
    expect(res1).toHaveStatus(201);

    // Create observation
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: `Patient/${res1.body.id}` },
      });
    expect(res2).toHaveStatus(201);

    // Start the export
    const initRes = await request(app)
      .post('/fhir/R4/$export')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes).toHaveStatus(202);
    expect(initRes.headers['content-location']).toBeDefined();

    // Check the export status
    const contentLocation = new URL(initRes.headers['content-location']);
    await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);

    const statusRes = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(statusRes).toHaveStatus(200);
    const resBody = statusRes.body;

    const output = resBody?.output as BulkDataExportOutput[];
    expect(Object.values(output).map((ex) => ex.type)).toContainExactly([
      'ClientApplication',
      'Observation',
      'Patient',
      'Project',
      'ProjectMembership',
    ]);

    // Get the export content
    const outputLocation = new URL(output.find((o) => o.type === 'Observation')?.url as string);
    const outputContent = (getBinaryStorage() as FileSystemStorage).readFileByUrlForTests(outputLocation);

    // Output format is "ndjson", new line delimited JSON
    // However, we only expect one Observation, so we can parse it as JSON
    const resourceJSON = outputContent.trim().split('\n');
    expect(resourceJSON).toHaveLength(1);
    expect(JSON.parse(resourceJSON[0])?.subject?.reference).toStrictEqual(`Patient/${res1.body.id}`);
  });

  test('System Export Accepted with GET', async () => {
    const accessToken = await initTestAuth();

    // Start the export
    const initRes = await request(app)
      .get('/fhir/R4/$export')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes).toHaveStatus(202);
    expect(initRes.headers['content-location']).toBeDefined();
    await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);
  });

  test('Patient Export Accepted with GET', async () => {
    const accessToken = await initTestAuth();

    // Start the export
    const initRes = await request(app)
      .get('/fhir/R4/Patient/$export')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes).toHaveStatus(202);
    expect(initRes.headers['content-location']).toBeDefined();
    await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);
  });

  test('exportResourceType iterating through paginated search results', async () =>
    withTestContext(async () => {
      // Scope export to observations created in this test so pagination stays fast.
      const since = new Date().toISOString();

      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'preliminary',
        subject: { reference: 'Patient/123' },
        code: {
          text: 'patient observation 1',
        },
      });

      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'preliminary',
        subject: { reference: 'Patient/123' },
        code: {
          text: 'patient observation 2',
        },
      });

      const exporter = new BulkExporter(systemRepo);
      const exportWriteResourceSpy = vi.spyOn(exporter, 'writeResource');
      await exporter.start('http://example.com');

      const { project } = await createTestProject();
      expect(project).toBeDefined();
      await exportResourceType(exporter, 'Observation', 1, since);
      const bulkDataExport = await exporter.close(project);
      expect(bulkDataExport.status).toBe('completed');
      expect(exportWriteResourceSpy).toHaveBeenCalled();
    }));

  test('closeWriter removes only specified resource type from tracking', async () =>
    withTestContext(async () => {
      const exporter = new BulkExporter(systemRepo);
      await exporter.start('http://example.com');

      // Create and write multiple resource types
      const patient = await systemRepo.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Test'], family: 'Patient' }],
      });

      const observation = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: `Patient/${patient.id}` },
      });

      await exporter.writeResource(patient);
      await exporter.writeResource(observation);

      // Verify both resource types are tracked
      expect(exporter.resourceSets.size).toBe(2);
      expect(exporter.resourceSets.has('Patient')).toBe(true);
      expect(exporter.resourceSets.has('Observation')).toBe(true);
      expect(exporter.resourceSets.get('Patient')?.has(`Patient/${patient.id}`)).toBe(true);
      expect(exporter.resourceSets.get('Observation')?.has(`Observation/${observation.id}`)).toBe(true);

      // Close writer for Observation (which clears tracking for that type)
      await exporter.closeWriter('Observation');

      // Verify only Observation was removed from tracking
      expect(exporter.resourceSets.size).toBe(1);
      expect(exporter.resourceSets.has('Patient')).toBe(true);
      expect(exporter.resourceSets.has('Observation')).toBe(false);
      expect(exporter.resourceSets.get('Patient')?.has(`Patient/${patient.id}`)).toBe(true);

      const { project } = await createTestProject();
      await exporter.close(project);
    }));

  test('closeWriter called for each resource type during export', async () =>
    withTestContext(async () => {
      // Create test resources
      await systemRepo.createResource({
        resourceType: 'Patient',
        name: [{ given: ['Test'], family: 'Patient' }],
      });

      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
      });

      const exporter = new BulkExporter(systemRepo);
      const closeWriterSpy = vi.spyOn(exporter, 'closeWriter');

      await exporter.start('http://example.com');
      const { project } = await createTestProject();

      // Export only Patient and Observation types
      await exportResources(exporter, project, ['Patient', 'Observation'], 'System');

      // Verify closeWriter was called for each exported resource type
      expect(closeWriterSpy).toHaveBeenCalledWith('Patient');
      expect(closeWriterSpy).toHaveBeenCalledWith('Observation');

      // Verify that tracking was cleared (resourceSets should be empty after close)
      expect(exporter.resourceSets.size).toBe(0);
    }));
});
