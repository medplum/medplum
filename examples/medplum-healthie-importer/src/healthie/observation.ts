// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Observation, Patient, Reference } from '@medplum/fhirtypes';
import type { HealthieClient } from './client';
import { HEALTHIE_ENTRY_ID_SYSTEM } from './constants';

export interface HealthieMetricEntry {
  id: string;
  category: string;
  metric_stat: number;
  created_at: string;
  updated_at?: string;
  description?: string;
  poster?: { id: string };
}

interface LoincMapping {
  code: string;
  display: string;
  unit: string;
  ucum: string;
  fhirCategory: 'vital-signs' | 'laboratory';
}

const CATEGORY_TO_LOINC: Record<string, LoincMapping> = {
  'Weight': { code: '29463-7', display: 'Body weight', unit: 'lbs', ucum: '[lb_av]', fhirCategory: 'vital-signs' },
  'Height': { code: '8302-2', display: 'Body height', unit: 'cm', ucum: 'cm', fhirCategory: 'vital-signs' },
  'BMI': { code: '39156-5', display: 'Body mass index', unit: 'kg/m2', ucum: 'kg/m2', fhirCategory: 'vital-signs' },
  'Heart Rate': { code: '8867-4', display: 'Heart rate', unit: '/min', ucum: '/min', fhirCategory: 'vital-signs' },
  'Blood Pressure Systolic': { code: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg', ucum: 'mm[Hg]', fhirCategory: 'vital-signs' },
  'Blood Pressure Diastolic': { code: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg', ucum: 'mm[Hg]', fhirCategory: 'vital-signs' },
  'Respiratory Rate': { code: '9279-1', display: 'Respiratory rate', unit: '/min', ucum: '/min', fhirCategory: 'vital-signs' },
  'Body temperature': { code: '8310-5', display: 'Body temperature', unit: 'Cel', ucum: 'Cel', fhirCategory: 'vital-signs' },
  'Body Fat %': { code: '41982-0', display: 'Percentage of body fat', unit: '%', ucum: '%', fhirCategory: 'vital-signs' },
  'Pain Severity': { code: '72514-3', display: 'Pain severity', unit: '{score}', ucum: '{score}', fhirCategory: 'vital-signs' },
  'Body mass index (BMI) [Percentile] Per age and sex': { code: '59576-9', display: 'BMI percentile per age and sex', unit: '%', ucum: '%', fhirCategory: 'vital-signs' },
  'Head Occipital-frontal circumference': { code: '9843-4', display: 'Head circumference', unit: 'cm', ucum: 'cm', fhirCategory: 'vital-signs' },
  'Hemoglobin A1c/Hemoglobin.total in Blood': { code: '4548-4', display: 'Hemoglobin A1c', unit: '%', ucum: '%', fhirCategory: 'laboratory' },
  'Glucose [Mass/volume] in Serum or Plasma': { code: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Glucose [Mass/volume] in Blood': { code: '2339-0', display: 'Glucose [Mass/volume] in Blood', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Urea nitrogen [Mass/volume] in Serum or Plasma': { code: '3094-0', display: 'Urea nitrogen [Mass/volume] in Serum or Plasma', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Urea nitrogen [Mass/volume] in Blood': { code: '6299-2', display: 'Urea nitrogen [Mass/volume] in Blood', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Creatinine [Mass/volume] in Serum or Plasma': { code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Creatinine [Mass/volume] in Blood': { code: '38483-4', display: 'Creatinine [Mass/volume] in Blood', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Sodium [Moles/volume] in Serum or Plasma': { code: '2951-2', display: 'Sodium [Moles/volume] in Serum or Plasma', unit: 'mmol/L', ucum: 'mmol/L', fhirCategory: 'laboratory' },
  'Sodium [Moles/volume] in Blood': { code: '2947-0', display: 'Sodium [Moles/volume] in Blood', unit: 'mmol/L', ucum: 'mmol/L', fhirCategory: 'laboratory' },
  'Potassium [Moles/volume] in Serum or Plasma': { code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma', unit: 'mmol/L', ucum: 'mmol/L', fhirCategory: 'laboratory' },
  'Potassium [Moles/volume] in Blood': { code: '6298-4', display: 'Potassium [Moles/volume] in Blood', unit: 'mmol/L', ucum: 'mmol/L', fhirCategory: 'laboratory' },
  'Chloride [Moles/volume] in Serum or Plasma': { code: '2075-0', display: 'Chloride [Moles/volume] in Serum or Plasma', unit: 'mmol/L', ucum: 'mmol/L', fhirCategory: 'laboratory' },
  'Chloride [Moles/volume] in Blood': { code: '2069-3', display: 'Chloride [Moles/volume] in Blood', unit: 'mmol/L', ucum: 'mmol/L', fhirCategory: 'laboratory' },
  'Carbon dioxide, total [Moles/volume] in Serum or Plasma': { code: '2028-9', display: 'CO2 total in Serum or Plasma', unit: 'mmol/L', ucum: 'mmol/L', fhirCategory: 'laboratory' },
  'Carbon dioxide, total [Moles/volume] in Blood': { code: '2027-1', display: 'CO2 total in Blood', unit: 'mmol/L', ucum: 'mmol/L', fhirCategory: 'laboratory' },
  'Calcium [Mass/volume] in Serum or Plasma': { code: '17861-6', display: 'Calcium [Mass/volume] in Serum or Plasma', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Calcium [Mass/volume] in Blood': { code: '49765-1', display: 'Calcium [Mass/volume] in Blood', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Cholesterol [Mass/volume] in Serum or Plasma': { code: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Cholesterol in HDL [Mass/volume] in Serum or Plasma': { code: '2085-9', display: 'HDL Cholesterol', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay': { code: '18262-6', display: 'LDL Cholesterol by direct', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Triglyceride [Mass/volume] in Serum or Plasma': { code: '2571-8', display: 'Triglyceride [Mass/volume] in Serum or Plasma', unit: 'mg/dL', ucum: 'mg/dL', fhirCategory: 'laboratory' },
  'Hemoglobin [Mass/volume] in Blood': { code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood', unit: 'g/dL', ucum: 'g/dL', fhirCategory: 'laboratory' },
  'Leukocytes [#/volume] in Blood by Automated count': { code: '6690-2', display: 'Leukocytes [#/volume] in Blood', unit: '10*3/uL', ucum: '10*3/uL', fhirCategory: 'laboratory' },
  'Erythrocytes [#/volume] in Blood by Automated count': { code: '789-8', display: 'Erythrocytes [#/volume] in Blood', unit: '10*6/uL', ucum: '10*6/uL', fhirCategory: 'laboratory' },
  'Hematocrit [Volume Fraction] of Blood by Automated count': { code: '4544-3', display: 'Hematocrit', unit: '%', ucum: '%', fhirCategory: 'laboratory' },
  'Platelets [#/volume] in Blood by Automated count': { code: '777-3', display: 'Platelets [#/volume] in Blood', unit: '10*3/uL', ucum: '10*3/uL', fhirCategory: 'laboratory' },
};

export async function fetchEntries(healthie: HealthieClient, patientId: string): Promise<HealthieMetricEntry[]> {
  const allEntries: HealthieMetricEntry[] = [];
  let hasMorePages = true;
  let offset = 0;
  const pageSize = 100;
  let loopCount = 0;

  while (hasMorePages) {
    const query = `
      query fetchEntries($clientId: String, $offset: Int, $pageSize: Int) {
        entries(client_id: $clientId, type: "MetricEntry", is_org: false, offset: $offset, page_size: $pageSize) {
          id
          category
          metric_stat
          created_at
          updated_at
          description
          poster {
            id
          }
        }
      }
    `;

    const result = await healthie.query<{ entries: HealthieMetricEntry[] | null }>(query, {
      clientId: patientId,
      offset,
      pageSize,
    });

    const entries = result.entries ?? [];
    allEntries.push(...entries);

    hasMorePages = entries.length === pageSize;
    offset += pageSize;

    loopCount++;
    if (loopCount > 1000) {
      throw new Error('Exiting fetchEntries due to too many pages');
    }
  }

  return allEntries;
}

export function convertHealthieEntryToFhir(
  entry: HealthieMetricEntry,
  patientReference: Reference<Patient>
): Observation {
  const mapping = CATEGORY_TO_LOINC[entry.category];
  const fhirCategory = mapping?.fhirCategory ?? 'laboratory';

  const observation: Observation = {
    resourceType: 'Observation',
    identifier: [{ system: HEALTHIE_ENTRY_ID_SYSTEM, value: entry.id }],
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: fhirCategory,
            display: fhirCategory === 'vital-signs' ? 'Vital Signs' : 'Laboratory',
          },
        ],
      },
    ],
    code: mapping
      ? {
          coding: [{ system: 'http://loinc.org', code: mapping.code, display: mapping.display }],
          text: entry.category,
        }
      : { text: entry.category },
    subject: patientReference,
    effectiveDateTime: new Date(entry.created_at).toISOString(),
    valueQuantity: {
      value: entry.metric_stat,
      unit: mapping?.unit ?? entry.category,
      system: 'http://unitsofmeasure.org',
      code: mapping?.ucum,
    },
  };

  return observation;
}

export function getLoincMapping(category: string): LoincMapping | undefined {
  return CATEGORY_TO_LOINC[category];
}
