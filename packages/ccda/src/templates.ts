import { CcdaTemplateId } from './types';

export const CCDA_TEMPLATE_IDS = [
  {
    '@_root': '2.16.840.1.113883.10.20.22.1.1',
    '@_extension': '2015-08-01',
  },
  {
    '@_root': '2.16.840.1.113883.10.20.22.1.1',
  },
  {
    '@_root': '2.16.840.1.113883.10.20.22.1.2',
    '@_extension': '2015-08-01',
  },
  {
    '@_root': '2.16.840.1.113883.10.20.22.1.2',
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
export const ALLERGIES_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.6.1';
export const ALLERGIES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': ALLERGIES_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

// Medications 2.16.840.1.113883.10.20.22.2.1.1 Medications Section (entries required)
export const MEDICATION_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.1.1';
export const MEDICATIONS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': MEDICATION_SECTION_TEMPLATE_ID, '@_extension': '2014-06-09' },
];

// Problems 2.16.840.1.113883.10.20.22.2.5.1 Problem Section (entries required)
export const PROBLEMS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.5.1';
export const PROBLEMS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': PROBLEMS_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

// Immunizations 2.16.840.1.113883.10.20.22.2.2.1 Immunizations Section (entries required)
export const IMMUNIZATIONS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.2.1';
export const IMMUNIZATIONS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': '2.16.840.1.113883.10.20.22.2.2' },
  { '@_root': '2.16.840.1.113883.10.20.22.2.2', '@_extension': '2015-08-01' },
  { '@_root': '2.16.840.1.113883.10.20.22.2.2.1' },
  { '@_root': '2.16.840.1.113883.10.20.22.2.2.1', '@_extension': '2015-08-01' },
];

// Vital Signs 2.16.840.1.113883.10.20.22.2.4.1 Vital Signs Section (entries required)
export const VITAL_SIGNS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.4.1';
export const VITAL_SIGNS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': VITAL_SIGNS_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

// Smoking Status 2.16.840.1.113883.10.20.22.2.16 Social History Section (entries required) - Use appropriate entries within this section for smoking status.
export const SOCIAL_HISTORY_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.17';
export const SOCIAL_HISTORY_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': SOCIAL_HISTORY_SECTION_TEMPLATE_ID },
  { '@_root': SOCIAL_HISTORY_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

// Procedures 2.16.840.1.113883.10.20.22.2.7.1 Procedures Section (entries required)
// 47519-4
export const PROCEDURES_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.7.1';
export const PROCEDURES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': PROCEDURES_SECTION_TEMPLATE_ID, '@_extension': '2014-06-09' },
];

// Clinical Notes 2.16.840.1.113883.10.20.22.2.10 General Header Constraints (entries required) - Clinical notes can be included in various sections using this template ID.
export const CLINICAL_NOTES_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.10';
export const CLINICAL_NOTES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': CLINICAL_NOTES_SECTION_TEMPLATE_ID, '@_extension': '2014-06-09' },
];

// Laboratory Tests (Orders) 2.16.840.1.113883.10.20.22.2.3.1 Results Section (entries required) - Lab orders would be included as entries in this section.
export const LAB_TESTS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.3.1';
export const LAB_TESTS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': LAB_TESTS_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

// Laboratory Values/Results 2.16.840.1.113883.10.20.22.2.3.1 Results Section (entries required) - Lab results would also be included as entries in this section.
export const RESULTS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.3.1';
export const RESULTS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': RESULTS_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

// Unique Device Identifiers for a Patient's Implantable Device(s) 2.16.840.1.113883.10.20.22.2.23 Medical Equipment Section - Use appropriate entries within this section for implantable devices.
export const DEVICES_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.23';
export const DEVICES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': DEVICES_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

export const ASSESSMENTS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.8';
export const ASSESSMENTS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [{ '@_root': ASSESSMENTS_SECTION_TEMPLATE_ID }];

// Assessment and Plan of Treatment 2.16.840.1.113883.10.20.22.2.17 Assessment and Plan Section
export const PLAN_OF_TREATMENT_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.10';
export const PLAN_OF_TREATMENT_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': PLAN_OF_TREATMENT_SECTION_TEMPLATE_ID },
  { '@_root': PLAN_OF_TREATMENT_SECTION_TEMPLATE_ID, '@_extension': '2014-06-09' },
];

// Encounters 2.16.840.1.113883.10.20.22.2.22.1 Encounters Section (entries required)
export const ENCOUNTERS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.22.1';
export const ENCOUNTERS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': ENCOUNTERS_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

// Goals 2.16.840.1.113883.10.20.22.2.17 Assessment and Plan Section - Goals can be included as entries within this section.
export const GOALS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.60';
export const GOALS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [{ '@_root': GOALS_SECTION_TEMPLATE_ID }];

// Health Concerns 2.16.840.1.113883.10.20.22.2.58  Health concerns can be represented as problems.
export const HEALTH_CONCERNS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.58';
export const HEALTH_CONCERNS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': HEALTH_CONCERNS_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

export const REASON_FOR_REFERRAL_SECTION_TEMPLATE_ID = '1.3.6.1.4.1.19376.1.5.3.1.3.1';
export const REASON_FOR_REFERRAL_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': REASON_FOR_REFERRAL_SECTION_TEMPLATE_ID, '@_extension': '2014-06-09' },
];

export const MENTAL_STATUS_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.56';
export const MENTAL_STATUS_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': MENTAL_STATUS_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
];

export const PATIENT_NOTES_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.65';
export const PATIENT_NOTES_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': PATIENT_NOTES_SECTION_TEMPLATE_ID, '@_extension': '2016-11-01' },
];

export const CARE_TEAM_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.500';
export const CARE_TEAM_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': CARE_TEAM_SECTION_TEMPLATE_ID, '@_extension': '2022-06-01' },
];

export const INSURANCE_SECTION_TEMPLATE_ID = '2.16.840.1.113883.10.20.22.2.18';
export const INSURANCE_SECTION_TEMPLATE_IDS: CcdaTemplateId[] = [
  { '@_root': INSURANCE_SECTION_TEMPLATE_ID, '@_extension': '2015-08-01' },
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

export const LOINC_TO_TEMPLATE_IDS: Record<string, CcdaTemplateId[]> = {
  '48765-2': ALLERGIES_SECTION_TEMPLATE_IDS,
  '10160-0': MEDICATIONS_SECTION_TEMPLATE_IDS,
  '11450-4': PROBLEMS_SECTION_TEMPLATE_IDS,
  '11369-6': IMMUNIZATIONS_SECTION_TEMPLATE_IDS,
  '11348-0': IMMUNIZATIONS_SECTION_TEMPLATE_IDS,
  '9176-8': IMMUNIZATIONS_SECTION_TEMPLATE_IDS,
  '8716-3': VITAL_SIGNS_SECTION_TEMPLATE_IDS,
  '29762-2': SOCIAL_HISTORY_SECTION_TEMPLATE_IDS,
  '47519-4': PROCEDURES_SECTION_TEMPLATE_IDS,
  '30954-2': RESULTS_SECTION_TEMPLATE_IDS,
  '51848-0': ASSESSMENTS_SECTION_TEMPLATE_IDS,
  '18776-5': PLAN_OF_TREATMENT_SECTION_TEMPLATE_IDS,
  '46240-8': ENCOUNTERS_SECTION_TEMPLATE_IDS,
  '61146-7': GOALS_SECTION_TEMPLATE_IDS,
  '75310-3': HEALTH_CONCERNS_SECTION_TEMPLATE_IDS,
  '42349-1': REASON_FOR_REFERRAL_SECTION_TEMPLATE_IDS,
  '10190-7': MENTAL_STATUS_SECTION_TEMPLATE_IDS,
  '11488-4': PATIENT_NOTES_SECTION_TEMPLATE_IDS,
  '85847-2': CARE_TEAM_SECTION_TEMPLATE_IDS,
  '48768-6': INSURANCE_SECTION_TEMPLATE_IDS,
};
