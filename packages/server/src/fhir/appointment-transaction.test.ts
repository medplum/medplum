// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import type { Appointment, Bundle, Slot } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';

/** Exercises the delete/create/conditional-update pattern used by manual rescheduling. */
describe('Appointment replacement transactions', () => {
  const app = express();
  beforeAll(async () => {
    await initApp(app, await loadTestConfig());
  });
  afterAll(async () => {
    await shutdownApp();
  });

  test.each(['success', 'concurrent-update', 'stale-version', 'denied-update', 'invalid-slot'] as const)(
    '%s commits or rolls back every appointment and slot write',
    async (scenario) => {
      const project = await createTestProject({
        project: { features: ['transaction-bundles'], checkReferencesOnWrite: true },
        withRepo: true,
        withAccessToken: true,
        accessPolicy: {
          resource: [
            { resourceType: 'Appointment' },
            { resourceType: 'Slot' },
            { resourceType: 'Schedule' },
            { resourceType: 'Practitioner' },
          ],
        },
      });
      const repo = project.repo;
      const actor = await repo.createResource({ resourceType: 'Practitioner' });
      const schedules = [];
      for (let index = 0; index < 2; index++) {
        schedules.push(
          await repo.createResource({ resourceType: 'Schedule', active: true, actor: [createReference(actor)] })
        );
      }
      const oldStart = '2026-08-18T15:00:00.000Z';
      const oldEnd = '2026-08-18T15:37:00.123Z';
      const oldSlots = [];
      for (const schedule of schedules) {
        oldSlots.push(
          await repo.createResource<Slot>({
            resourceType: 'Slot',
            schedule: createReference(schedule),
            status: 'busy',
            start: oldStart,
            end: oldEnd,
          })
        );
      }
      const original = await repo.createResource<Appointment>({
        resourceType: 'Appointment',
        status: 'booked',
        start: oldStart,
        end: oldEnd,
        slot: oldSlots.map(createReference),
        participant: [{ actor: createReference(actor), status: 'accepted' }],
        extension: [{ url: 'https://example.org/metadata', valueString: 'keep' }],
        comment: 'Keep clinical data',
      });
      let expected = original;
      if (scenario === 'stale-version') {
        expected = await repo.updateResource({ ...original, comment: 'Concurrent edit' });
      }
      if (scenario === 'denied-update') {
        await repo.getSystemRepo().updateResource({
          ...project.accessPolicy,
          resource: project.accessPolicy.resource?.map((rule) =>
            rule.resourceType === 'Appointment' ? { ...rule, readonly: true } : rule
          ),
        });
      }
      const start = '2026-08-19T03:07:00.000Z';
      const end = '2026-08-19T03:44:00.123Z';
      // Another visit occupies the new time; a transaction deliberately does not apply scheduling rules.
      const conflict = await repo.createResource<Slot>({
        resourceType: 'Slot',
        schedule: createReference(schedules[0]),
        status: 'busy-unavailable',
        start,
        end,
      });
      const slotUrls = schedules.map(() => `urn:uuid:${randomUUID()}`);
      const transaction: Bundle<Appointment | Slot> = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          ...oldSlots.map((slot) => ({ request: { method: 'DELETE', url: getReferenceString(slot) } as const })),
          ...schedules.map((schedule, index) => ({
            fullUrl: slotUrls[index],
            request: { method: 'POST', url: 'Slot' } as const,
            resource: {
              resourceType: 'Slot',
              schedule:
                scenario === 'invalid-slot' && index === 1
                  ? { reference: `Schedule/${randomUUID()}` }
                  : createReference(schedule),
              status: 'busy',
              start,
              end,
            } satisfies Slot,
          })),
          {
            request: { method: 'PUT', url: getReferenceString(original), ifMatch: `W/"${original.meta?.versionId}"` },
            resource: { ...original, start, end, slot: slotUrls.map((reference) => ({ reference })) },
          },
        ],
      };
      const submit = (): request.Test =>
        request(app)
          .post('/fhir/R4/')
          .set('Authorization', 'Bearer ' + project.accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send(transaction);
      let response;
      if (scenario === 'concurrent-update') {
        const responses = await Promise.all([submit(), submit()]);
        expect(responses.map((res) => res.status).sort()).toEqual([200, 412]);
        response = responses.find((res) => res.status === 200) as (typeof responses)[0];
      } else {
        response = await submit();
      }
      if (scenario === 'success' || scenario === 'concurrent-update') {
        expect(response).toHaveStatus(200);
        const written = (response.body as Bundle<WithId<Appointment> | WithId<Slot>>).entry?.find(
          (entry) => entry.resource?.resourceType === 'Appointment'
        )?.resource as WithId<Appointment>;
        expect(written.id).toBe(original.id);
        expect(written.extension).toEqual(original.extension);
        expect(written.comment).toBe(original.comment);
        expect(written.participant).toEqual(original.participant);
        expect(Date.parse(written.end as string) - Date.parse(written.start as string)).toBe(2220123);
        expect(written.slot).toHaveLength(2);
        for (const slot of oldSlots) {
          await expect(repo.readResource('Slot', slot.id)).rejects.toThrow();
        }
      } else {
        const status = { 'stale-version': 412, 'denied-update': 403, 'invalid-slot': 400 }[scenario];
        expect(response).toHaveStatus(status);
        const unchanged = await repo.readResource('Appointment', original.id);
        expect(unchanged).toEqual(expected);
        for (const slot of oldSlots) {
          expect(await repo.readResource('Slot', slot.id)).toEqual(slot);
        }
        const newSlots = await repo.searchResources<Slot>({
          resourceType: 'Slot',
          filters: [{ code: 'start', operator: 'eq', value: start }],
        });
        expect(newSlots.map((slot) => slot.id)).toEqual([conflict.id]);
      }
    }
  );
});
