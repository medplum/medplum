import { ContentType } from '@medplum/core';
import { ChargeItem } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { initTestAuth } from '../../test.setup';
import { loadTestConfig } from '../../config/loader';

const app = express();
let accessToken: string;

describe('ChargeItemDefinition Apply', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Happy path - Apply ChargeItemDefinition', async () => {
    // 1. Create a patient
    const patient = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Test'], family: 'Patient' }],
      });
    expect(patient.status).toBe(201);

    // 2. Create an encounter
    const encounter = await request(app)
      .post(`/fhir/R4/Encounter`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'AMB',
          display: 'ambulatory',
        },
        subject: {
          reference: `Patient/${patient.body.id}`,
        },
      });
    expect(encounter.status).toBe(201);

    // 3. Create a ChargeItemDefinition
    const chargeItemDefinition = await request(app)
      .post(`/fhir/R4/ChargeItemDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ChargeItemDefinition',
        status: 'active',
        url: 'http://example.org/fhir/ChargeItemDefinition/example',
        code: {
          coding: [
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: '99213',
              display: 'Office/outpatient visit est',
            },
          ],
        },
        propertyGroup: [
          {
            priceComponent: [
              {
                type: 'base',
                amount: {
                  value: 100,
                  currency: 'USD',
                },
              },
            ],
          },
        ],
      });
    expect(chargeItemDefinition.status).toBe(201);

    // 4. Create a draft ChargeItem first
    const draftChargeItem = await request(app)
      .post(`/fhir/R4/ChargeItem`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ChargeItem',
        status: 'draft',
        subject: {
          reference: `Patient/${patient.body.id}`,
        },
        context: {
          reference: `Encounter/${encounter.body.id}`,
        },
        occurrenceDateTime: '2023-01-01T12:00:00Z',
        performingOrganization: {
          reference: 'Organization/example',
        },
        code: {
          coding: [
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: '99213',
              display: 'Office/outpatient visit est',
            },
          ],
        },
      });
    expect(draftChargeItem.status).toBe(201);

    // 5. Apply the ChargeItemDefinition to the draft ChargeItem using its reference
    const applyResult = await request(app)
      .post(`/fhir/R4/ChargeItemDefinition/${chargeItemDefinition.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'chargeItem',
            valueReference: {
              reference: `ChargeItem/${draftChargeItem.body.id}`,
            },
          },
        ],
      });

    console.log(JSON.stringify(applyResult.body, null, 2));

    // 6. Verify the result
    expect(applyResult.status).toBe(200);
    const chargeItem = applyResult.body as ChargeItem;
    expect(chargeItem.resourceType).toBe('ChargeItem');
    expect(chargeItem.id).toBe(draftChargeItem.body.id);

    // 7. Verify price override was applied
    expect(chargeItem.priceOverride).toBeDefined();
    expect(chargeItem.priceOverride?.value).toBe(100);
    expect(chargeItem.priceOverride?.currency).toBe('USD');

    // 8. Verify subject and context
    expect(chargeItem.subject.reference).toBe(`Patient/${patient.body.id}`);
    expect(chargeItem.context).toBeDefined();
    expect(chargeItem.context?.reference).toBe(`Encounter/${encounter.body.id}`);
  });
});
