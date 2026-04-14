// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Structured data extracted from a parsed lab report PDF.
 * This schema is used as the target output for both Reducto and BDA providers.
 */
export interface ParsedLabReport {
  reportDate: string;
  accessionNumber?: string;
  specimenCollectionDate?: string;
  specimenType?: string;
  reportStatus: 'preliminary' | 'final' | 'corrected';

  performingLab: {
    name: string;
    address?: string;
    phone?: string;
    cliaNumber?: string;
    npi?: string;
  };

  orderingProvider?: {
    name: string;
    npi?: string;
  };

  patient: {
    name: string;
    dateOfBirth?: string;
    mrn?: string;
  };

  results: ParsedTestResult[];

  citations?: ParsedCitation[];
}

export interface ParsedTestResult {
  testName: string;
  testCode?: string;
  value: string;
  numericValue?: number;
  unit?: string;
  referenceRangeLow?: number;
  referenceRangeHigh?: number;
  referenceRangeText?: string;
  interpretation?: 'N' | 'H' | 'L' | 'HH' | 'LL' | 'A' | 'AA';
  notes?: string;
}

export interface ParsedCitation {
  field: string;
  sourceText: string;
  pageNumber?: number;
  boundingBox?: number[];
}

/**
 * Abstraction over document parsing services (Reducto, BDA, etc.).
 * Each provider implements this interface to normalize extracted data into ParsedLabReport.
 */
export interface DocumentParsingProvider {
  readonly name: string;
  parseDocument(documentUrl: string, config: Record<string, string>): Promise<ParsedLabReport>;
}

/**
 * JSON Schema representation of ParsedLabReport, used by Reducto's Extract endpoint
 * and convertible to a BDA blueprint.
 */
export const PARSED_LAB_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    reportDate: { type: 'string', description: 'The date the lab report was issued or resulted (ISO 8601 format)' },
    accessionNumber: { type: 'string', description: 'The accession number or specimen ID assigned by the lab' },
    specimenCollectionDate: {
      type: 'string',
      description: 'The date the specimen was collected (ISO 8601 format)',
    },
    specimenType: { type: 'string', description: 'The type of specimen (e.g., Blood, Urine, Serum)' },
    reportStatus: {
      type: 'string',
      enum: ['preliminary', 'final', 'corrected'],
      description: 'The status of the lab report',
    },
    performingLab: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the laboratory that performed the tests' },
        address: { type: 'string', description: 'Address of the performing laboratory' },
        phone: { type: 'string', description: 'Phone number of the performing laboratory' },
        cliaNumber: { type: 'string', description: 'CLIA certification number of the lab' },
        npi: { type: 'string', description: 'NPI number of the performing laboratory' },
      },
      required: ['name'],
    },
    orderingProvider: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the ordering physician or provider' },
        npi: { type: 'string', description: 'NPI number of the ordering provider' },
      },
    },
    patient: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the patient as printed on the report' },
        dateOfBirth: { type: 'string', description: 'Patient date of birth (ISO 8601 format)' },
        mrn: { type: 'string', description: 'Medical record number of the patient' },
      },
      required: ['name'],
    },
    results: {
      type: 'array',
      description: 'Individual test results from the lab report',
      items: {
        type: 'object',
        properties: {
          testName: { type: 'string', description: 'Name of the lab test as printed on the report' },
          testCode: { type: 'string', description: 'LOINC code for the test, if printed on the report' },
          value: { type: 'string', description: 'The test result value exactly as printed (e.g., "5.2", "<0.01")' },
          numericValue: { type: 'number', description: 'Parsed numeric value of the result, if applicable' },
          unit: { type: 'string', description: 'Unit of measurement (e.g., mg/dL, mIU/L)' },
          referenceRangeLow: { type: 'number', description: 'Lower bound of the reference/normal range' },
          referenceRangeHigh: { type: 'number', description: 'Upper bound of the reference/normal range' },
          referenceRangeText: {
            type: 'string',
            description: 'Raw reference range text as printed (e.g., "0.5-4.5", "<150")',
          },
          interpretation: {
            type: 'string',
            enum: ['N', 'H', 'L', 'HH', 'LL', 'A', 'AA'],
            description: 'Flag: N=Normal, H=High, L=Low, HH=Critical High, LL=Critical Low, A=Abnormal, AA=Critical Abnormal',
          },
          notes: { type: 'string', description: 'Any notes or comments associated with this test result' },
        },
        required: ['testName', 'value'],
      },
    },
  },
  required: ['reportDate', 'performingLab', 'patient', 'results'],
} as const;
