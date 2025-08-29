// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * QRDA-specific Object Identifiers (OIDs) and Template IDs
 */

// QRDA Category I Template IDs
export const QRDA_CATEGORY_I_TEMPLATE_IDS = [
  // US Realm Header Template Id
  { '@_root': '2.16.840.1.113883.10.20.22.1.1', '@_extension': '2015-08-01' },
  // QRDA templateId
  { '@_root': '2.16.840.1.113883.10.20.24.1.1', '@_extension': '2017-08-01' },
  // QDM-based QRDA templateId
  { '@_root': '2.16.840.1.113883.10.20.24.1.2', '@_extension': '2021-08-01' },
  // CMS QRDA templateId - QRDA Category I Report - CMS (V8)
  { '@_root': '2.16.840.1.113883.10.20.24.1.3', '@_extension': '2022-02-01' },
];

// QRDA Section Template IDs
export const OID_MEASURE_SECTION = '2.16.840.1.113883.10.20.24.2.2';
export const OID_MEASURE_SECTION_QDM = '2.16.840.1.113883.10.20.24.2.3';
export const OID_REPORTING_PARAMETERS_SECTION = '2.16.840.1.113883.10.20.17.2.1';
export const OID_REPORTING_PARAMETERS_SECTION_V2 = '2.16.840.1.113883.10.20.17.2.1.1';
export const OID_PATIENT_DATA_SECTION = '2.16.840.1.113883.10.20.17.2.4';
export const OID_PATIENT_DATA_SECTION_QDM = '2.16.840.1.113883.10.20.24.2.1';
export const OID_PATIENT_DATA_SECTION_QDM_V2 = '2.16.840.1.113883.10.20.24.2.1.1';

// QRDA Entry Template IDs
export const OID_MEASURE_REFERENCE = '2.16.840.1.113883.10.20.24.3.98';
export const OID_EMEASURE_REFERENCE_QDM = '2.16.840.1.113883.10.20.24.3.97';
export const OID_REPORTING_PARAMETERS_ACT = '2.16.840.1.113883.10.20.17.3.8';
export const OID_REPORTING_PARAMETERS_ACT_V2 = '2.16.840.1.113883.10.20.17.3.8.1';

// QDM-specific Template IDs
export const OID_ENCOUNTER_PERFORMED = '2.16.840.1.113883.10.20.24.3.23';
export const OID_ENCOUNTER_DIAGNOSIS_QDM = '2.16.840.1.113883.10.20.24.3.168';
export const OID_INTERVENTION_PERFORMED = '2.16.840.1.113883.10.20.24.3.32';
export const OID_PROCEDURE_PERFORMED = '2.16.840.1.113883.10.20.24.3.64';
export const OID_PATIENT_CHARACTERISTIC_PAYER = '2.16.840.1.113883.10.20.24.3.55';
export const OID_NEGATION_RATIONALE = '2.16.840.1.113883.10.20.24.3.88';
export const OID_AUTHOR_DATETIME = '2.16.840.1.113883.10.20.24.3.155';
export const OID_RANK_OBSERVATION = '2.16.840.1.113883.10.20.24.3.166';

// LOINC codes for QRDA
export const LOINC_QUALITY_MEASURE_REPORT = '55182-0';
export const LOINC_MEASURE_DOCUMENT = '55186-1';
export const LOINC_REPORTING_PARAMETERS = '55187-9';
export const LOINC_PATIENT_DATA = '55188-7';
export const LOINC_DIAGNOSIS = '29308-4';
export const LOINC_PAYMENT_SOURCE = '48768-6';
export const LOINC_REASON_CARE_ACTION = '77301-0';

// SNOMED CT codes for QRDA
export const SNOMED_OBSERVATION_PARAMETERS = '252116004';
export const SNOMED_RANK = '263486008';

// HL7 Code Systems
export const HL7_ACT_CODE_SYSTEM = '2.16.840.1.113883.5.4';
export const HL7_ACT_PRIORITY_SYSTEM = '2.16.840.1.113883.5.7';

// Source of Payment Typology
export const PAYMENT_TYPOLOGY_SYSTEM = '2.16.840.1.113883.3.221.5';
