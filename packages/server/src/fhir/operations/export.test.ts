// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest } from '@medplum/fhir-router';
import type { Binary, BulkDataExportOutput, Observation, Patient, Resource } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { FileSystemStorage } from '../../storage/filesystem';
import { getBinaryStorage } from '../../storage/loader';
import {
  addTestUser,
  createTestProject,
  initTestAuth,
  streamToString,
  waitForAsyncJob,
  withTestContext,
} from '../../test.setup';
import { getTestProjectSystemRepo } from '../repository/test-utils';
import { exportResourceType, exportResources } from './export';
import { groupExportResources } from './groupexport';
import { BulkExporter } from './utils/bulkexporter';
import { parseExportParameters, parseExportTypeFilters } from './utils/export';

describe('Export', () => {
  const app = express();
  const systemRepo = getTestProjectSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const accessToken = await initTestAuth({ membership: { admin: true } });

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
    expect(resBody.requiresAccessToken).toBe(false);

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

  test('Export output Binary is bound to async job security context', async () => {
    const testProject = await createTestProject({ withAccessToken: true });

    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + testProject.accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Bound'], family: 'Context' }],
      });
    expect(patientRes).toHaveStatus(201);

    const initRes = await request(app)
      .post('/fhir/R4/$export')
      .set('Authorization', 'Bearer ' + testProject.accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes).toHaveStatus(202);

    await waitForAsyncJob(initRes.headers['content-location'], app, testProject.accessToken);

    const statusPath = new URL(initRes.headers['content-location']).pathname;
    const statusRes = await request(app)
      .get(statusPath)
      .set('Authorization', 'Bearer ' + testProject.accessToken);
    expect(statusRes).toHaveStatus(200);
    expect(statusRes.body.requiresAccessToken).toBe(false);

    const output = statusRes.body.output as BulkDataExportOutput[];
    const patientOutput = output.find((entry) => entry.type === 'Patient');
    expect(patientOutput?.url).toBeDefined();
    const binaryId = new URL(patientOutput?.url as string).pathname.split('/').filter(Boolean)[1];
    expect(binaryId).toBeDefined();

    const binaryRes = await request(app)
      .get(`/fhir/R4/Binary/${binaryId}`)
      .set('Authorization', 'Bearer ' + testProject.accessToken)
      .set('Accept', ContentType.FHIR_JSON);
    expect(binaryRes).toHaveStatus(200);
    expect((binaryRes.body as Binary).securityContext?.reference).toStrictEqual(
      `AsyncJob/${new URL(initRes.headers['content-location']).pathname.split('/').filter(Boolean).at(-1)}`
    );

    const restrictedUser = await addTestUser(testProject.project, {
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Binary', interaction: ['read'] }],
      },
    });

    const restrictedBinaryReadRes = await request(app)
      .get(`/fhir/R4/Binary/${binaryId}`)
      .set('Authorization', 'Bearer ' + restrictedUser.accessToken);
    expect(restrictedBinaryReadRes).toHaveStatus(403);

    const restrictedPresignRes = await request(app)
      .get(`/fhir/R4/Binary/${binaryId}/$presigned-url`)
      .set('Authorization', 'Bearer ' + restrictedUser.accessToken);
    expect(restrictedPresignRes).toHaveStatus(403);
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

  test('Export parameter parsing preserves repeated values and POST precedence', () => {
    const req: FhirRequest = { method: 'POST', url: '/$export', pathname: '/$export', params: {}, query: {}, body: {} };
    const query = {
      _type: ['Patient', 'Observation'],
      _typeFilter: ['Patient?active=true', 'Observation?status=final,preliminary'],
      _since: '2000-01-01T00:00:00Z',
    };
    for (const method of ['GET', 'POST'] as const) {
      expect(parseExportParameters({ ...req, method, query })).toEqual({
        types: query._type,
        typeFilters: query._typeFilter,
        since: query._since,
      });
    }
    expect(parseExportParameters({ ...req, method: 'GET' })).toEqual({
      types: undefined,
      typeFilters: [],
      since: undefined,
    });
    expect(parseExportParameters({ ...req, query: { _type: 'Patient,Observation' } }).types).toEqual([
      'Patient',
      'Observation',
    ]);
    const parameter = [
      { name: '_type', valueString: 'Observation' },
      { name: '_type', valueString: 'Patient' },
      { name: '_type', valueString: 'Patient' },
      { name: '_typeFilter', valueString: 'Observation?status=final' },
      { name: '_typeFilter', valueString: 'Observation?status=preliminary' },
      { name: '_since', valueInstant: '2100-01-01T00:00:00Z' },
    ];
    expect(parseExportParameters({ ...req, query, body: { resourceType: 'Parameters', parameter } })).toEqual({
      types: ['Observation', 'Patient'],
      typeFilters: ['Observation?status=final', 'Observation?status=preliminary'],
      since: '2100-01-01T00:00:00Z',
    });
    for (const invalid of [
      { name: '_type', valueString: 'Patient,Observation' },
      { name: '_type', valueCode: 'Patient' },
      { name: '_typeFilter', valueCode: 'Observation?status=final' },
    ]) {
      expect(() =>
        parseExportParameters({
          ...req,
          body: { resourceType: 'Parameters', parameter: [invalid] },
        })
      ).toThrow(OperationOutcomeError);
    }
  });

  // System and Patient share an execution path. Group has a separate candidate-filtering path.
  test.each(['System', 'Group'])('%s filters select independently by type', async (level) =>
    withTestContext(async () => {
      const { repo, project } = await createTestProject({ withRepo: true });
      const patients = [
        await repo.createResource<Patient>({ resourceType: 'Patient', active: true }),
        await repo.createResource<Patient>({ resourceType: 'Patient', active: false }),
      ];
      const observations: WithId<Observation>[] = [];
      for (const status of ['final', 'preliminary', 'amended'] as const) {
        observations.push(
          await repo.createResource<Observation>({
            resourceType: 'Observation',
            status,
            code: { text: 'Test' },
            subject: { reference: `Patient/${patients[1].id}` },
          })
        );
      }
      const group = {
        resourceType: 'Group' as const,
        type: 'person' as const,
        actual: true,
        member: patients.map((patient) => ({ entity: { reference: `Patient/${patient.id}` } })),
      };
      for (const scenario of [
        {
          name: 'filter without type selection',
          types: undefined,
          filters: ['Observation?status=final'],
          patients: [0, 1],
          observations: [0],
        },
        {
          name: 'independent filters, OR across queries, AND within queries',
          types: ['Patient', 'Observation'] as const,
          filters: [
            'Patient?active=true',
            'Observation?status=final',
            'Observation?status=final,preliminary',
            'Observation?status=amended&code=nonexistent',
          ],
          patients: [0],
          observations: [0, 1],
        },
        {
          name: 'filter on unselected type',
          types: ['Observation'] as const,
          filters: ['Patient?active=true'],
          patients: [],
          observations: [0, 1, 2],
        },
        {
          name: 'Patient filter does not restrict related observations',
          types: ['Patient', 'Observation'] as const,
          filters: ['Patient?active=true'],
          patients: [0],
          observations: [0, 1, 2],
        },
      ]) {
        const exporter = new BulkExporter(repo);
        await exporter.start('http://example.com');
        const filters = parseExportTypeFilters(repo, scenario.filters);
        const types = scenario.types ? [...scenario.types] : undefined;
        if (level === 'Group') {
          await groupExportResources(repo, exporter, project, group, { _type: types }, filters);
        } else {
          await exportResources(exporter, project, types, level, undefined, filters);
        }
        const resources: Resource[] = [];
        for (const writer of Object.values(exporter.writers)) {
          const content = await streamToString(await getBinaryStorage().readBinary(writer.binary));
          resources.push(
            ...content
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
          );
        }
        expect(
          resources
            .filter((r) => r.resourceType === 'Patient')
            .map((r) => r.id)
            .sort(),
          scenario.name
        ).toEqual(scenario.patients.map((index) => patients[index].id).sort());
        expect(
          resources
            .filter((r) => r.resourceType === 'Observation')
            .map((r) => r.id)
            .sort(),
          scenario.name
        ).toEqual(scenario.observations.map((index) => observations[index].id).sort());
        if (types) {
          expect(
            resources.every((r) => (types as string[]).includes(r.resourceType)),
            scenario.name
          ).toBe(true);
        }
      }
    })
  );

  test('Rejects unsupported export filters before creating a job', async () =>
    withTestContext(async () => {
      const { repo, accessToken } = await createTestProject({ withRepo: true, withAccessToken: true });
      // One example per validation boundary; ordinary search grammar is covered by search tests.
      for (const value of [
        'Observation',
        'Patient/123/Observation?status=final',
        'NotAResource?status=final',
        'Observation?unknown-search-param=true',
        'Observation?status:invalid=final',
        'Observation?status:status=final',
        'Observation?subject:Patient.active:invalid=true',
        'Observation?subject:Patient.unknown=true',
        'Observation?status=%ZZ',
        'Observation?&&',
        'Observation?date=not-a-date',
        'Observation?_filter=(',
        'Observation?_include:iterate=Observation:subject',
        'Observation?_sort=date',
        'Observation?_count=1',
        'Observation?_type=Patient',
        'Observation?_deleted=true',
      ]) {
        expect(() => parseExportTypeFilters(repo, [value]), value).toThrow(OperationOutcomeError);
      }
      expect(parseExportTypeFilters(repo, ['Observation?subject:Patient.active=false'])).toHaveLength(1);
      const res = await request(app)
        .post('/fhir/R4/$export')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Parameters',
          parameter: [{ name: '_typeFilter', valueString: 'Observation?_sort=date' }],
        });
      expect(res).toHaveStatus(400);
      expect(res.body.resourceType).toBe('OperationOutcome');
      expect(res.headers['content-location']).toBeUndefined();
      expect((await repo.search({ resourceType: 'AsyncJob' })).entry ?? []).toHaveLength(0);
    }));

  test('Group type filters stay within the cohort and apply to contextual references', async () =>
    withTestContext(async () => {
      const { repo, accessToken } = await createTestProject({ withRepo: true, withAccessToken: true });
      const organization = await repo.createResource({ resourceType: 'Organization', name: 'Excluded' });
      const member = await repo.createResource<Patient>({
        resourceType: 'Patient',
        managingOrganization: { reference: `Organization/${organization.id}` },
      });
      const outsider = await repo.createResource<Patient>({ resourceType: 'Patient' });
      const included = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Test' },
        subject: { reference: `Patient/${member.id}` },
      });
      await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Test' },
        subject: { reference: `Patient/${outsider.id}` },
      });
      const otherProject = await createTestProject({ withRepo: true });
      await otherProject.repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Test' },
        subject: { reference: `Patient/${member.id}` },
      });
      const device = await repo.createResource({ resourceType: 'Device', status: 'inactive' });
      const group = await repo.createResource({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [{ entity: { reference: `Patient/${member.id}` } }, { entity: { reference: `Device/${device.id}` } }],
      });
      const res = await request(app)
        .post(`/fhir/R4/Group/${group.id}/$export`)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: '_typeFilter', valueString: 'Observation?status=final' },
            { name: '_typeFilter', valueString: 'Organization?name=Included' },
            { name: '_typeFilter', valueString: 'Device?status=active' },
          ],
        });
      expect(res).toHaveStatus(202);
      const result = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
      const output = result.output as unknown as BulkDataExportOutput[];
      expect(output.map((file) => file.type).sort()).toEqual(['Group', 'Observation', 'Patient']);
      const file = output.find((item) => item.type === 'Observation') as BulkDataExportOutput;
      const content = (getBinaryStorage() as FileSystemStorage).readFileByUrlForTests(new URL(file.url));
      expect(
        content
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).id)
      ).toEqual([included.id]);
    }));

  test('Patient POST export passes repeated parameters and _since to the exporter', async () =>
    withTestContext(async () => {
      const { repo, accessToken } = await createTestProject({ withRepo: true, withAccessToken: true });
      await repo.createResource<Patient>({ resourceType: 'Patient', active: true });
      await repo.createResource<Observation>({ resourceType: 'Observation', status: 'final', code: { text: 'Test' } });
      const res = await request(app)
        .post('/fhir/R4/Patient/$export?_type=Encounter&_since=2000-01-01T00:00:00Z')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: '_type', valueString: 'Patient' },
            { name: '_type', valueString: 'Observation' },
            { name: '_typeFilter', valueString: 'Patient?active=false' },
            { name: '_typeFilter', valueString: 'Observation?status=final' },
          ],
        });
      expect(res).toHaveStatus(202);
      const result = await waitForAsyncJob(res.headers['content-location'], app, accessToken);
      expect((result.output as unknown as BulkDataExportOutput[]).map((file) => file.type)).toEqual(['Observation']);
      const future = await request(app)
        .post('/fhir/R4/Patient/$export?_since=2000-01-01T00:00:00Z')
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Parameters',
          parameter: [
            { name: '_type', valueString: 'Observation' },
            { name: '_since', valueInstant: '2100-01-01T00:00:00Z' },
          ],
        });
      expect(future).toHaveStatus(202);
      expect((await waitForAsyncJob(future.headers['content-location'], app, accessToken)).output).toEqual([]);
    }));

  test('Filtered export paginates, deduplicates OR matches, and applies _since to each query', async () =>
    withTestContext(async () => {
      const { repo, project } = await createTestProject({ withRepo: true });
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
      const resources = [];
      for (const status of ['final', 'preliminary', 'amended'] as const) {
        resources.push(
          await repo.createResource<Observation>({
            resourceType: 'Observation',
            status,
            code: { text: 'Test' },
            subject: { reference: `Patient/${patient.id}` },
          })
        );
      }
      const filters = parseExportTypeFilters(repo, [
        'Observation?status=final,preliminary',
        'Observation?status=final',
      ]);
      const exporter = new BulkExporter(repo);
      await exporter.start('http://example.com');
      await exportResourceType(exporter, 'Observation', 1, '2000-01-01T00:00:00Z', filters);
      await exporter.close(project);
      const content = await streamToString(await getBinaryStorage().readBinary(exporter.writers.Observation.binary));
      expect(
        content
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).id)
          .sort()
      ).toEqual(
        resources
          .slice(0, 2)
          .map((r) => r.id)
          .sort()
      );
      const futureExporter = new BulkExporter(repo);
      await futureExporter.start('http://example.com');
      await exportResourceType(futureExporter, 'Observation', 1, '2100-01-01T00:00:00Z', filters);
      await futureExporter.close(project);
      expect(futureExporter.writers).toEqual({});

      // The first Group page contains only the Patient and has no matching Observation.
      const group = await repo.createResource({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [{ entity: { reference: `Patient/${patient.id}` } }],
      });
      const groupExporter = new BulkExporter(repo);
      await groupExporter.start('http://example.com');
      await groupExportResources(
        repo,
        groupExporter,
        project,
        group,
        { _type: ['Observation'], _count: 1 },
        parseExportTypeFilters(repo, ['Observation?status=final'])
      );
      expect(Object.keys(groupExporter.writers)).toEqual(['Observation']);
      const groupContent = await streamToString(
        await getBinaryStorage().readBinary(groupExporter.writers.Observation.binary)
      );
      expect(
        groupContent
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).id)
      ).toEqual([resources[0].id]);
    }));

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
      expect(exporter.resourceSets.get('Patient')?.has(patient.id)).toBe(true);
      expect(exporter.resourceSets.get('Observation')?.has(observation.id)).toBe(true);

      // Close writer for Observation (which clears tracking for that type)
      await exporter.closeWriter('Observation');

      // Verify only Observation was removed from tracking
      expect(exporter.resourceSets.size).toBe(1);
      expect(exporter.resourceSets.has('Patient')).toBe(true);
      expect(exporter.resourceSets.has('Observation')).toBe(false);
      expect(exporter.resourceSets.get('Patient')?.has(patient.id)).toBe(true);

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

  test('exportResourceType does not track exported resources for dedupe', async () =>
    withTestContext(async () => {
      const since = new Date().toISOString();
      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'no dedupe' },
      });

      const exporter = new BulkExporter(systemRepo);
      await exporter.start('http://example.com');
      const closeWriter = exporter.closeWriter.bind(exporter);
      let trackedBeforeClose: boolean | undefined;
      vi.spyOn(exporter, 'closeWriter').mockImplementation(async (resourceType) => {
        trackedBeforeClose = exporter.resourceSets.has(resourceType);
        return closeWriter(resourceType);
      });

      await exportResourceType(exporter, 'Observation', 1, since);
      expect(trackedBeforeClose).toBe(false);
      expect(exporter.writers.Observation).toBeDefined();

      const { project } = await createTestProject();
      await exporter.close(project);
    }));

  test('writeResource dedupes by default', async () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });

      const exporter = new BulkExporter(systemRepo);
      await exporter.start('http://example.com');
      await exporter.writeResource(patient);
      await exporter.writeResource(patient);

      const { project } = await createTestProject();
      await exporter.close(project);

      const binary = await systemRepo.readResource<Binary>('Binary', exporter.writers.Patient.binary.id);
      const content = await streamToString(await getBinaryStorage().readBinary(binary));
      expect(content.trim().split('\n')).toHaveLength(1);
    }));

  test('Backpressure waits do not leak stream listeners', async () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });

      const exporter = new BulkExporter(systemRepo);
      await exporter.start('http://example.com');
      await exporter.writeResource(patient, { skipDedupe: true });
      const stream = exporter.writers.Patient['stream'];
      // Wait for the storage pipeline to attach its own listeners before sampling
      await vi.waitFor(() => expect(stream.listenerCount('error')).toBeGreaterThan(0));
      const baseline = stream.listenerCount('error');

      // Simulate a full buffer on every write so each one waits for 'drain'
      const writeSpy = vi.spyOn(stream, 'write').mockImplementation(() => {
        setImmediate(() => stream.emit('drain'));
        return false;
      });
      for (let i = 0; i < 20; i++) {
        await exporter.writeResource(patient, { skipDedupe: true });
      }
      expect(writeSpy).toHaveBeenCalledTimes(20);
      expect(stream.listenerCount('error')).toBe(baseline);
      writeSpy.mockRestore();

      const { project } = await createTestProject();
      await exporter.close(project);
    }));
});
