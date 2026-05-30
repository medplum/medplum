// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type { Bot, Claim, Project } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, initTestAuth, withTestContext } from '../../test.setup';
import type { Repository } from '../repo';

const app = express();
const SUB_OPERATION_CODE = 'test-submit-claim';

const minimalClaim: Claim = {
  resourceType: 'Claim',
  status: 'active',
  type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
  use: 'claim',
  patient: { reference: 'Patient/example' },
  created: '2026-01-01T00:00:00.000Z',
  provider: { reference: 'Practitioner/example' },
  priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }] },
  insurance: [
    {
      sequence: 1,
      focal: true,
      coverage: { reference: 'Coverage/example' },
    },
  ],
};

// Bot handler that echoes the submitted Claim back as a minimal ClaimResponse.
const claimResponseBotCode = `
  exports.handler = async function (medplum, event) {
    const claim = event.input;
    return {
      resourceType: 'ClaimResponse',
      status: 'active',
      type: claim.type,
      use: claim.use,
      patient: claim.patient,
      created: '2026-01-01T00:00:00.000Z',
      insurer: { display: 'Test Payer' },
      outcome: 'complete',
    };
  };
`;

// Sets the CLAIM_SUBMIT_OPERATION project setting to the given operation code.
async function setClaimSubmitOperation(repo: Repository, project: WithId<Project>, code: string): Promise<void> {
  const systemRepo = repo.getSystemRepo();
  await withTestContext(async () => {
    const latest = await systemRepo.readResource('Project', project.id);
    await systemRepo.updateResource({
      ...latest,
      setting: [{ name: 'CLAIM_SUBMIT_OPERATION', valueString: code }],
    });
  });
}

// Creates a custom claim-submit OperationDefinition backed by a deployed Bot.
async function deployClaimOperation(accessToken: string, code = SUB_OPERATION_CODE): Promise<void> {
  const res1 = await request(app)
    .post('/fhir/R4/Bot')
    .set('Content-Type', ContentType.FHIR_JSON)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ resourceType: 'Bot', name: 'Claim Submit Bot', runtimeVersion: 'vmcontext' });
  expect(res1.status).toBe(201);
  const bot = res1.body as WithId<Bot>;

  const res2 = await request(app)
    .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
    .set('Content-Type', ContentType.FHIR_JSON)
    .set('Authorization', 'Bearer ' + accessToken)
    .send({ code: claimResponseBotCode });
  expect(res2.status).toBe(200);

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
      resource: ['Claim'],
      parameter: [{ use: 'out', name: 'return', type: 'ClaimResponse', min: 1, max: '1' }],
    });
  expect(res3.status).toBe(201);
}

function bodyWith(resource?: Claim): object {
  const parameter: { name: string; resource?: Claim }[] = [];
  if (resource !== undefined) {
    parameter.push({ name: 'resource', resource });
  }
  return { resourceType: 'Parameters', parameter };
}

describe('Claim $submit', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Returns 400 when CLAIM_SUBMIT_OPERATION is not configured', async () => {
    const accessToken = await initTestAuth();
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(minimalClaim));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/not configured/i);
  });

  test('Returns 400 when the configured operation has no matching OperationDefinition', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await setClaimSubmitOperation(repo, project, 'no-such-operation');

    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(minimalClaim));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/not available/i);
  });

  test('Dispatches to the operation named by the CLAIM_SUBMIT_OPERATION project setting', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployClaimOperation(accessToken);
    await setClaimSubmitOperation(repo, project, SUB_OPERATION_CODE);

    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(minimalClaim));
    expect(res.status).toBe(200);
    // A single 'return' output of a resource type is sent as the bare resource, not wrapped in Parameters.
    expect(res.body.resourceType).toBe('ClaimResponse');
    expect(res.body.outcome).toBe('complete');
  });

  test('Reads the Claim from the URL on the instance route', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployClaimOperation(accessToken);
    await setClaimSubmitOperation(repo, project, SUB_OPERATION_CODE);

    const createRes = await request(app)
      .post('/fhir/R4/Claim')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(minimalClaim);
    expect(createRes.status).toBe(201);
    const claimId = createRes.body.id;

    const res = await request(app)
      .get(`/fhir/R4/Claim/${claimId}/$submit`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', 'application/fhir+json');
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('ClaimResponse');
    // Confirms the Claim read from the URL was forwarded to the bot as the body.
    expect(res.body.patient?.reference).toBe('Patient/example');
  });

  test('Returns 400 when no Claim payload is provided', async () => {
    const { project, accessToken, repo } = await createTestProject({ withAccessToken: true, withRepo: true });
    await deployClaimOperation(accessToken);
    await setClaimSubmitOperation(repo, project, SUB_OPERATION_CODE);

    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith());
    expect(res.status).toBe(400);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(res.body.issue[0].severity).toBe('error');
  });
});
