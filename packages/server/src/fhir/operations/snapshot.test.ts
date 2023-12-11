import express from 'express';
import { loadTestConfig } from '../../config';
import { initApp } from '../../app';
import { initTestAuth } from '../../test.setup';
import { Observation, StructureDefinition } from '@medplum/fhirtypes';
import request from 'supertest';
import { ContentType } from '@medplum/core';

const app = express();

const vitalSignsProfile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  id: 'us-core-vital-signs',
  url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-vital-signs',
  version: '6.1.0',
  name: 'USCoreVitalSignsProfile',
  title: 'US Core Vital Signs Profile',
  status: 'active',
  experimental: false,
  date: '2020-11-17',
  fhirVersion: '4.0.1',
  kind: 'resource',
  abstract: false,
  type: 'Observation',
  baseDefinition: 'http://hl7.org/fhir/StructureDefinition/vitalsigns',
  derivation: 'constraint',
  differential: {
    element: [
      {
        id: 'Observation',
        path: 'Observation',
        short: 'US Core Vital Signs Profile',
      },
      {
        id: 'Observation.category',
        path: 'Observation.category',
        slicing: {
          discriminator: [
            { type: 'value', path: 'coding.code' },
            { type: 'value', path: 'coding.system' },
          ],
          ordered: false,
          rules: 'open',
        },
        min: 1,
        max: '*',
        type: [{ code: 'CodeableConcept' }],
        mustSupport: true,
      },
      {
        id: 'Observation.category:VSCat',
        path: 'Observation.category',
        sliceName: 'VSCat',
        min: 1,
        max: '1',
        type: [{ code: 'CodeableConcept' }],
        mustSupport: true,
      },
      {
        id: 'Observation.category:VSCat.coding',
        path: 'Observation.category.coding',
        min: 1,
        max: '*',
        type: [{ code: 'Coding' }],
        mustSupport: true,
      },
      {
        id: 'Observation.category:VSCat.coding.system',
        path: 'Observation.category.coding.system',
        min: 1,
        max: '1',
        type: [{ code: 'uri' }],
        fixedUri: 'http://terminology.hl7.org/CodeSystem/observation-category',
        mustSupport: true,
      },
      {
        id: 'Observation.category:VSCat.coding.code',
        path: 'Observation.category.coding.code',
        min: 1,
        max: '1',
        type: [{ code: 'code' }],
        fixedCode: 'vital-signs',
        mustSupport: true,
      },
      {
        id: 'Observation.code',
        path: 'Observation.code',
        mustSupport: true,
        binding: {
          strength: 'extensible',
          description: 'The vital sign codes from the base FHIR and US Core Vital Signs.',
          valueSet: 'http://hl7.org/fhir/us/core/ValueSet/us-core-vital-signs',
        },
      },
      {
        id: 'Observation.subject',
        path: 'Observation.subject',
        type: [
          {
            code: 'Reference',
            targetProfile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
          },
        ],
        mustSupport: true,
      },
      {
        id: 'Observation.effective[x]',
        path: 'Observation.effective[x]',
        type: [{ code: 'dateTime' }, { code: 'Period' }],
        mustSupport: true,
      },
      {
        id: 'Observation.value[x]',
        path: 'Observation.value[x]',
        definition: 'Vital Signs value are typically recorded using the Quantity data type.',
        type: [
          { code: 'Quantity' },
          { code: 'CodeableConcept' },
          { code: 'string' },
          { code: 'boolean' },
          { code: 'integer' },
          { code: 'Range' },
          { code: 'Ratio' },
          { code: 'SampledData' },
          { code: 'time' },
          { code: 'dateTime' },
          { code: 'Period' },
        ],
        mustSupport: true,
        binding: {
          strength: 'extensible',
          description: 'Common UCUM units for recording Vital Signs.',
          valueSet: 'http://hl7.org/fhir/ValueSet/ucum-vitals-common|4.0.1',
        },
      },
      {
        id: 'Observation.component.code',
        path: 'Observation.component.code',
        mustSupport: true,
        binding: {
          strength: 'extensible',
          description: 'The vital sign codes from the base FHIR and US Core Vital Signs.',
          valueSet: 'http://hl7.org/fhir/us/core/ValueSet/us-core-vital-signs',
        },
      },
      {
        id: 'Observation.component.value[x]',
        path: 'Observation.component.value[x]',
        type: [
          { code: 'Quantity' },
          { code: 'CodeableConcept' },
          { code: 'string' },
          { code: 'boolean' },
          { code: 'integer' },
          { code: 'Range' },
          { code: 'Ratio' },
          { code: 'SampledData' },
          { code: 'time' },
          { code: 'dateTime' },
          { code: 'Period' },
        ],
        mustSupport: true,
        binding: {
          strength: 'extensible',
          description: 'Common UCUM units for recording Vital Signs.',
          valueSet: 'http://hl7.org/fhir/ValueSet/ucum-vitals-common|4.0.1',
        },
      },
    ],
  },
};

const bloodPressureProfile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  id: 'us-core-blood-pressure',
  url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure',
  version: '6.1.0',
  name: 'USCoreBloodPressureProfile',
  title: 'US Core Blood Pressure Profile',
  status: 'active',
  experimental: false,
  date: '2022-04-20',
  fhirVersion: '4.0.1',
  kind: 'resource',
  abstract: false,
  type: 'Observation',
  baseDefinition: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-vital-signs',
  derivation: 'constraint',
  differential: {
    element: [
      {
        id: 'Observation',
        path: 'Observation',
        short: 'US Core Blood Pressure Profile',
      },
      {
        id: 'Observation.code',
        path: 'Observation.code',
        type: [{ code: 'CodeableConcept' }],
        patternCodeableConcept: { coding: [{ system: 'http://loinc.org', code: '85354-9' }] },
        mustSupport: true,
      },
      {
        id: 'Observation.component',
        path: 'Observation.component',
        slicing: {
          discriminator: [{ type: 'pattern', path: 'code' }],
          ordered: false,
          rules: 'open',
        },
        min: 2,
        max: '*',
        mustSupport: true,
      },
      {
        id: 'Observation.component:systolic',
        path: 'Observation.component',
        sliceName: 'systolic',
        min: 1,
        max: '1',
        mustSupport: true,
      },
      {
        id: 'Observation.component:systolic.code',
        path: 'Observation.component.code',
        min: 1,
        max: '1',
        patternCodeableConcept: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
        mustSupport: true,
      },
      {
        id: 'Observation.component:systolic.valueQuantity',
        path: 'Observation.component.valueQuantity',
        type: [{ code: 'Quantity' }],
        mustSupport: true,
      },
      {
        id: 'Observation.component:systolic.valueQuantity.value',
        path: 'Observation.component.valueQuantity.value',
        min: 1,
        max: '1',
        type: [{ code: 'decimal' }],
        mustSupport: true,
      },
      {
        id: 'Observation.component:systolic.valueQuantity.unit',
        path: 'Observation.component.valueQuantity.unit',
        min: 1,
        max: '1',
        type: [{ code: 'string' }],
        mustSupport: true,
      },
      {
        id: 'Observation.component:systolic.valueQuantity.system',
        path: 'Observation.component.valueQuantity.system',
        min: 1,
        max: '1',
        type: [{ code: 'uri' }],
        fixedUri: 'http://unitsofmeasure.org',
        mustSupport: true,
      },
      {
        id: 'Observation.component:systolic.valueQuantity.code',
        path: 'Observation.component.valueQuantity.code',
        min: 1,
        max: '1',
        type: [{ code: 'code' }],
        fixedCode: 'mm[Hg]',
        mustSupport: true,
      },
      {
        id: 'Observation.component:diastolic',
        path: 'Observation.component',
        sliceName: 'diastolic',
        min: 1,
        max: '1',
        mustSupport: true,
      },
      {
        id: 'Observation.component:diastolic.code',
        path: 'Observation.component.code',
        min: 1,
        max: '1',
        patternCodeableConcept: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
        mustSupport: true,
      },
      {
        id: 'Observation.component:diastolic.valueQuantity',
        path: 'Observation.component.valueQuantity',
        type: [{ code: 'Quantity' }],
        mustSupport: true,
      },
      {
        id: 'Observation.component:diastolic.valueQuantity.value',
        path: 'Observation.component.valueQuantity.value',
        min: 1,
        max: '1',
        type: [{ code: 'decimal' }],
        mustSupport: true,
      },
      {
        id: 'Observation.component:diastolic.valueQuantity.unit',
        path: 'Observation.component.valueQuantity.unit',
        min: 1,
        max: '1',
        type: [{ code: 'string' }],
        mustSupport: true,
      },
      {
        id: 'Observation.component:diastolic.valueQuantity.system',
        path: 'Observation.component.valueQuantity.system',
        min: 1,
        max: '1',
        type: [{ code: 'uri' }],
        fixedUri: 'http://unitsofmeasure.org',
        mustSupport: true,
      },
      {
        id: 'Observation.component:diastolic.valueQuantity.code',
        path: 'Observation.component.valueQuantity.code',
        min: 1,
        max: '1',
        type: [{ code: 'code' }],
        fixedCode: 'mm[Hg]',
        mustSupport: true,
      },
    ],
  },
};

const observation: Observation = {
  meta: {
    profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure'],
  },
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
          display: 'vital-signs',
        },
      ],
    },
  ],
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '8867-4',
        display: 'Heart rate',
      },
    ],
    text: 'Heart rate',
  },
  subject: {
    reference: 'Patient/991299df-7662-42ff-a203-c6b0adbdefee',
  },
  encounter: {
    reference: 'Encounter/55e5d713-b960-4f76-b087-a5bcfa5f6fd4',
  },
  effectiveDateTime: '2003-07-10T19:33:18-04:00',
  issued: '2003-07-10T19:33:18.715-04:00',
  dataAbsentReason: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/data-absent-reason',
        code: 'unknown',
        display: 'Unknown',
      },
    ],
    text: 'Unknown',
  },
  resourceType: 'Observation',
};

describe('StructureDefinition $snapshot', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  test('Snapshot generation', async () => {
    const accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/StructureDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(vitalSignsProfile);
    expect(res.status).toEqual(201);

    const res2 = await request(app)
      .post(`/fhir/R4/StructureDefinition`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(bloodPressureProfile);
    expect(res2.status).toEqual(201);

    const res3 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(observation);
    expect(res3.status).toEqual(400);
    expect(res3.body.issue?.[0]?.details?.text).toEqual(
      `No snapshot defined for StructureDefinition 'USCoreBloodPressureProfile'`
    );

    const res4 = await request(app)
      .post(`/fhir/R4/StructureDefinition/$snapshot`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'url', valueString: bloodPressureProfile.url }],
      });
    expect(res4.status).toEqual(200);
    expect(res4.body.snapshot).toBeDefined();

    const res5 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(observation);
    expect(res5.status).toEqual(400);
    expect(res5.body.issue).toHaveLength(2);
    expect(res5.body.issue?.[0]?.expression?.[0]).toEqual('Observation.code');
    expect(res5.body.issue?.[1]?.expression?.[0]).toEqual('Observation.component');
  });
});
