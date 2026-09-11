// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { BulkDataExportOutput, Observation } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { FileSystemStorage } from '../../storage/filesystem';
import { getBinaryStorage } from '../../storage/loader';
import { createTestProject, initTestAuth, waitForAsyncJob, withTestContext } from '../../test.setup';
import { getGlobalSystemRepo } from '../repo';
import { exportResourceType, exportResources } from './export';
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
      'OperationDefinition',
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

  test('exportResourceType reports deleted resources when since is provided', async () =>
    withTestContext(async () => {
      const accessToken = await initTestAuth({ membership: { admin: true } });

      const createRes = await request(app)
        .post('/fhir/R4/Observation')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ resourceType: 'Observation', status: 'final', code: { text: 'to be deleted' } });
      expect(createRes).toHaveStatus(201);
      const observationId = createRes.body.id;

      // `_since` must be strictly before the delete, and the delete's `_lastUpdated` must be
      // strictly >= `_since` for the deletion search filter to pick it up.
      const since = new Date().toISOString();

      const deleteRes = await request(app)
        .delete(`/fhir/R4/Observation/${observationId}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(deleteRes).toHaveStatus(200);

      const initRes = await request(app)
        .get(`/fhir/R4/$export?_since=${encodeURIComponent(since)}&_type=Observation`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Accept', ContentType.FHIR_JSON)
        .set('Prefer', 'respond-async');
      expect(initRes).toHaveStatus(202);
      expect(initRes.headers['content-location']).toBeDefined();

      const contentLocation = new URL(initRes.headers['content-location']);
      await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);

      const statusRes = await request(app)
        .get(contentLocation.pathname)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(statusRes).toHaveStatus(200);

      // The deleted resource must not also appear in `output`.
      const output = (statusRes.body.output ?? []) as BulkDataExportOutput[];
      expect(output.some((o) => o.type === 'Observation')).toBe(false);

      const deleted = statusRes.body.deleted as BulkDataExportOutput[] | undefined;
      expect(deleted).toBeDefined();
      expect(deleted?.length).toBe(1);
      expect(deleted?.[0].type).toBe('Observation');

      const deletedLocation = new URL(deleted?.[0].url as string);
      const deletedContent = (getBinaryStorage() as FileSystemStorage).readFileByUrlForTests(deletedLocation);
      const bundles = deletedContent
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(bundles).toHaveLength(1);
      expect(bundles[0].resourceType).toBe('Bundle');
      expect(bundles[0].type).toBe('transaction');
      expect(bundles[0].entry[0].request).toEqual({
        method: 'DELETE',
        url: `Observation/${observationId}`,
      });
    }));

  test('exportResourceType does not query for deletions when since is not provided', async () =>
    withTestContext(async () => {
      const exporter = new BulkExporter(systemRepo);
      const writeDeletedResourceSpy = vi.spyOn(exporter, 'writeDeletedResource');
      await exporter.start('http://example.com');

      const { project } = await createTestProject();
      await exportResourceType(exporter, 'Observation', 100, undefined);
      const bulkDataExport = await exporter.close(project);

      expect(writeDeletedResourceSpy).not.toHaveBeenCalled();
      const deletedParams = bulkDataExport.output?.parameter?.filter((p) => p.name === 'deleted');
      expect(deletedParams?.length ?? 0).toBe(0);
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