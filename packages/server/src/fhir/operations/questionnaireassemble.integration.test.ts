// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Extension, OperationOutcome, Parameters, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import type { Test } from 'supertest';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import type { Repository } from '../repo';
import { ASSEMBLE_EXPECTATION_EXTENSION_URL, SUB_QUESTIONNAIRE_EXTENSION_URL } from './questionnaireassembly';

const inputParameter = (value: Record<string, unknown>): Parameters => ({
  resourceType: 'Parameters',
  parameter: [{ name: 'questionnaire', ...value }],
});
const placeholder = (canonical: string, linkId = 'import'): QuestionnaireItem => ({
  linkId,
  type: 'display',
  text: 'Module unavailable',
  extension: [{ url: SUB_QUESTIONNAIRE_EXTENSION_URL, valueCanonical: canonical }],
});

describe('Questionnaire/$assemble HTTP contract', () => {
  const app = express();
  let accessToken: string;
  let repo: Repository;
  let root: Questionnaire;
  let child: Questionnaire;

  const postAssembly = (path = 'Questionnaire/$assemble'): Test =>
    request(app).post(`/fhir/R4/${path}`).auth(accessToken, { type: 'bearer' });

  beforeAll(async () => {
    await initApp(app, await loadTestConfig());
    ({ accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true, extendedMode: false }));
    child = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.org/${randomUUID()}`,
      version: '1',
      extension: [{ url: ASSEMBLE_EXPECTATION_EXTENSION_URL, valueCode: 'independent-child' }],
      item: [{ linkId: 'name', type: 'string', text: 'Name' }],
    });
    root = await repo.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      url: `https://example.org/${randomUUID()}`,
      version: '1',
      extension: [{ url: ASSEMBLE_EXPECTATION_EXTENSION_URL, valueCode: 'assemble-root' }],
      item: [placeholder(`${child.url}|1`)],
    });
  });
  afterAll(shutdownApp);

  test.each(['inline', 'resource', 'uri', 'reference'])(
    'accepts %s input at the type and instance endpoints',
    async (shape) => {
      const bodies = {
        inline: root,
        resource: inputParameter({ resource: root }),
        uri: inputParameter({ valueUri: `${root.url}|1` }),
        reference: inputParameter({ valueReference: { reference: `Questionnaire/${root.id}` } }),
      };
      const body = bodies[shape as keyof typeof bodies];
      for (const path of ['Questionnaire/$assemble', `Questionnaire/${root.id}/$assemble`]) {
        const res = await postAssembly(path).send(body);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({
          resourceType: 'Questionnaire',
          url: root.url,
          version: '1',
          item: [{ linkId: 'name' }],
        });
        expect(res.body.id).toBeUndefined();
      }
      expect(await repo.readResource('Questionnaire', root.id as string)).toEqual(root);
    }
  );

  test('treats commas in canonical URLs and business versions literally', async () => {
    const url = `https://example.org/${randomUUID()},form`;
    for (const version of ['1', '2', '1,2']) {
      await repo.createResource<Questionnaire>({ ...child, id: undefined, meta: undefined, url, version });
    }
    const res = await postAssembly().send(inputParameter({ valueUri: `${url}|1,2` }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.version).toBe('1,2');
    expect(res.body.url).toBe(url);
  });

  test('accepts an instance URL without a body', async () => {
    const res = await postAssembly(`Questionnaire/${root.id}/$assemble`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.resourceType).toBe('Questionnaire');
  });

  test.each(['root', 'child'])(
    'returns HTTP 200 with return and warning outcome for an otherwise valid untagged %s requiring assembly',
    async (location) => {
      let input: Questionnaire = { ...root, extension: undefined };
      if (location === 'child') {
        const untagged = await repo.createResource<Questionnaire>({
          ...root,
          id: undefined,
          meta: undefined,
          url: `https://example.org/${randomUUID()}`,
          extension: undefined,
        });
        input = {
          ...root,
          item: [placeholder(`${untagged.url}|1`)],
        };
      }
      const res = await postAssembly().send(input);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.resourceType).toBe('Parameters');
      const parameters = (res.body as Parameters).parameter;
      expect(parameters?.map((p) => p.name)).toEqual(['return', 'outcome']);
      expect(parameters?.[0].resource).toMatchObject({ resourceType: 'Questionnaire', item: [{ linkId: 'name' }] });
      expect((parameters?.[1].resource as OperationOutcome).issue).toEqual([
        expect.objectContaining({
          severity: 'warning',
          details: { text: expect.stringContaining('missing assemble-expectation') },
        }),
      ]);
    }
  );

  test('returns an error outcome, without an assembled result, for missing metadata plus a missing dependency', async () => {
    const input: Questionnaire = {
      ...root,
      extension: undefined,
      item: [placeholder('https://example.org/unavailable|1')],
    };
    const res = await postAssembly().send(input);
    expect(res.status).toBe(400);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(res.body.issue[0].severity).toBe('error');
    expect(res.body.parameter).toBeUndefined();
  });

  test('returns final validation warnings with the assembled result for author review', async () => {
    const empty = await repo.createResource<Questionnaire>({
      ...child,
      id: undefined,
      meta: undefined,
      url: `https://example.org/${randomUUID()}`,
      item: undefined,
    });
    const input: Questionnaire = {
      ...root,
      item: [
        {
          linkId: 'section',
          type: 'group',
          item: [placeholder(`${empty.url}|1`, 'import-empty')],
        },
      ],
    };
    const res = await postAssembly().send(input);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.resourceType).toBe('Parameters');
    const parameters = (res.body as Parameters).parameter;
    expect(parameters?.map((p) => p.name)).toEqual(['return', 'outcome']);
    expect(parameters?.[0].resource).toMatchObject({
      resourceType: 'Questionnaire',
      item: [{ linkId: 'section', type: 'group' }],
    });
    // FHIR serialization omits the empty item array, leaving the invalid group available for review.
    expect((parameters?.[0].resource as Questionnaire).item?.[0].item).toBeUndefined();
    expect((parameters?.[1].resource as OperationOutcome).issue).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'invariant',
        details: { text: expect.stringContaining('que-1') },
        expression: ['Questionnaire.item[0]'],
      }),
    ]);
  });

  test('returns duplicate constraint keys as warnings without removing either constraint', async () => {
    const constraint: Extension = {
      url: 'http://hl7.org/fhir/StructureDefinition/targetConstraint',
      extension: [
        { url: 'key', valueId: 'shared-rule' },
        { url: 'severity', valueCode: 'error' },
        { url: 'expression', valueExpression: { language: 'text/fhirpath', expression: 'true' } },
        { url: 'human', valueString: 'Example response constraint' },
      ],
    };
    const constrained = await repo.createResource<Questionnaire>({
      ...child,
      id: undefined,
      meta: undefined,
      url: `https://example.org/${randomUUID()}`,
      extension: [...(child.extension ?? []), constraint],
    });
    const input: Questionnaire = {
      ...root,
      extension: [...(root.extension ?? []), constraint],
      item: [placeholder(`${constrained.url}|1`)],
    };
    const res = await postAssembly().send(input);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.resourceType).toBe('Parameters');
    const parameters = (res.body as Parameters).parameter;
    expect(parameters?.map((p) => p.name)).toEqual(['return', 'outcome']);
    const assembled = parameters?.[0].resource as Questionnaire;
    expect(assembled.extension?.filter((e) => e.url === constraint.url)).toEqual([constraint, constraint]);
    expect((parameters?.[1].resource as OperationOutcome).issue).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'invariant',
        details: { text: expect.stringContaining("Duplicate targetConstraint key 'shared-rule'") },
        expression: [expect.stringMatching(/^Questionnaire\.extension\[\d+\]$/)],
      }),
    ]);
  });

  test('returns an error without a result when an imported launch context collides with a root variable', async () => {
    const launch = await repo.createResource<Questionnaire>({
      ...child,
      id: undefined,
      meta: undefined,
      url: `https://example.org/${randomUUID()}`,
      extension: [
        ...(child.extension ?? []),
        {
          url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext',
          extension: [
            {
              url: 'name',
              valueCoding: { system: 'http://hl7.org/fhir/uv/sdc/CodeSystem/launchContext', code: 'patient' },
            },
            { url: 'type', valueCode: 'Patient' },
          ],
        },
      ],
    });
    const input: Questionnaire = {
      ...root,
      extension: [
        ...(root.extension ?? []),
        {
          url: 'http://hl7.org/fhir/StructureDefinition/variable',
          valueExpression: { name: 'patient', language: 'text/fhirpath', expression: '%resource' },
        },
      ],
      item: [placeholder(`${launch.url}|1`)],
    };
    const res = await postAssembly().send(input);
    expect(res.status).toBe(400);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(res.body.issue[0].details.text).toContain("Duplicate or missing variable name 'patient'");
    expect(res.body.parameter).toBeUndefined();
  });

  test.each(['cycle', 'duplicate', 'dangling'])(
    'returns an error without a result for an assembly failure: %s',
    async (failure) => {
      const input: Questionnaire = { ...root, item: [...(root.item ?? [])] };
      if (failure === 'cycle') {
        input.item = [placeholder(`${root.url}|1`, 'self')];
      } else if (failure === 'duplicate') {
        input.item?.push({ linkId: 'name', type: 'string' });
      } else {
        input.item?.push({
          linkId: 'conditional',
          type: 'string',
          enableWhen: [{ question: 'missing', operator: 'exists', answerBoolean: true }],
        });
      }
      const res = await postAssembly().send(input);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.resourceType).toBe('OperationOutcome');
      expect(res.body.issue[0].severity).toBe('error');
      expect(res.body.parameter).toBeUndefined();
    }
  );

  test('keeps invalid input validation fatal', async () => {
    const res = await postAssembly().send({ ...root, status: undefined });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(res.body.issue[0].severity).toBe('error');
    expect(res.body.parameter).toBeUndefined();
  });

  test.each([
    { resourceType: 'Patient' },
    { resourceType: 'Questionnaire' },
    inputParameter({ valueString: 'bad' }),
    inputParameter({ valueUri: 'https://example.org/a|1', valueReference: { reference: 'Questionnaire/b' } }),
    {
      resourceType: 'Parameters',
      parameter: [
        { name: 'questionnaire', valueUri: 'a' },
        { name: 'questionnaire', valueUri: 'b' },
      ],
    },
    { resourceType: 'Parameters', parameter: [{ name: 'unknown', valueString: 'a' }] },
    {},
  ])('rejects malformed or missing type input %j', async (body) => {
    const res = await postAssembly().send(body);
    expect(res.status).toBe(400);
    expect(res.body.resourceType).toBe('OperationOutcome');
  });

  test('rejects conflicting instance and input, including modified inline content', async () => {
    for (const body of [
      inputParameter({ valueReference: { reference: `Questionnaire/${child.id}` } }),
      { ...root, version: '2' },
    ]) {
      const res = await postAssembly(`Questionnaire/${root.id}/$assemble`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.issue[0].details.text).toMatch(/conflicts/);
    }
  });

  test('honors project access for dependencies and explicit references', async () => {
    const other = await createTestProject({ withAccessToken: true, withRepo: true, extendedMode: false });
    const privateModule = await other.repo.createResource<Questionnaire>({
      ...child,
      id: undefined,
      meta: undefined,
      url: `https://example.org/${randomUUID()}`,
    });
    const input: Questionnaire = {
      ...root,
      item: [placeholder(`${privateModule.url}|1`, 'private')],
    };
    const canonicalRes = await postAssembly().send(input);
    expect(canonicalRes.status).toBe(400);
    expect(canonicalRes.body.issue[0].details.text).toContain('not found');
    const referenceRes = await postAssembly().send(
      inputParameter({ valueReference: { reference: `Questionnaire/${privateModule.id}` } })
    );
    expect(referenceRes.status).toBe(404);
    // An inaccessible duplicate does not make the caller's canonical ambiguous.
    await other.repo.createResource<Questionnaire>({ ...root, id: undefined, meta: undefined });
    const ownRes = await postAssembly().send(inputParameter({ valueUri: `${root.url}|1` }));
    expect(ownRes.status).toBe(200);
  });
});
