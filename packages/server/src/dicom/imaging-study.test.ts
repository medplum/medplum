// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, Operator } from '@medplum/core';
import type { DicomInstance, DicomSeries, DicomStudy, ImagingStudy, Patient } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { Repository } from '../fhir/repo';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { createTestProject, withTestContext } from '../test.setup';
import { DICOM_UID_SYSTEM, reconcileImagingStudy } from './imaging-study';
import { scanStudy } from './utils';

describe('ImagingStudy reconciliation', () => {
  const app = express();
  let repo: Repository;
  let projectId: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const testProject = await createTestProject({ withRepo: true });
    repo = testProject.repo;
    projectId = testProject.project.id;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function createStudy(fields: Partial<DicomStudy> = {}): Promise<WithId<DicomStudy>> {
    return repo.createResource<DicomStudy>({
      resourceType: 'DicomStudy',
      studyInstanceUid: randomUUID(),
      ...fields,
    });
  }

  async function addSeries(
    study: DicomStudy,
    modality: string | undefined,
    instances: number,
    seriesNumber?: string
  ): Promise<WithId<DicomSeries>> {
    const series = await repo.createResource<DicomSeries>({
      resourceType: 'DicomSeries',
      study: createReference(study),
      seriesInstanceUid: randomUUID(),
      seriesNumber,
      modality,
    });
    for (let i = 0; i < instances; i++) {
      await repo.createResource<DicomInstance>({
        resourceType: 'DicomInstance',
        study: createReference(study),
        series: createReference(series),
        sopInstanceUid: randomUUID(),
        sopClassUid: '1.2.840.10008.5.1.4.1.1.7',
        metadata: '{}',
        raw: { reference: 'Binary/123' },
      });
    }
    return series;
  }

  async function reconcile(study: WithId<DicomStudy>): Promise<ImagingStudy | undefined> {
    // The system repo, because that is what the worker uses: it spans every project on the shard,
    // which is what makes the _project filters inside load-bearing.
    const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);
    await reconcileImagingStudy(systemRepo, study, await scanStudy(systemRepo, study.id));
    return repo.searchOne<ImagingStudy>({
      resourceType: 'ImagingStudy',
      filters: [
        {
          code: 'identifier',
          operator: Operator.EXACT,
          value: `${DICOM_UID_SYSTEM}|urn:oid:${study.studyInstanceUid}`,
        },
      ],
    });
  }

  test('Derives an ImagingStudy from the study, its series, and its instances', () =>
    withTestContext(async () => {
      const study = await createStudy({ patientName: 'TEST^PATIENT', studyId: 'ACC-1' });
      await addSeries(study, 'CT', 3, '1');
      await addSeries(study, 'PT', 2, '2');

      const imagingStudy = await reconcile(study);

      expect(imagingStudy).toMatchObject({
        status: 'available',
        numberOfSeries: 2,
        numberOfInstances: 5,
      });
      expect(imagingStudy?.modality?.map((m) => m.code)).toStrictEqual(['CT', 'PT']);
      expect(imagingStudy?.series?.map((s) => s.numberOfInstances)).toStrictEqual([3, 2]);
      // Instances are not enumerated; viewers read them from the series metadata route.
      expect(imagingStudy?.series?.[0].instance).toBeUndefined();
      expect(imagingStudy?.endpoint).toHaveLength(1);
    }));

  test('Reports a study with no instances as registered rather than available', () =>
    withTestContext(async () => {
      const study = await createStudy();

      expect(await reconcile(study)).toMatchObject({ status: 'registered', numberOfInstances: 0 });
    }));

  test('Does not create a new version when nothing changed', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, 'CT', 1);

      const first = await reconcile(study);
      const second = await reconcile(study);

      // A new version on every run would write a history row and re-dispatch every matching
      // Subscription once per arriving instance.
      expect(second?.meta?.versionId).toBe(first?.meta?.versionId);
    }));

  test('Picks up a series added after the first run, and drops one that was deleted', () =>
    withTestContext(async () => {
      const study = await createStudy();
      const first = await addSeries(study, 'CT', 1, '1');
      await reconcile(study);

      await addSeries(study, 'MR', 2, '2');
      expect(await reconcile(study)).toMatchObject({ numberOfSeries: 2, numberOfInstances: 3 });

      await repo.deleteResource('DicomSeries', first.id);
      const afterDelete = await reconcile(study);
      expect(afterDelete?.numberOfSeries).toBe(1);
      expect(afterDelete?.series?.[0].modality.code).toBe('MR');
    }));

  test('Orders series by series number regardless of the order they were stored in', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, 'MR', 1, '3');
      await addSeries(study, 'CT', 1, '1');
      await addSeries(study, 'PT', 1, '2');

      // Unsorted, this would churn a new version on every run: see the sort in deriveImagingStudy.
      expect((await reconcile(study))?.series?.map((series) => series.number)).toStrictEqual([1, 2, 3]);
    }));

  test('States the absence of a modality rather than asserting one the sender never sent', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, undefined, 1);

      const imagingStudy = await reconcile(study);

      // series.modality is required, so it cannot be dropped the way an unparseable date is. An
      // extension-only Coding satisfies the cardinality without inventing a code.
      const modality = imagingStudy?.series?.[0].modality;
      expect(modality?.code).toBeUndefined();
      expect(modality?.extension?.[0].valueCode).toBe('unknown');
    }));

  describe('subject resolution', () => {
    test('Links the Patient when exactly one matches the DICOM Patient ID', () =>
      withTestContext(async () => {
        const mrn = randomUUID();
        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          identifier: [{ value: mrn }],
        });
        const study = await createStudy({ patientId: mrn, patientName: 'TEST^PATIENT' });

        expect((await reconcile(study))?.subject).toMatchObject({ reference: `Patient/${patient.id}` });
      }));

    test('Falls back to a logical reference when the Patient ID is ambiguous', () =>
      withTestContext(async () => {
        const mrn = randomUUID();
        await repo.createResource<Patient>({ resourceType: 'Patient', identifier: [{ value: mrn }] });
        await repo.createResource<Patient>({ resourceType: 'Patient', identifier: [{ value: mrn }] });
        const study = await createStudy({ patientId: mrn, patientName: 'TEST^PATIENT' });

        const subject = (await reconcile(study))?.subject;
        expect(subject?.reference).toBeUndefined();
        expect(subject).toMatchObject({ identifier: { value: mrn }, display: 'TEST^PATIENT' });
      }));

    test('Never matches a Patient in another project', () =>
      withTestContext(async () => {
        const mrn = randomUUID();
        const other = await createTestProject({ withRepo: true });
        await other.repo.createResource<Patient>({ resourceType: 'Patient', identifier: [{ value: mrn }] });
        const study = await createStudy({ patientId: mrn, patientName: 'TEST^PATIENT' });

        // The study job runs on a system repository, which has no project of its own. Without an
        // explicit _project filter this would link a study to a patient in a different tenant.
        expect((await reconcile(study))?.subject?.reference).toBeUndefined();
      }));

    test('Upgrades a logical reference once the Patient exists', () =>
      withTestContext(async () => {
        const mrn = randomUUID();
        const study = await createStudy({ patientId: mrn, patientName: 'TEST^PATIENT' });
        expect((await reconcile(study))?.subject?.reference).toBeUndefined();

        const patient = await repo.createResource<Patient>({
          resourceType: 'Patient',
          identifier: [{ value: mrn }],
        });

        expect((await reconcile(study))?.subject).toMatchObject({ reference: `Patient/${patient.id}` });
      }));

    test('Keeps a corrected Patient reference even when nothing resolves any more', () =>
      withTestContext(async () => {
        const study = await createStudy({ patientId: randomUUID(), patientName: 'TEST^PATIENT' });
        const imagingStudy = await reconcile(study);
        expect(imagingStudy?.subject?.reference).toBeUndefined();

        // A human corrects the patient by hand. Re-deriving on every arriving instance must not
        // undo that, so the transition is one-way: logical to literal, never back.
        const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
        await repo.updateResource<ImagingStudy>({
          ...(imagingStudy as ImagingStudy),
          subject: createReference(patient),
        });

        expect((await reconcile(study))?.subject).toMatchObject({ reference: `Patient/${patient.id}` });
      }));
  });

  test('Preserves fields written by a human or a Bot', () =>
    withTestContext(async () => {
      const study = await createStudy();
      await addSeries(study, 'CT', 1);
      const imagingStudy = await reconcile(study);

      await repo.updateResource<ImagingStudy>({
        ...(imagingStudy as ImagingStudy),
        status: 'entered-in-error',
        note: [{ text: 'Wrong patient' }],
        description: 'Chest CT',
      });

      await addSeries(study, 'MR', 1);
      const after = await reconcile(study);

      expect(after?.note?.[0].text).toBe('Wrong patient');
      expect(after?.description).toBe('Chest CT');
      // A study someone retired is not resurrected by the next instance to arrive.
      expect(after?.status).toBe('entered-in-error');
      expect(after?.numberOfSeries).toBe(2);
    }));

  test('Reuses one WADO-RS Endpoint for the whole project', () =>
    withTestContext(async () => {
      const first = await createStudy();
      const second = await createStudy();

      const a = await reconcile(first);
      const b = await reconcile(second);

      expect(a?.endpoint?.[0].reference).toBe(b?.endpoint?.[0].reference);
      expect(projectId).toBeDefined();
    }));
});
