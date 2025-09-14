// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  OID_ALLERGIES_SECTION_ENTRIES_REQUIRED,
  OID_ASSESSMENTS_SECTION,
  OID_CARE_TEAMS_SECTION,
  OID_CONTINUITY_OF_CARE_DOCUMENT,
  OID_ENCOUNTERS_SECTION_ENTRIES_REQUIRED,
  OID_FUNCTIONAL_STATUS_SECTION,
  OID_GOALS_SECTION,
  OID_HEALTH_CONCERNS_SECTION,
  OID_IMMUNIZATIONS_SECTION_ENTRIES_OPTIONAL,
  OID_IMMUNIZATIONS_SECTION_ENTRIES_REQUIRED,
  OID_MEDICAL_EQUIPMENT_ENTRIES_OPTIONAL,
  OID_MEDICATIONS_SECTION_ENTRIES_REQUIRED,
  OID_MENTAL_STATUS_SECTION,
  OID_NOTES_SECTION,
  OID_PAYERS_SECTION,
  OID_PLAN_OF_CARE_SECTION,
  OID_PROBLEMS_SECTION_ENTRIES_REQUIRED,
  OID_PROCEDURES_SECTION_ENTRIES_REQUIRED,
  OID_REASON_FOR_REFERRAL,
  OID_REFERAL_SUMMARY_C_CDA,
  OID_RESULTS_SECTION_ENTRIES_REQUIRED,
  OID_SOCIAL_HISTORY_SECTION_ENTRIES_OPTIONAL,
  OID_US_REALM_CDA_HEADER,
  OID_VITAL_SIGNS_SECTION_ENTRIES_REQUIRED,
} from './oids';
import {
  LOINC_ALLERGIES_SECTION,
  LOINC_ASSESSMENTS_SECTION,
  LOINC_CARE_TEAM_SECTION,
  LOINC_DEVICES_SECTION,
  LOINC_ENCOUNTERS_SECTION,
  LOINC_FUNCTIONAL_STATUS_SECTION,
  LOINC_GOALS_SECTION,
  LOINC_HEALTH_CONCERNS_SECTION,
  LOINC_IMMUNIZATIONS_SECTION,
  LOINC_INSURANCE_SECTION,
  LOINC_MEDICATIONS_SECTION,
  LOINC_MENTAL_STATUS_SECTION,
  LOINC_NOTES_SECTION,
  LOINC_PLAN_OF_TREATMENT_SECTION,
  LOINC_PROBLEMS_SECTION,
  LOINC_PROCEDURES_SECTION,
  LOINC_REASON_FOR_REFERRAL_SECTION,
  LOINC_RESULTS_SECTION,
  LOINC_SOCIAL_HISTORY_SECTION,
  LOINC_VITAL_SIGNS_SECTION,
} from './systems';
import { CcdaTemplateId } from './types';

export const CCDA_TEMPLATE_IDS = [
  {
    '@_root': OID_US_REALM_CDA_HEADER,
    '@_extension': '2015-08-01',
  },
  {
    '@_root': OID_US_REALM_CDA_HEADER,
  },
  {
    '@_root': OID_CONTINUITY_OF_CARE_DOCUMENT,
    '@_extension': '2015-08-01',
  },
  {
    '@_root': OID_CONTINUITY_OF_CARE_DOCUMENT,
  },
];

export const REFERRAL_TEMPLATE_IDS = [
  {
    '@_root': OID_US_REALM_CDA_HEADER,
    '@_extension': '2015-08-01',
  },
  {
    '@_root': OID_US_REALM_CDA_HEADER,
  },
  {
    '@_root': OID_REFERAL_SUMMARY_C_CDA,
    '@_extension': '2015-08-01',
  },
  {
    '@_root': OID_REFERAL_SUMMARY_C_CDA,
  },
];

// Order from Alice Newman guide:

// A) USCDI Data Class/Element: Allergies and Intolerances
// B) USCDI Data Class/Element: Medications
// C) USCDI Data Class/Element: Problems
// D) USCDI Data Class/Element: Immunizations
// E) USCDI Data Class/Element: Vital Signs
// F) USCDI Data Class/Element: Smoking Status
// G) USCDI Data Class/Element: Procedures
// H) USCDI Data Class/Element: Clinical Notes
// I) USCDI Data Class/Element: Laboratory Tests
// J) USCDI Data Class/Element: Laboratory Values/Results
// K) USCDI Data Class/Element: Clinical Notes
// L) USCDI Data Class/Element: Unique Device Identifiers for a Patient’s Implantable Device(s)
// M) USCDI Data Class/Element: Assessment and Plan of Treatment:
// N) USCDI Data Class/Element: Goals
// O) USCDI Data Class/Element: HealthConcerns
// P) USCDI Data Class/Element: Clinical Notes

// Example C-CDA Structure based on your USCDI list:

// 1. Allergies and Intolerances
// 2. Medications
// 3. Problems
// 4. Immunizations
// 5. Vital Signs
// 6. Social History (including Smoking Status)
// 7. Procedures
// 8. Results (including Laboratory Tests and Values/Results)
// 9. Clinical Notes
// 10. Device (Unique Device Identifiers)
// 11. Plan of Care (including Assessment and Plan of Treatment, Goals, and Health Concerns)

// Allergies and Intolerances 2.16.840.1.113883.10.20.22.2.6.1 Allergies Section (entries required)
export const ALLERGIES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_ALLERGIES_SECTION_ENTRIES_REQUIRED, '@_extension': '2015-08-01' },
  { '@_root': OID_ALLERGIES_SECTION_ENTRIES_REQUIRED },
];

// Medications 2.16.840.1.113883.10.20.22.2.1.1 Medications Section (entries required)
export const MEDICATIONS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_MEDICATIONS_SECTION_ENTRIES_REQUIRED, '@_extension': '2014-06-09' },
];

// Problems 2.16.840.1.113883.10.20.22.2.5.1 Problem Section (entries required)
export const PROBLEMS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_PROBLEMS_SECTION_ENTRIES_REQUIRED, '@_extension': '2015-08-01' },
  { '@_root': OID_PROBLEMS_SECTION_ENTRIES_REQUIRED },
];

// Immunizations 2.16.840.1.113883.10.20.22.2.2.1 Immunizations Section (entries required)
export const IMMUNIZATIONS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_IMMUNIZATIONS_SECTION_ENTRIES_OPTIONAL },
  { '@_root': OID_IMMUNIZATIONS_SECTION_ENTRIES_OPTIONAL, '@_extension': '2015-08-01' },
  { '@_root': OID_IMMUNIZATIONS_SECTION_ENTRIES_REQUIRED },
  { '@_root': OID_IMMUNIZATIONS_SECTION_ENTRIES_REQUIRED, '@_extension': '2015-08-01' },
];

// Vital Signs 2.16.840.1.113883.10.20.22.2.4.1 Vital Signs Section (entries required)
export const VITAL_SIGNS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_VITAL_SIGNS_SECTION_ENTRIES_REQUIRED, '@_extension': '2015-08-01' },
];

// Smoking Status 2.16.840.1.113883.10.20.22.2.16 Social History Section (entries required) - Use appropriate entries within this section for smoking status.
export const SOCIAL_HISTORY_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_SOCIAL_HISTORY_SECTION_ENTRIES_OPTIONAL },
  { '@_root': OID_SOCIAL_HISTORY_SECTION_ENTRIES_OPTIONAL, '@_extension': '2015-08-01' },
];

// Procedures 2.16.840.1.113883.10.20.22.2.7.1 Procedures Section (entries required)
// 47519-4
export const PROCEDURES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_PROCEDURES_SECTION_ENTRIES_REQUIRED, '@_extension': '2014-06-09' },
];

// Clinical Notes 2.16.840.1.113883.10.20.22.2.10 General Header Constraints (entries required) - Clinical notes can be included in various sections using this template ID.
export const CLINICAL_NOTES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_PLAN_OF_CARE_SECTION, '@_extension': '2014-06-09' },
];

// Laboratory Tests (Orders) 2.16.840.1.113883.10.20.22.2.3.1 Results Section (entries required) - Lab orders would be included as entries in this section.
export const LAB_TESTS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_RESULTS_SECTION_ENTRIES_REQUIRED, '@_extension': '2015-08-01' },
];

// Laboratory Values/Results 2.16.840.1.113883.10.20.22.2.3.1 Results Section (entries required) - Lab results would also be included as entries in this section.
export const RESULTS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_RESULTS_SECTION_ENTRIES_REQUIRED, '@_extension': '2015-08-01' },
];

// Unique Device Identifiers for a Patient's Implantable Device(s) 2.16.840.1.113883.10.20.22.2.23 Medical Equipment Section - Use appropriate entries within this section for implantable devices.
export const DEVICES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_MEDICAL_EQUIPMENT_ENTRIES_OPTIONAL, '@_extension': '2015-08-01' },
];

export const ASSESSMENTS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [{ '@_root': OID_ASSESSMENTS_SECTION }];

// Assessment and Plan of Treatment 2.16.840.1.113883.10.20.22.2.17 Assessment and Plan Section
export const PLAN_OF_TREATMENT_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_PLAN_OF_CARE_SECTION },
  { '@_root': OID_PLAN_OF_CARE_SECTION, '@_extension': '2014-06-09' },
];

// Encounters 2.16.840.1.113883.10.20.22.2.22.1 Encounters Section (entries required)
export const ENCOUNTERS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_ENCOUNTERS_SECTION_ENTRIES_REQUIRED, '@_extension': '2015-08-01' },
];

// Goals 2.16.840.1.113883.10.20.22.2.17 Assessment and Plan Section - Goals can be included as entries within this section.
export const GOALS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [{ '@_root': OID_GOALS_SECTION }];

// Health Concerns 2.16.840.1.113883.10.20.22.2.58  Health concerns can be represented as problems.
export const HEALTH_CONCERNS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_HEALTH_CONCERNS_SECTION, '@_extension': '2015-08-01' },
];

export const REASON_FOR_REFERRAL_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_REASON_FOR_REFERRAL, '@_extension': '2014-06-09' },
];

export const MENTAL_STATUS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_MENTAL_STATUS_SECTION, '@_extension': '2015-08-01' },
];

export const PATIENT_NOTES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_NOTES_SECTION, '@_extension': '2016-11-01' },
];

export const CARE_TEAM_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_CARE_TEAMS_SECTION, '@_extension': '2022-06-01' },
];

export const INSURANCE_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_PAYERS_SECTION, '@_extension': '2015-08-01' },
  { '@_root': OID_PAYERS_SECTION },
];

export const FUNCTIONAL_STATUS_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': OID_FUNCTIONAL_STATUS_SECTION, '@_extension': '2014-06-09' },
  { '@_root': OID_FUNCTIONAL_STATUS_SECTION },
];

// 1. Allergies and Intolerances
// 2. Medications
// 3. Problems
// 4. Immunizations
// 5. Vital Signs
// 6. Social History (including Smoking Status)
// 7. Procedures
// 8. Results (including Laboratory Tests and Values/Results)
// 9. Clinical Notes
// 10. Device (Unique Device Identifiers)
// 11. Plan of Care (including Assessment and Plan of Treatment, Goals, and Health Concerns)

export const LOINC_TO_TEMPLATE_IDS: Record<string, CcdaTemplateId[]> = Object.fromEntries([
  [LOINC_ALLERGIES_SECTION, ALLERGIES_SECTION_TEMPLATE_IDS],
  [LOINC_MEDICATIONS_SECTION, MEDICATIONS_SECTION_TEMPLATE_IDS],
  [LOINC_PROBLEMS_SECTION, PROBLEMS_SECTION_TEMPLATE_IDS],
  [LOINC_IMMUNIZATIONS_SECTION, IMMUNIZATIONS_SECTION_TEMPLATE_IDS],
  [LOINC_VITAL_SIGNS_SECTION, VITAL_SIGNS_SECTION_TEMPLATE_IDS],
  [LOINC_SOCIAL_HISTORY_SECTION, SOCIAL_HISTORY_SECTION_TEMPLATE_IDS],
  [LOINC_PROCEDURES_SECTION, PROCEDURES_SECTION_TEMPLATE_IDS],
  [LOINC_RESULTS_SECTION, RESULTS_SECTION_TEMPLATE_IDS],
  [LOINC_ASSESSMENTS_SECTION, ASSESSMENTS_SECTION_TEMPLATE_IDS],
  [LOINC_PLAN_OF_TREATMENT_SECTION, PLAN_OF_TREATMENT_SECTION_TEMPLATE_IDS],
  [LOINC_ENCOUNTERS_SECTION, ENCOUNTERS_SECTION_TEMPLATE_IDS],
  [LOINC_GOALS_SECTION, GOALS_SECTION_TEMPLATE_IDS],
  [LOINC_HEALTH_CONCERNS_SECTION, HEALTH_CONCERNS_SECTION_TEMPLATE_IDS],
  [LOINC_REASON_FOR_REFERRAL_SECTION, REASON_FOR_REFERRAL_SECTION_TEMPLATE_IDS],
  [LOINC_MENTAL_STATUS_SECTION, MENTAL_STATUS_SECTION_TEMPLATE_IDS],
  [LOINC_NOTES_SECTION, PATIENT_NOTES_SECTION_TEMPLATE_IDS],
  [LOINC_CARE_TEAM_SECTION, CARE_TEAM_SECTION_TEMPLATE_IDS],
  [LOINC_INSURANCE_SECTION, INSURANCE_SECTION_TEMPLATE_IDS],
  [LOINC_DEVICES_SECTION, DEVICES_SECTION_TEMPLATE_IDS],
  [LOINC_FUNCTIONAL_STATUS_SECTION, FUNCTIONAL_STATUS_TEMPLATE_IDS],
]);
