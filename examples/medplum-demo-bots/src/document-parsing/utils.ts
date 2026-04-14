// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LOINC, UCUM } from '@medplum/core';
import type {
  CodeableConcept,
  Observation,
  Organization,
  Patient,
  Quantity,
  Reference,
} from '@medplum/fhirtypes';
import type { DocumentParsingProvider, ParsedTestResult } from './types';

const INTERPRETATION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';

export const INTERPRETATION_CODES: Record<string, CodeableConcept> = {
  N: {
    text: 'Normal',
    coding: [{ display: 'Normal', code: 'N', system: INTERPRETATION_SYSTEM }],
  },
  H: {
    text: 'High',
    coding: [{ display: 'High', code: 'H', system: INTERPRETATION_SYSTEM }],
  },
  HH: {
    text: 'Critical high',
    coding: [{ display: 'Critical high', code: 'HH', system: INTERPRETATION_SYSTEM }],
  },
  L: {
    text: 'Low',
    coding: [{ display: 'Low', code: 'L', system: INTERPRETATION_SYSTEM }],
  },
  LL: {
    text: 'Critical low',
    coding: [{ display: 'Critical low', code: 'LL', system: INTERPRETATION_SYSTEM }],
  },
  A: {
    text: 'Abnormal',
    coding: [{ display: 'Abnormal', code: 'A', system: INTERPRETATION_SYSTEM }],
  },
  AA: {
    text: 'Critical abnormal',
    coding: [{ display: 'Critical abnormal', code: 'AA', system: INTERPRETATION_SYSTEM }],
  },
};

/**
 * Common lab test names mapped to LOINC codes.
 * This is a best-effort mapping. Customers should extend this table for their specific needs.
 */
export const COMMON_LOINC_CODES: Record<string, CodeableConcept> = {
  glucose: { coding: [{ system: LOINC, code: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma' }] },
  'blood glucose': {
    coding: [{ system: LOINC, code: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma' }],
  },
  hemoglobin: { coding: [{ system: LOINC, code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' }] },
  hematocrit: { coding: [{ system: LOINC, code: '4544-3', display: 'Hematocrit [Volume Fraction] of Blood' }] },
  wbc: {
    coding: [{ system: LOINC, code: '6690-2', display: 'Leukocytes [#/volume] in Blood by Automated count' }],
  },
  'white blood cell count': {
    coding: [{ system: LOINC, code: '6690-2', display: 'Leukocytes [#/volume] in Blood by Automated count' }],
  },
  rbc: {
    coding: [{ system: LOINC, code: '789-8', display: 'Erythrocytes [#/volume] in Blood by Automated count' }],
  },
  'red blood cell count': {
    coding: [{ system: LOINC, code: '789-8', display: 'Erythrocytes [#/volume] in Blood by Automated count' }],
  },
  platelets: {
    coding: [{ system: LOINC, code: '777-3', display: 'Platelets [#/volume] in Blood by Automated count' }],
  },
  'platelet count': {
    coding: [{ system: LOINC, code: '777-3', display: 'Platelets [#/volume] in Blood by Automated count' }],
  },
  sodium: { coding: [{ system: LOINC, code: '2951-2', display: 'Sodium [Moles/volume] in Serum or Plasma' }] },
  potassium: { coding: [{ system: LOINC, code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma' }] },
  chloride: { coding: [{ system: LOINC, code: '2075-0', display: 'Chloride [Moles/volume] in Serum or Plasma' }] },
  'co2': {
    coding: [{ system: LOINC, code: '2028-9', display: 'Carbon dioxide, total [Moles/volume] in Serum or Plasma' }],
  },
  bicarbonate: {
    coding: [{ system: LOINC, code: '2028-9', display: 'Carbon dioxide, total [Moles/volume] in Serum or Plasma' }],
  },
  bun: {
    coding: [
      { system: LOINC, code: '3094-0', display: 'Urea nitrogen [Mass/volume] in Serum or Plasma' },
    ],
  },
  'blood urea nitrogen': {
    coding: [{ system: LOINC, code: '3094-0', display: 'Urea nitrogen [Mass/volume] in Serum or Plasma' }],
  },
  creatinine: {
    coding: [{ system: LOINC, code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' }],
  },
  calcium: { coding: [{ system: LOINC, code: '17861-6', display: 'Calcium [Mass/volume] in Serum or Plasma' }] },
  'total protein': {
    coding: [{ system: LOINC, code: '2885-2', display: 'Protein [Mass/volume] in Serum or Plasma' }],
  },
  albumin: { coding: [{ system: LOINC, code: '1751-7', display: 'Albumin [Mass/volume] in Serum or Plasma' }] },
  bilirubin: {
    coding: [{ system: LOINC, code: '1975-2', display: 'Bilirubin.total [Mass/volume] in Serum or Plasma' }],
  },
  'total bilirubin': {
    coding: [{ system: LOINC, code: '1975-2', display: 'Bilirubin.total [Mass/volume] in Serum or Plasma' }],
  },
  'alkaline phosphatase': {
    coding: [{ system: LOINC, code: '6768-6', display: 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma' }],
  },
  alp: {
    coding: [{ system: LOINC, code: '6768-6', display: 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma' }],
  },
  ast: {
    coding: [{ system: LOINC, code: '1920-8', display: 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma' }],
  },
  sgot: {
    coding: [{ system: LOINC, code: '1920-8', display: 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma' }],
  },
  alt: {
    coding: [{ system: LOINC, code: '1742-6', display: 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma' }],
  },
  sgpt: {
    coding: [{ system: LOINC, code: '1742-6', display: 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma' }],
  },
  cholesterol: {
    coding: [{ system: LOINC, code: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma' }],
  },
  'total cholesterol': {
    coding: [{ system: LOINC, code: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma' }],
  },
  hdl: {
    coding: [{ system: LOINC, code: '2085-9', display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma' }],
  },
  'hdl cholesterol': {
    coding: [{ system: LOINC, code: '2085-9', display: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma' }],
  },
  ldl: {
    coding: [{ system: LOINC, code: '13457-7', display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation' }],
  },
  'ldl cholesterol': {
    coding: [{ system: LOINC, code: '13457-7', display: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation' }],
  },
  triglycerides: {
    coding: [{ system: LOINC, code: '2571-8', display: 'Triglyceride [Mass/volume] in Serum or Plasma' }],
  },
  tsh: {
    coding: [{ system: LOINC, code: '11580-8', display: 'Thyrotropin [Units/volume] in Serum or Plasma' }],
  },
  't4 free': {
    coding: [{ system: LOINC, code: '3024-7', display: 'Thyroxine (T4) free [Mass/volume] in Serum or Plasma' }],
  },
  'free t4': {
    coding: [{ system: LOINC, code: '3024-7', display: 'Thyroxine (T4) free [Mass/volume] in Serum or Plasma' }],
  },
  'hemoglobin a1c': {
    coding: [{ system: LOINC, code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' }],
  },
  hba1c: {
    coding: [{ system: LOINC, code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' }],
  },
  'a1c': {
    coding: [{ system: LOINC, code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' }],
  },
  egfr: {
    coding: [{ system: LOINC, code: '33914-3', display: 'Glomerular filtration rate/1.73 sq M.predicted' }],
  },
  'gfr estimated': {
    coding: [{ system: LOINC, code: '33914-3', display: 'Glomerular filtration rate/1.73 sq M.predicted' }],
  },
};

/**
 * Attempt to map a test name to a LOINC CodeableConcept.
 * Falls back to a text-only code if no LOINC match is found.
 */
export function mapToLoincCode(testName: string, testCode?: string): CodeableConcept {
  // If a LOINC code was explicitly provided by the parser, use it
  if (testCode) {
    return {
      coding: [{ system: LOINC, code: testCode, display: testName }],
      text: testName,
    };
  }

  // Attempt a case-insensitive lookup
  const normalized = testName.toLowerCase().trim();
  const match = COMMON_LOINC_CODES[normalized];
  if (match) {
    return { ...match, text: testName };
  }

  // Fallback: text-only code (no LOINC coding)
  return { text: testName };
}

/**
 * Parse a reference range string into FHIR Range low/high values.
 */
export function parseReferenceRange(
  rangeText?: string,
  low?: number,
  high?: number,
  unit?: string
): Observation['referenceRange'] {
  const range: Observation['referenceRange'] = [{}];
  const system = UCUM;

  if (low !== undefined || high !== undefined) {
    range[0] = {
      ...(low !== undefined ? { low: { value: low, unit: unit, system } } : {}),
      ...(high !== undefined ? { high: { value: high, unit: unit, system } } : {}),
    };
    if (rangeText) {
      range[0].text = rangeText;
    }
    return range;
  }

  if (rangeText) {
    range[0].text = rangeText;

    const trimmed = rangeText.trim();
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 2) {
        const lowVal = Number.parseFloat(parts[0]);
        const highVal = Number.parseFloat(parts[1]);
        if (!Number.isNaN(lowVal)) {
          range[0].low = { value: lowVal, unit, system } as Quantity;
        }
        if (!Number.isNaN(highVal)) {
          range[0].high = { value: highVal, unit, system } as Quantity;
        }
      }
    }
  }

  return range;
}

/**
 * Build a contained Observation from a parsed test result.
 */
export function buildContainedObservation(
  result: ParsedTestResult,
  index: number,
  subject: Reference<Patient>,
  performer: Reference<Organization>
): Observation {
  const observation: Observation = {
    resourceType: 'Observation',
    id: `obs-${index}`,
    status: 'preliminary',
    code: mapToLoincCode(result.testName, result.testCode),
    subject,
    performer: [performer],
  };

  // Set value
  if (result.numericValue !== undefined) {
    observation.valueQuantity = {
      value: result.numericValue,
      unit: result.unit,
      system: UCUM,
    };
  } else if (result.value) {
    // Check for comparator patterns like "<0.01", ">150"
    const comparatorMatch = result.value.match(/^([<>]=?)(.+)$/);
    if (comparatorMatch) {
      const numVal = Number.parseFloat(comparatorMatch[2]);
      if (!Number.isNaN(numVal)) {
        observation.valueQuantity = {
          comparator: comparatorMatch[1] as Quantity['comparator'],
          value: numVal,
          unit: result.unit,
          system: UCUM,
        };
      } else {
        observation.valueString = result.value;
      }
    } else {
      const numVal = Number.parseFloat(result.value);
      if (!Number.isNaN(numVal)) {
        observation.valueQuantity = {
          value: numVal,
          unit: result.unit,
          system: UCUM,
        };
      } else {
        observation.valueString = result.value;
      }
    }
  }

  // Set reference range
  if (result.referenceRangeLow !== undefined || result.referenceRangeHigh !== undefined || result.referenceRangeText) {
    observation.referenceRange = parseReferenceRange(
      result.referenceRangeText,
      result.referenceRangeLow,
      result.referenceRangeHigh,
      result.unit
    );
  }

  // Set interpretation
  if (result.interpretation && INTERPRETATION_CODES[result.interpretation]) {
    observation.interpretation = [INTERPRETATION_CODES[result.interpretation]];
  }

  // Set notes
  if (result.notes) {
    observation.note = [{ text: result.notes }];
  }

  return observation;
}

/**
 * Select the appropriate parsing provider based on configuration.
 */
export function getParsingProvider(secrets: Record<string, { valueString?: string }>): DocumentParsingProvider {
  const providerName = secrets['PARSING_PROVIDER']?.valueString;
  if (!providerName) {
    throw new Error('PARSING_PROVIDER secret is not configured');
  }

  // Dynamic import is not available in bot context, so we use a factory pattern.
  // Callers should pass the provider directly or use this as a configuration check.
  switch (providerName) {
    case 'reducto':
    case 'bedrock-data-automation':
      // Return a stub that identifies the provider; actual implementation is passed by the bot
      return { name: providerName } as DocumentParsingProvider;
    default:
      throw new Error(`Unknown parsing provider: ${providerName}. Expected 'reducto' or 'bedrock-data-automation'.`);
  }
}
