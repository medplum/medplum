// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type { Bot, Bundle, CoverageEligibilityRequest, Project } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, initTestAuth, withTestContext } from '../../test.setup';
import type { Repository } from '../repo';

const app = express();
const SUB_OPERATION_CODE = 'test-submit-eligibility';

const minimalEligibilityRequest: CoverageEligibilityRequest = {
  resourceType: 'CoverageEligibilityRequest',
  status: 'active',
  purpose: ['benefits'],
  patient: { reference: 'Patient/example' },
  created: '2026-01-01T00:00:00.000Z',
  insurer: { reference: 'Organization/example' },
  insurance: [
    {
      focal: true,
      coverage: { reference: 'Coverage/example' },
    },
  ],
};

// Bot handler that echoes the submitted CoverageEligibilityRequest back as a minimal CoverageEligibilityResponse.
function getEligibilityResponseBotCode(insurerDisplay: string): string {
  return `
  exports.handler = async function (medplum, event) {
    const eligibilityRequest = event.input;
    return {
      resourceType: 'CoverageEligibilityResponse',
      status: 'active',
      purpose: eligibilityRequest.purpose,
      patient: eligibilityRequest.patient,
      created: '2026-01-01T00:00:00.000Z',
      request: { reference: 'CoverageEligibilityRequest/example' },
      insurer: { display: '${insurerDisplay}' },
      outcome: 'complete',
    };
  };
`;
}

// Sets the eligibility submit project setting to the given operation code.
async function setEligibilitySubmitOperation(
  repo: Repository,
  project: WithId<Project>,
  code: string,
  name = 'ELIGIBILITY_SUBMIT_OPERATION'
): Promise<void> {
  const systemRepo = repo.getSystemRepo();
  await withTestContext(async () => {
    const latest = await systemRepo.readResource<Project>('Project', project.id);
    await systemRepo.updateResource({
      ...latest,
      setting: [...(latest.setting?.filter((s) => s.name !== name) ?? []), { name, valueString: code }],
    });
  });
}

// Creates a custom eligibility-submit OperationDefinition backed by a deployed Bot.
async function deployEligibilityOperation(
  accessToken: string,
  code = SUB_OPERATION_CODE,
  insurerDisplay = 'Test Payer'
): Promise<void> {
  const res1 = await request(app)
    .post('/fhir/R4/Bot')
    .set('Content-Type', ContentType.FHIR_JSON)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ resourceType: 'Bot', name: 'Eligibility Submit Bot', runtimeVersion: 'vmcontext' });
  expect(res1).toHaveStatus(201);
  const bot = res1.body as WithId<Bot>;

  const res2 = await request(app)
    .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
    .set('Content-Type', ContentType.FHIR_JSON)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ code: getEligibilityResponseBotCode(insurerDisplay) });
  expect(res2).toHaveStatus(200);

  const res3 = await request(app)
    .post('/fhir/R4/OperationDefinition')
    .set('Content-Type', ContentType.FHIR_JSON)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({
      resourceType: 'OperationDefinition',
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation',
          valueReference: createReference(bot),
        },
      ],
      name: code,
      status: 'active',
      kind: 'operation',
      code,
      system: false,
      type: true,
      instance: false,
      resource: ['CoverageEligibilityRequest'],
      parameter: [{ use: 'out', name: 'return', type: 'CoverageEligibilityResponse', min: 1, max: '1' }],
    });
  expect(res3).toHaveStatus(201);
}

function bodyWith(resource?: Bundle | CoverageEligibilityRequest): object {
  const parameter: { name: string; resource?: Bundle | CoverageEligibilityRequest }[] = [];
  if (resource !== undefined) {
    parameter.push({ name: 'resource', resource });
  }
  return { resourceType: 'Parameters', parameter };
}

describe('CoverageEligibilityRequest $submit', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Returns 400 when ELIGIBILITY_SUBMIT_OPERATION is not configured', async () => {
    const accessToken = await initTestAuth();
    const res = await request(app)
      .post('/fhir/R4/CoverageEligibilityRequest/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(minimalEligibilityRequest));
    expect(res).toHaveStatus(400);
    expect(JSON.stringify(res.body)).toMatch(/ELIGIBILITY_SUBMIT_OPERATION/);
  });

  test('Returns 400 when the configured operation has no matching OperationDefinition', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await setEligibilitySubmitOperation(repo, project, 'no-such-operation');

    const res = await request(app)
      .post('/fhir/R4/CoverageEligibilityRequest/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(minimalEligibilityRequest));
    expect(res).toHaveStatus(400);
    expect(JSON.stringify(res.body)).toMatch(/not available/i);
  });

  test('Dispatches to the operation named by the ELIGIBILITY_SUBMIT_OPERATION project setting', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployEligibilityOperation(accessToken);
    await setEligibilitySubmitOperation(repo, project, SUB_OPERATION_CODE);

    const res = await request(app)
      .post('/fhir/R4/CoverageEligibilityRequest/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(minimalEligibilityRequest));
    expect(res).toHaveStatus(200);
    // A single 'return' output of a resource type is sent as the bare resource, not wrapped in Parameters.
    expect(res.body.resourceType).toBe('CoverageEligibilityResponse');
    expect(res.body.outcome).toBe('complete');
  });

  test('Dispatches a raw CoverageEligibilityRequest body to the configured operation', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployEligibilityOperation(accessToken);
    await setEligibilitySubmitOperation(repo, project, SUB_OPERATION_CODE);

    const res = await request(app)
      .post('/fhir/R4/CoverageEligibilityRequest/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(minimalEligibilityRequest);
    expect(res).toHaveStatus(200);
    expect(res.body.resourceType).toBe('CoverageEligibilityResponse');
    expect(res.body.outcome).toBe('complete');
  });

  test('Dispatches Bundles containing a CoverageEligibilityRequest to the configured operation', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployEligibilityOperation(accessToken);
    await setEligibilitySubmitOperation(repo, project, SUB_OPERATION_CODE);

    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: minimalEligibilityRequest }, { resource: { resourceType: 'Patient', id: 'example' } }],
    };

    const res = await request(app)
      .post('/fhir/R4/CoverageEligibilityRequest/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bundle);
    expect(res).toHaveStatus(200);
    expect(res.body.resourceType).toBe('CoverageEligibilityResponse');
    expect(res.body.outcome).toBe('complete');
  });

  test('Returns 400 when a Bundle does not contain a CoverageEligibilityRequest', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployEligibilityOperation(accessToken);
    await setEligibilitySubmitOperation(repo, project, SUB_OPERATION_CODE);

    const res = await request(app)
      .post('/fhir/R4/CoverageEligibilityRequest/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(
        bodyWith({
          resourceType: 'Bundle',
          type: 'collection',
          entry: [{ resource: { resourceType: 'Patient', id: 'example' } }],
        })
      );
    expect(res).toHaveStatus(400);
    expect(JSON.stringify(res.body)).toMatch(
      /Eligibility submit must contain at least one CoverageEligibilityRequest resource/i
    );
  });

  test('Reads the CoverageEligibilityRequest from the URL on the instance route', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployEligibilityOperation(accessToken);
    await setEligibilitySubmitOperation(repo, project, SUB_OPERATION_CODE);

    const createRes = await request(app)
      .post('/fhir/R4/CoverageEligibilityRequest')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(minimalEligibilityRequest);
    expect(createRes).toHaveStatus(201);
    const eligibilityRequestId = createRes.body.id;

    const res = await request(app)
      .post(`/fhir/R4/CoverageEligibilityRequest/${eligibilityRequestId}/$submit`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', 'application/fhir+json');
    expect(res).toHaveStatus(200);
    expect(res.body.resourceType).toBe('CoverageEligibilityResponse');
    // Confirms the CoverageEligibilityRequest read from the URL was forwarded to the bot as the body.
    expect(res.body.patient?.reference).toBe('Patient/example');
  });

  test('Returns 400 when no CoverageEligibilityRequest payload is provided', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployEligibilityOperation(accessToken);
    await setEligibilitySubmitOperation(repo, project, SUB_OPERATION_CODE);

    const res = await request(app)
      .post('/fhir/R4/CoverageEligibilityRequest/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith());
    expect(res).toHaveStatus(400);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(res.body.issue[0].severity).toBe('error');
  });
});
