// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { BundleEntry, Condition, Observation, Patient } from '@medplum/fhirtypes';

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const SNOMED = 'http://snomed.info/sct';

// US Core profile URLs
const US_CORE_PATIENT = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
const US_CORE_BP = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure';
const US_CORE_BODY_WEIGHT = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight';
const US_CORE_BMI = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-bmi';
const US_CORE_CONDITION = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns';

const VITAL_SIGNS_CATEGORY = [
  { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
];

export const DEMO_TAG = { system: 'https://medplum.com/smart-on-fhir-demo', code: 'demo' };

const RISK_FACTORS: { code: string; display: string }[] = [
  { code: '38341003', display: 'Hypertension' },
  { code: '44054006', display: 'Type 2 diabetes mellitus' },
  { code: '13644009', display: 'Hypercholesterolemia' },
  { code: '414916001', display: 'Obesity' },
  { code: '77386006', display: 'Smoking' },
  { code: '59621000', display: 'Essential hypertension' },
  { code: '40930008', display: 'Hypothyroidism' },
  { code: '73211009', display: 'Diabetes mellitus' },
  { code: '230690007', display: 'Stroke' },
  { code: '22298006', display: 'Myocardial infarction' },
  { code: '195967001', display: 'Asthma' },
  { code: '13645005', display: 'Chronic obstructive lung disease' },
];

const DEMO_PATIENTS: { given: string; family: string; birthDate: string; gender: 'male' | 'female' }[] = [
  { given: 'James', family: 'Wilson', birthDate: '1978-03-15', gender: 'male' },
  { given: 'Maria', family: 'Garcia', birthDate: '1985-07-22', gender: 'female' },
  { given: 'Robert', family: 'Johnson', birthDate: '1962-11-08', gender: 'male' },
  { given: 'Linda', family: 'Martinez', birthDate: '1990-01-30', gender: 'female' },
  { given: 'David', family: 'Brown', birthDate: '1955-06-14', gender: 'male' },
  { given: 'Patricia', family: 'Davis', birthDate: '1972-09-03', gender: 'female' },
  { given: 'Michael', family: 'Anderson', birthDate: '1968-04-19', gender: 'male' },
  { given: 'Barbara', family: 'Thomas', birthDate: '1995-12-07', gender: 'female' },
  { given: 'William', family: 'Jackson', birthDate: '1980-08-25', gender: 'male' },
  { given: 'Susan', family: 'White', birthDate: '1963-05-11', gender: 'female' },
];

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function buildPatientEntry(id: string, p: (typeof DEMO_PATIENTS)[number]): BundleEntry {
  return {
    fullUrl: `urn:uuid:${id}`,
    request: { method: 'POST', url: 'Patient' },
    resource: {
      resourceType: 'Patient',
      meta: { profile: [US_CORE_PATIENT], tag: [DEMO_TAG] },
      identifier: [{ system: 'https://medplum.com/smart-on-fhir-demo', value: id }],
      name: [{ given: [p.given], family: p.family }],
      birthDate: p.birthDate,
      gender: p.gender,
    } as Patient,
  };
}

function buildBpEntry(patientUrn: string, daysAgo: number, systolic: number, diastolic: number): BundleEntry {
  return {
    request: { method: 'POST', url: 'Observation' },
    resource: {
      resourceType: 'Observation',
      meta: { profile: [US_CORE_BP], tag: [DEMO_TAG] },
      status: 'final',
      category: VITAL_SIGNS_CATEGORY,
      code: { coding: [{ system: LOINC, code: '55284-4', display: 'Blood pressure systolic and diastolic' }] },
      subject: { reference: patientUrn },
      effectiveDateTime: isoDate(daysAgo),
      component: [
        {
          code: { coding: [{ system: LOINC, code: '8480-6', display: 'Systolic blood pressure' }] },
          valueQuantity: { value: systolic, unit: 'mmHg', system: UCUM, code: 'mm[Hg]' },
        },
        {
          code: { coding: [{ system: LOINC, code: '8462-4', display: 'Diastolic blood pressure' }] },
          valueQuantity: { value: diastolic, unit: 'mmHg', system: UCUM, code: 'mm[Hg]' },
        },
      ],
    } as Observation,
  };
}

function buildWeightEntry(patientUrn: string, weightKg: number): BundleEntry {
  return {
    request: { method: 'POST', url: 'Observation' },
    resource: {
      resourceType: 'Observation',
      meta: { profile: [US_CORE_BODY_WEIGHT], tag: [DEMO_TAG] },
      status: 'final',
      category: VITAL_SIGNS_CATEGORY,
      code: { coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }] },
      subject: { reference: patientUrn },
      effectiveDateTime: isoDate(0),
      valueQuantity: { value: weightKg, unit: 'kg', system: UCUM, code: 'kg' },
    } as Observation,
  };
}

function buildBmiEntry(patientUrn: string, bmi: number): BundleEntry {
  return {
    request: { method: 'POST', url: 'Observation' },
    resource: {
      resourceType: 'Observation',
      meta: { profile: [US_CORE_BMI], tag: [DEMO_TAG] },
      status: 'final',
      category: VITAL_SIGNS_CATEGORY,
      code: { coding: [{ system: LOINC, code: '39156-5', display: 'Body mass index (BMI) [Ratio]' }] },
      subject: { reference: patientUrn },
      effectiveDateTime: isoDate(0),
      valueQuantity: { value: bmi, unit: 'kg/m2', system: UCUM, code: 'kg/m2' },
    } as Observation,
  };
}

function buildConditionEntry(patientUrn: string, factor: { code: string; display: string }): BundleEntry {
  return {
    request: { method: 'POST', url: 'Condition' },
    resource: {
      resourceType: 'Condition',
      meta: { profile: [US_CORE_CONDITION], tag: [DEMO_TAG] },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
      },
      verificationStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
      },
      category: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' }] },
      ],
      code: { coding: [{ system: SNOMED, code: factor.code, display: factor.display }], text: factor.display },
      subject: { reference: patientUrn },
    } as Condition,
  };
}

// Seeded pseudo-random so each patient gets consistent but varied values
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export async function createDemoPatients(medplum: MedplumClient): Promise<void> {
  const entries: BundleEntry[] = [];

  DEMO_PATIENTS.forEach((p, i) => {
    const patientUuid = crypto.randomUUID();
    const patientUrn = `urn:uuid:${patientUuid}`;
    const rand = seededRandom(i * 31 + 7);

    entries.push(buildPatientEntry(patientUuid, p));

    // 5 BP readings spaced ~1 month apart, oldest first
    for (let month = 4; month >= 0; month--) {
      const daysAgo = month * 30 + Math.floor(rand() * 5);
      const systolic = Math.round(110 + rand() * 35); // 110–145
      const diastolic = Math.round(70 + rand() * 25); // 70–95
      entries.push(buildBpEntry(patientUrn, daysAgo, systolic, diastolic));
    }

    // Weight and BMI
    const weightKg = Math.round((55 + rand() * 45) * 10) / 10; // 55–100 kg
    const heightM = 1.55 + rand() * 0.35; // 1.55–1.90 m
    const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
    entries.push(buildWeightEntry(patientUrn, weightKg));
    entries.push(buildBmiEntry(patientUrn, bmi));

    // 5 risk factors, selected deterministically from the pool
    const startIndex = Math.floor(rand() * RISK_FACTORS.length);
    for (let r = 0; r < 5; r++) {
      const factor = RISK_FACTORS[(startIndex + r) % RISK_FACTORS.length];
      entries.push(buildConditionEntry(patientUrn, factor));
    }
  });

  const responseBundle = await medplum.executeBatch({ resourceType: 'Bundle', type: 'batch', entry: entries });

  // Check for any entry-level errors in the batch response
  const failed = (responseBundle.entry ?? []).filter((e) => {
    const status = e.response?.status ?? '';
    return !status.startsWith('2');
  });
  if (failed.length > 0) {
    throw new Error(
      `Demo data creation failed for ${failed.length} entries. First error: ${failed[0].response?.status} ${failed[0].response?.outcome ? JSON.stringify(failed[0].response.outcome) : ''}`
    );
  }
}
