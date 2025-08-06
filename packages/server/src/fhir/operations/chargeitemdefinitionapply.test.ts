// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { ChargeItem, ChargeItemDefinition } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

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

  test('Apply ChargeItemDefinition with service-code based surcharge', async () => {
    // 1. Create a patient
    const patient = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Service'], family: 'CodeTest' }],
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

    // 3. Create a ChargeItemDefinition with code-specific surcharge
    const chargeItemDefinitionBody: ChargeItemDefinition = {
      resourceType: 'ChargeItemDefinition',
      status: 'active',
      url: 'http://example.org/fhir/ChargeItemDefinition/code-based-pricing',
      title: 'Code-Based Pricing Model',
      code: {
        coding: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '99214',
            display: 'Complex office visit',
          },
        ],
      },
      propertyGroup: [
        {
          priceComponent: [
            {
              type: 'base',
              code: {
                text: 'Standard Service Fee',
              },
              amount: {
                value: 120,
                currency: 'USD',
              },
            },
          ],
        },
        {
          applicability: [
            {
              description: 'Complex case surcharge for 99214',
              expression:
                "%resource.code.coding.where(system='http://www.ama-assn.org/go/cpt' and code='99214').exists()",
            },
          ],
          priceComponent: [
            {
              type: 'surcharge',
              code: {
                text: 'Higher Complexity Case (99214)',
              },
              amount: {
                value: 35,
                currency: 'USD',
              },
            },
          ],
        },
        {
          applicability: [
            {
              description: 'Medical decision making surcharge',
              expression: 'true', // Always applies for test
            },
          ],
          priceComponent: [
            {
              type: 'surcharge',
              code: {
                text: 'Medical Decision Making',
              },
              factor: 0.15, // 15% surcharge
            },
          ],
        },
      ],
    };
    const chargeItemDefinition = await request(app)
      .post(`/fhir/R4/ChargeItemDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(chargeItemDefinitionBody);
    expect(chargeItemDefinition.status).toBe(201);

    // 4. Create a draft ChargeItem with 99214 code
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
        occurrenceDateTime: '2023-01-05T14:00:00Z',
        performingOrganization: {
          reference: 'Organization/example',
        },
        code: {
          coding: [
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: '99214',
              display: 'Complex office visit',
            },
          ],
        },
      });
    expect(draftChargeItem.status).toBe(201);

    // 5. Apply the ChargeItemDefinition to the draft ChargeItem
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

    // 6. Verify the result
    expect(applyResult.status).toBe(200);
    const chargeItem = applyResult.body as ChargeItem;
    expect(chargeItem.resourceType).toBe('ChargeItem');
    expect(chargeItem.id).toBe(draftChargeItem.body.id);

    // 7. Verify price calculation
    // Base price: $120
    // 99214-specific surcharge: $35 (fixed amount)
    // Medical decision making surcharge: $18 (15% of base)
    // Expected final price: $120 + $35 + $18 = $173
    expect(chargeItem.priceOverride).toBeDefined();
    expect(chargeItem.priceOverride?.value).toBe(173);
    expect(chargeItem.priceOverride?.currency).toBe('USD');
  });

  test('Apply ChargeItemDefinition with multiple discount types', async () => {
    // 1. Create a patient
    const patient = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Discount'], family: 'TestCase' }],
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

    // 3. Create a ChargeItemDefinition with various discount types
    const chargeItemDefinitionBody: ChargeItemDefinition = {
      resourceType: 'ChargeItemDefinition',
      status: 'active',
      url: 'http://example.org/fhir/ChargeItemDefinition/discount-pricing',
      title: 'Discount Pricing Model',
      code: {
        coding: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '99213',
            display: 'Office visit',
          },
        ],
      },
      propertyGroup: [
        {
          priceComponent: [
            {
              type: 'base',
              code: {
                text: 'Standard Service Fee',
              },
              amount: {
                value: 200,
                currency: 'USD',
              },
            },
          ],
        },
        {
          applicability: [
            {
              description: 'Insurance contract discount',
              expression: 'true',
            },
          ],
          priceComponent: [
            {
              type: 'discount',
              code: {
                text: 'Insurance Contract Rate',
              },
              factor: 0.2,
            },
          ],
        },
        {
          applicability: [
            {
              description: 'Senior citizen discount',
              expression: 'true',
            },
          ],
          priceComponent: [
            {
              type: 'discount',
              code: {
                text: 'Senior Discount',
              },
              amount: {
                value: 25,
                currency: 'USD',
              },
            },
          ],
        },
        {
          applicability: [
            {
              description: 'Preventive care discount',
              expression:
                "%resource.code.coding.where(system='http://www.ama-assn.org/go/cpt' and code='99213').exists()",
            },
          ],
          priceComponent: [
            {
              type: 'discount',
              code: {
                text: 'Preventive Care Discount',
              },
              factor: 0.05,
            },
          ],
        },
      ],
    };

    const chargeItemDefinition = await request(app)
      .post(`/fhir/R4/ChargeItemDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(chargeItemDefinitionBody);
    expect(chargeItemDefinition.status).toBe(201);

    // 4. Create a draft ChargeItem
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
        occurrenceDateTime: '2023-01-15T10:30:00Z',
        performingOrganization: {
          reference: 'Organization/example',
        },
        code: {
          coding: [
            {
              system: 'http://www.ama-assn.org/go/cpt',
              code: '99213',
              display: 'Office visit',
            },
          ],
        },
      });
    expect(draftChargeItem.status).toBe(201);

    // 5. Apply the ChargeItemDefinition to the draft ChargeItem
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

    // 6. Verify the result
    expect(applyResult.status).toBe(200);
    const chargeItem = applyResult.body as ChargeItem;
    expect(chargeItem.resourceType).toBe('ChargeItem');
    expect(chargeItem.id).toBe(draftChargeItem.body.id);

    // 7. Verify price calculation
    // Base price: $200
    // Insurance contract discount: $40 (20% of base)
    // Senior discount: $25 (fixed amount)
    // Preventive care discount: $10 (5% of base)
    // Expected final price: $200 - $40 - $25 - $10 = $125
    expect(chargeItem.priceOverride).toBeDefined();
    expect(chargeItem.priceOverride?.value).toBe(125);
    expect(chargeItem.priceOverride?.currency).toBe('USD');
  });

  test('Apply ChargeItemDefinition with base price applicability', async () => {
    // Create a patient
    const patient = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Base'], family: 'Applicability' }],
      });
    expect(patient.status).toBe(201);

    // Create an encounter
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

    // Create a ChargeItemDefinition with base price applicability
    const chargeItemDefinitionBody: ChargeItemDefinition = {
      resourceType: 'ChargeItemDefinition',
      status: 'active',
      url: 'http://example.org/fhir/ChargeItemDefinition/base-price-applicability',
      title: 'Base Price Applicability Model',
      propertyGroup: [
        {
          applicability: [
            {
              description: 'Base price only applies for new patients',
              expression:
                "%resource.code.coding.where(system='http://example.org/codes' and code='new-patient').exists()",
            },
          ],
          priceComponent: [
            {
              type: 'base',
              code: {
                text: 'New Patient Fee',
              },
              amount: {
                value: 150,
                currency: 'USD',
              },
            },
          ],
        },
        {
          applicability: [
            {
              description: 'Base price only applies for established patients',
              expression:
                "%resource.code.coding.where(system='http://example.org/codes' and code='established-patient').exists()",
            },
          ],
          priceComponent: [
            {
              type: 'base',
              code: {
                text: 'Established Patient Fee',
              },
              amount: {
                value: 100,
                currency: 'USD',
              },
            },
          ],
        },
        {
          applicability: [
            {
              description: 'Apply to all visits',
              expression: 'true',
            },
          ],
          priceComponent: [
            {
              type: 'surcharge',
              code: {
                text: 'Standard Facility Fee',
              },
              amount: {
                value: 25,
                currency: 'USD',
              },
            },
          ],
        },
      ],
    };

    const chargeItemDefinition = await request(app)
      .post(`/fhir/R4/ChargeItemDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(chargeItemDefinitionBody);
    expect(chargeItemDefinition.status).toBe(201);

    // Create a ChargeItem for a new patient
    const newPatientChargeItem = await request(app)
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
        occurrenceDateTime: '2023-03-15T14:00:00Z',
        performingOrganization: {
          reference: 'Organization/example',
        },
        code: {
          coding: [
            {
              system: 'http://example.org/codes',
              code: 'new-patient',
              display: 'New Patient Visit',
            },
          ],
        },
      });
    expect(newPatientChargeItem.status).toBe(201);

    // Apply the ChargeItemDefinition to the new patient ChargeItem
    const newPatientApplyResult = await request(app)
      .post(`/fhir/R4/ChargeItemDefinition/${chargeItemDefinition.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'chargeItem',
            valueReference: {
              reference: `ChargeItem/${newPatientChargeItem.body.id}`,
            },
          },
        ],
      });

    // Verify new patient pricing
    expect(newPatientApplyResult.status).toBe(200);
    const newPatientResult = newPatientApplyResult.body as ChargeItem;
    expect(newPatientResult.resourceType).toBe('ChargeItem');
    expect(newPatientResult.id).toBe(newPatientChargeItem.body.id);

    // New Patient base price: $150
    // Standard Facility Fee: $25
    // Expected total: $175
    expect(newPatientResult.priceOverride).toBeDefined();
    expect(newPatientResult.priceOverride?.value).toBe(175);
    expect(newPatientResult.priceOverride?.currency).toBe('USD');

    // Create a ChargeItem for an established patient
    const establishedPatientChargeItem = await request(app)
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
        occurrenceDateTime: '2023-03-15T14:00:00Z',
        performingOrganization: {
          reference: 'Organization/example',
        },
        code: {
          coding: [
            {
              system: 'http://example.org/codes',
              code: 'established-patient',
              display: 'Established Patient Visit',
            },
          ],
        },
      });
    expect(establishedPatientChargeItem.status).toBe(201);

    // Apply the ChargeItemDefinition to the established patient ChargeItem
    const establishedPatientApplyResult = await request(app)
      .post(`/fhir/R4/ChargeItemDefinition/${chargeItemDefinition.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'chargeItem',
            valueReference: {
              reference: `ChargeItem/${establishedPatientChargeItem.body.id}`,
            },
          },
        ],
      });

    // Verify established patient pricing
    expect(establishedPatientApplyResult.status).toBe(200);
    const establishedPatientResult = establishedPatientApplyResult.body as ChargeItem;

    // Established Patient base price: $100
    // Standard Facility Fee: $25
    // Expected total: $125
    expect(establishedPatientResult.priceOverride).toBeDefined();
    expect(establishedPatientResult.priceOverride?.value).toBe(125);
    expect(establishedPatientResult.priceOverride?.currency).toBe('USD');

    // Create a ChargeItem with no matching code
    const otherChargeItem = await request(app)
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
        occurrenceDateTime: '2023-03-15T14:00:00Z',
        performingOrganization: {
          reference: 'Organization/example',
        },
        code: {
          coding: [
            {
              system: 'http://example.org/codes',
              code: 'other-service',
              display: 'Other Service',
            },
          ],
        },
      });
    expect(otherChargeItem.status).toBe(201);

    // Apply the ChargeItemDefinition to the other ChargeItem
    const otherApplyResult = await request(app)
      .post(`/fhir/R4/ChargeItemDefinition/${chargeItemDefinition.body.id}/$apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'chargeItem',
            valueReference: {
              reference: `ChargeItem/${otherChargeItem.body.id}`,
            },
          },
        ],
      });

    expect(otherApplyResult.status).toBe(200);
    const otherResult = otherApplyResult.body as ChargeItem;
    expect(otherResult.priceOverride?.value).toBe(150);
    expect(otherResult.priceOverride?.currency).toBe('USD');
  });
});
