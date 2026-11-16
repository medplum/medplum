// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { deepClone, getReferenceString, MedplumClient, validateResource } from '@medplum/core';
import type { Bundle, Questionnaire, QuestionnaireResponse, RelatedPerson } from '@medplum/fhirtypes';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';

// Execute the documentation's source as an integration fixture. It lives outside the server's
// TypeScript rootDir, so load it by URL rather than adding examples to the server's build graph.
const exampleUrl = new URL('../../../../examples/src/questionnaires/assembled-questionnaires.ts', import.meta.url).href;
const savingUrl = new URL('../../../../examples/src/questionnaires/saving-responses.ts', import.meta.url).href;

describe('Documented assembly and response lifecycle', () => {
  const app = express();
  let server: Server;
  let medplum: MedplumClient;

  beforeAll(async () => {
    await initApp(app, await loadTestConfig());
    const { accessToken } = await createTestProject({ withAccessToken: true });
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });
    medplum = new MedplumClient({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
      fetch: globalThis.fetch,
    });
    medplum.setAccessToken(accessToken);
  });
  afterAll(async () => {
    medplum.clear();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await shutdownApp();
  });

  test('assembles two modules with repeated contacts, saves one response, reopens its original version, and extracts both contacts', async () => {
    const example = await import(exampleUrl);
    const saving = await import(savingUrl);
    const assembly: { questionnaire: Questionnaire } = await example.assembleContactIntake(medplum);
    expect(assembly.questionnaire.version).toBe('1');
    expect(validateResource(assembly.questionnaire)).toEqual([]);
    expect(assembly.questionnaire.item?.[1].item?.[0].linkId).toBe('primary.details');
    expect(assembly.questionnaire.item?.[3].enableWhen?.[0].question).toBe('add-secondary');
    expect(assembly.questionnaire.contained?.map((r) => r.id)).toEqual([
      'primary.contact-template',
      'secondary.contact-template',
    ]);
    const published: Questionnaire = await example.publishReviewedAssembly(medplum, assembly.questionnaire);
    expect((await example.publishReviewedAssembly(medplum, assembly.questionnaire)).id).toBe(published.id);
    const representations = await medplum.searchResources('Questionnaire', {
      url: published.url as string,
      version: '1',
    });
    expect(representations).toHaveLength(2);
    expect(
      representations.map((q) =>
        q.extension?.filter((e) => e.url.endsWith('/cqf-knowledgeCapability')).map((e) => e.valueCode)
      )
    ).toEqual(expect.arrayContaining([['computable'], ['computable', 'executable']]));

    const patient = await medplum.createResource({ resourceType: 'Patient', name: [{ text: 'Example Patient' }] });
    const assigned: QuestionnaireResponse = await saving.getOrCreateDraft(
      medplum,
      published,
      { reference: getReferenceString(patient) },
      'visit-1'
    );
    const edited: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      // QuestionnaireForm initializes this to the canonical. The save helper restores the assignment reference.
      questionnaire: published.url,
      item: [
        { linkId: 'visit', item: [{ linkId: 'visit.reason', answer: [{ valueString: 'Discuss my upcoming visit' }] }] },
        {
          linkId: 'primary',
          item: [
            {
              linkId: 'primary.details',
              item: [{ linkId: 'primary.name', answer: [{ valueString: 'First Contact' }] }],
            },
          ],
        },
        { linkId: 'add-secondary', answer: [{ valueBoolean: true }] },
        {
          linkId: 'secondary',
          item: [
            {
              linkId: 'secondary.details',
              item: [{ linkId: 'secondary.name', answer: [{ valueString: 'Second Contact' }] }],
            },
          ],
        },
      ],
    };
    const saved: QuestionnaireResponse = await saving.saveResponse(medplum, assigned, edited);
    expect(saved.questionnaire).toBe(`Questionnaire/${published.id}`);
    expect(saved.id).toBe(assigned.id);
    // Publish a new release; the old response still resolves its original immutable definition.
    const next = deepClone(assembly.questionnaire);
    next.version = '2';
    next.item?.push({ linkId: 'new-question', type: 'string', text: 'New question' });
    const later: Questionnaire = await example.publishReviewedAssembly(medplum, next);
    expect(later.id).not.toBe(published.id);
    const reopened: { questionnaire: Questionnaire; response: QuestionnaireResponse } =
      await example.reopenContactIntake(medplum, saved.id);
    expect(reopened.questionnaire.id).toBe(published.id);
    expect(reopened.questionnaire.version).toBe('1');
    expect(reopened.response.item).toEqual(edited.item);
    const completed: QuestionnaireResponse = await saving.saveResponse(medplum, reopened.response, {
      ...reopened.response,
      status: 'completed',
    });
    const bundle: Bundle<RelatedPerson> = await example.extractContactIntake(
      medplum,
      reopened.questionnaire,
      completed
    );
    expect(bundle.entry?.map((e) => e.resource?.name?.[0].text)).toEqual(['First Contact', 'Second Contact']);
    expect(bundle.entry?.every((e) => e.resource?.patient.reference === getReferenceString(patient))).toBe(true);
    expect(await medplum.searchResources('RelatedPerson', { patient: patient.id })).toHaveLength(0);
  });
});
