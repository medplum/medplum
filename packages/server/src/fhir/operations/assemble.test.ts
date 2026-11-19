// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Expression,
  OperationOutcome,
  OperationOutcomeIssue,
  Parameters,
  Questionnaire,
} from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import type { Repository } from '../repo';
import { assembledFromExtension, expectationExtension, subQuestionnaireExtension, variableExtension } from './assemble';

describe('Questionnaire/$assemble', () => {
  const app = express();
  let accessToken: string;
  let repo: Repository;

  let nameModule: Questionnaire;
  let root: Questionnaire;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true }));

    nameModule = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/name-${randomUUID()}`,
      version: '1',
      extension: [{ url: expectationExtension, valueCode: 'assemble-child' }],
      item: [
        { linkId: 'given', type: 'string', text: 'Given name' },
        { linkId: 'family', type: 'string', text: 'Family name' },
      ],
    });

    root = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/intake-${randomUUID()}`,
      version: '1',
      extension: [{ url: expectationExtension, valueCode: 'assemble-root' }],
      item: [
        { linkId: 'reason', type: 'string', text: 'Reason for visit' },
        {
          linkId: 'name-import',
          type: 'display',
          extension: [{ url: subQuestionnaireExtension, valueCanonical: `${nameModule.url}|1` }],
        },
        { linkId: 'notes', type: 'text', text: 'Notes' },
      ],
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Questionnaire/${root.id}/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res).toHaveStatus(200);
    expect(res.body).toStrictEqual<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: root.url,
      version: '1-assembled',
      extension: [{ url: assembledFromExtension, valueCanonical: `${root.url}|1` }],
      item: [
        { linkId: 'reason', type: 'string', text: 'Reason for visit' },
        { linkId: 'given', type: 'string', text: 'Given name' },
        { linkId: 'family', type: 'string', text: 'Family name' },
        { linkId: 'notes', type: 'text', text: 'Notes' },
      ],
    });

    // The instance operation can also be invoked with POST
    const res2 = await request(app)
      .post(`/fhir/R4/Questionnaire/${root.id}/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res2).toHaveStatus(200);
    expect(res2.body).toStrictEqual(res.body);
  });

  test('Success at type level with passed in Questionnaire', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'questionnaire', resource: root }],
      } satisfies Parameters);
    expect(res).toHaveStatus(200);
    expect(res.body).toMatchObject<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      version: '1-assembled',
      item: [
        { linkId: 'reason', type: 'string' },
        { linkId: 'given', type: 'string' },
        { linkId: 'family', type: 'string' },
        { linkId: 'notes', type: 'text' },
      ],
    });

    // A Questionnaire body is accepted without a Parameters wrapper
    const res2 = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(root);
    expect(res2).toHaveStatus(200);
    expect(res2.body).toStrictEqual(res.body);
  });

  test('Questionnaire must be specified', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Parameters' } satisfies Parameters);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [expect.objectContaining<OperationOutcomeIssue>({ severity: 'error', code: 'invalid' })],
    });
  });

  test('Expands nested subQuestionnaires', async () => {
    const addressModule = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/address-${randomUUID()}`,
      version: '1',
      item: [
        { linkId: 'street', type: 'string' },
        {
          linkId: 'name-import',
          type: 'display',
          extension: [{ url: subQuestionnaireExtension, valueCanonical: `${nameModule.url}|1` }],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'address-import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${addressModule.url}|1` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(200);
    expect(res.body.item).toStrictEqual([
      { linkId: 'street', type: 'string' },
      { linkId: 'given', type: 'string', text: 'Given name' },
      { linkId: 'family', type: 'string', text: 'Family name' },
    ]);
  });

  test('Prefixes linkIds of a subQuestionnaire imported twice', async () => {
    const phoneModule = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/phone-${randomUUID()}`,
      version: '1',
      item: [
        { linkId: 'has-phone', type: 'boolean' },
        {
          linkId: 'phone',
          type: 'string',
          enableWhen: [{ question: 'has-phone', operator: '=', answerBoolean: true }],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'home',
            type: 'group',
            extension: [
              {
                url: variableExtension,
                valueExpression: { name: 'linkIdPrefix', language: 'text/fhirpath', expression: "'home.'" },
              },
            ],
            item: [
              {
                linkId: 'phone-import',
                type: 'display',
                extension: [{ url: subQuestionnaireExtension, valueCanonical: `${phoneModule.url}|1` }],
              },
            ],
          },
          {
            linkId: 'work',
            type: 'group',
            extension: [
              {
                url: variableExtension,
                valueExpression: { name: 'linkIdPrefix', language: 'text/fhirpath', expression: "'work.'" },
              },
            ],
            item: [
              {
                linkId: 'phone-import',
                type: 'display',
                extension: [{ url: subQuestionnaireExtension, valueCanonical: `${phoneModule.url}|1` }],
              },
            ],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(200);
    expect(res.body.item[0].item).toStrictEqual([
      { linkId: 'home.has-phone', type: 'boolean' },
      {
        linkId: 'home.phone',
        type: 'string',
        enableWhen: [{ question: 'home.has-phone', operator: '=', answerBoolean: true }],
      },
    ]);
    expect(res.body.item[1].item).toStrictEqual([
      { linkId: 'work.has-phone', type: 'boolean' },
      {
        linkId: 'work.phone',
        type: 'string',
        enableWhen: [{ question: 'work.has-phone', operator: '=', answerBoolean: true }],
      },
    ]);
  });

  test('Does not prefix conditions on questions outside the subQuestionnaire', async () => {
    const detailsModule = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/details-${randomUUID()}`,
      version: '1',
      item: [
        {
          linkId: 'details',
          type: 'string',
          enableWhen: [{ question: 'consent', operator: '=', answerBoolean: true }],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          { linkId: 'consent', type: 'boolean' },
          {
            linkId: 'section',
            type: 'group',
            extension: [
              {
                url: variableExtension,
                valueExpression: { name: 'linkIdPrefix', language: 'text/fhirpath', expression: "'section.'" },
              },
            ],
            item: [
              {
                linkId: 'details-import',
                type: 'display',
                extension: [{ url: subQuestionnaireExtension, valueCanonical: `${detailsModule.url}|1` }],
              },
            ],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(200);
    expect(res.body.item[1].item).toStrictEqual([
      {
        linkId: 'section.details',
        type: 'string',
        enableWhen: [{ question: 'consent', operator: '=', answerBoolean: true }],
      },
    ]);
  });

  test('Prefixes conditions on questions in a nested subQuestionnaire', async () => {
    const patientModule = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/patient-${randomUUID()}`,
      version: '1',
      item: [
        {
          linkId: 'name-import',
          type: 'display',
          extension: [{ url: subQuestionnaireExtension, valueCanonical: `${nameModule.url}|1` }],
        },
        {
          linkId: 'nickname',
          type: 'string',
          enableWhen: [{ question: 'given', operator: 'exists', answerBoolean: true }],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'patient',
            type: 'group',
            extension: [
              {
                url: variableExtension,
                valueExpression: { name: 'linkIdPrefix', language: 'text/fhirpath', expression: "'patient.'" },
              },
            ],
            item: [
              {
                linkId: 'patient-import',
                type: 'display',
                extension: [{ url: subQuestionnaireExtension, valueCanonical: `${patientModule.url}|1` }],
              },
            ],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(200);
    expect(res.body.item[0].item).toStrictEqual([
      { linkId: 'patient.given', type: 'string', text: 'Given name' },
      { linkId: 'patient.family', type: 'string', text: 'Family name' },
      {
        linkId: 'patient.nickname',
        type: 'string',
        enableWhen: [{ question: 'patient.given', operator: 'exists', answerBoolean: true }],
      },
    ]);
  });

  test('Imports the pinned version of a subQuestionnaire', async () => {
    const url = `https://example.com/versioned-${randomUUID()}`;
    await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url,
      version: '1',
      item: [{ linkId: 'v1', type: 'string' }],
    });
    await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url,
      version: '2',
      item: [{ linkId: 'v2', type: 'string' }],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${url}|2` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(200);
    expect(res.body.item).toStrictEqual([{ linkId: 'v2', type: 'string' }]);

    // Without a version, the canonical is ambiguous
    const res2 = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: url }],
          },
        ],
      } satisfies Questionnaire);
    expect(res2).toHaveStatus(400);
    expect(res2.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('Ambiguous') },
        }),
      ],
    });
  });

  test('SubQuestionnaire must exist', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'import',
            type: 'display',
            extension: [
              { url: subQuestionnaireExtension, valueCanonical: `https://example.com/missing-${randomUUID()}|1` },
            ],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('not found') },
        }),
      ],
    });

    // A subQuestionnaire in another project is not visible
    const other = await createTestProject({ withRepo: true });
    const hidden = await other.repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/hidden-${randomUUID()}`,
      version: '1',
      item: [{ linkId: 'secret', type: 'string' }],
    });
    const res2 = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${hidden.url}|1` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res2).toHaveStatus(400);
    expect(res2.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('not found') },
        }),
      ],
    });
  });

  test('linkIdPrefix must be a FHIRPath expression that evaluates to a string', async () => {
    const expressions: Expression[] = [
      { name: 'linkIdPrefix', language: 'text/fhirpath', expression: '1' },
      { name: 'linkIdPrefix', language: 'text/fhirpath', expression: "'a.' +" },
      { name: 'linkIdPrefix', language: 'text/cql', expression: "'a.'" },
    ];
    for (const valueExpression of expressions) {
      const res = await request(app)
        .post(`/fhir/R4/Questionnaire/$assemble`)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({
          resourceType: 'Questionnaire',
          status: 'active',
          url: `https://example.com/root-${randomUUID()}`,
          version: '1',
          item: [
            {
              linkId: 'section',
              type: 'group',
              extension: [{ url: variableExtension, valueExpression }],
              item: [
                {
                  linkId: 'name-import',
                  type: 'display',
                  extension: [{ url: subQuestionnaireExtension, valueCanonical: `${nameModule.url}|1` }],
                },
              ],
            },
          ],
        } satisfies Questionnaire);
      expect(res).toHaveStatus(400);
      expect(res.body).toMatchObject<OperationOutcome>({
        resourceType: 'OperationOutcome',
        issue: [
          expect.objectContaining<OperationOutcomeIssue>({
            severity: 'error',
            code: 'invalid',
            details: { text: expect.stringContaining('linkIdPrefix') },
          }),
        ],
      });
    }
  });

  test('SubQuestionnaire must not import itself', async () => {
    const url = `https://example.com/circular-${randomUUID()}`;
    await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url,
      version: '1',
      item: [
        {
          linkId: 'self-import',
          type: 'display',
          extension: [{ url: subQuestionnaireExtension, valueCanonical: `${url}|1` }],
        },
      ],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${url}|1` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('circular') },
        }),
      ],
    });
  });

  test('Assembled linkIds must be unique', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'first-import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${nameModule.url}|1` }],
          },
          {
            linkId: 'second-import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${nameModule.url}|1` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining("Duplicate linkId 'given'") },
        }),
      ],
    });
  });

  test('SubQuestionnaire item must not have enableWhen', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          { linkId: 'add-name', type: 'boolean' },
          {
            linkId: 'name-import',
            type: 'display',
            enableWhen: [{ question: 'add-name', operator: '=', answerBoolean: true }],
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${nameModule.url}|1` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('enableWhen') },
        }),
      ],
    });
  });

  test('Omits assembledFrom when the Questionnaire has no url', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        version: '1',
        item: [
          {
            linkId: 'name-import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${nameModule.url}|1` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(200);
    expect(res.body.extension).toBeUndefined();
    expect(res.body.item).toStrictEqual([
      { linkId: 'given', type: 'string', text: 'Given name' },
      { linkId: 'family', type: 'string', text: 'Family name' },
    ]);
  });

  test('SubQuestionnaire must not have contained resources', async () => {
    const choiceModule = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/choice-${randomUUID()}`,
      version: '1',
      contained: [{ resourceType: 'ValueSet', id: 'colors', status: 'active' }],
      item: [{ linkId: 'color', type: 'choice', answerValueSet: '#colors' }],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'choice-import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${choiceModule.url}|1` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining('contained resources') },
        }),
      ],
    });
  });

  test('SubQuestionnaire must not have root-level variables', async () => {
    const scoreModule = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.com/score-${randomUUID()}`,
      version: '1',
      extension: [
        {
          url: variableExtension,
          valueExpression: { name: 'threshold', language: 'text/fhirpath', expression: '10' },
        },
      ],
      item: [{ linkId: 'score', type: 'integer' }],
    });

    const res = await request(app)
      .post(`/fhir/R4/Questionnaire/$assemble`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Questionnaire',
        status: 'active',
        url: `https://example.com/root-${randomUUID()}`,
        version: '1',
        item: [
          {
            linkId: 'score-import',
            type: 'display',
            extension: [{ url: subQuestionnaireExtension, valueCanonical: `${scoreModule.url}|1` }],
          },
        ],
      } satisfies Questionnaire);
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        expect.objectContaining<OperationOutcomeIssue>({
          severity: 'error',
          code: 'invalid',
          details: { text: expect.stringContaining(variableExtension) },
        }),
      ],
    });
  });
});
