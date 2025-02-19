import { CPT, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, LOINC, NDC, RXNORM, SNOMED } from '@medplum/core';
import { CodeableConcept, MedicationRequest } from '@medplum/fhirtypes';
import {
  OID_ASSESSMENT_SCALE_OBSERVATION,
  OID_ASSESSMENT_SCALE_SUPPORTING_OBSERVATION,
  OID_AVERAGE_BLOOD_PRESSURE_ORGANIZER,
  OID_BASIC_INDUSTRY_OBSERVATION,
  OID_BASIC_OCCUPATION_OBSERVATION,
  OID_BIRTH_SEX,
  OID_COGNITIVE_STATUS_RESULT_OBSERVATION,
  OID_COGNITIVE_STATUS_RESULT_ORGANIZER,
  OID_CONFIDENTIALITY_VALUE_SET,
  OID_CPT_CODE_SYSTEM,
  OID_CURRENT_SMOKING_STATUS_OBSERVATION,
  OID_CVX_CODE_SYSTEM,
  OID_DIET_STATEMENT_NUTRITION,
  OID_FUNCTIONAL_STATUS_RESULT_OBSERVATION,
  OID_FUNCTIONAL_STATUS_RESULT_ORGANIZER,
  OID_LABORATORY_BATTERY_ID,
  OID_LABORATORY_OBSERVATION_ID,
  OID_LABORATORY_RESULT_ORGANIZER_ID,
  OID_LOINC_CODE_SYSTEM,
  OID_MDC_CODE_SYSTEM,
  OID_MEDICATION_ADHERENCE,
  OID_MONITORING_EVALUATION_AND_OUTCOME_NUTRITION,
  OID_NCI_THESAURUS_CODE_SYSTEM,
  OID_NDC_CODE_SYSTEM,
  OID_NDF_RT_CODE_SYSTEM,
  OID_NUCC_TAXONOMY_CODE_SYSTEM,
  OID_NUTRITION_RECOMMENDATION_V2,
  OID_PAN_CANADIAN_LOINC_OBSERVATION_CODE_SYSTEM,
  OID_PREGNANCY_OBSERVATION,
  OID_PRESSURE_ULCER_OBSERVATION,
  OID_PROBLEM_OBSERVATION,
  OID_PROBLEM_OBSSERVATION_V2,
  OID_PROCEDURE_ACTIVITY_OBSERVATION,
  OID_PROCEDURES_SECTION_ENTRIES_REQUIRED,
  OID_RESULT_OBSERVATION,
  OID_RESULT_OBSERVATION_V2,
  OID_RESULT_ORGANIZER,
  OID_RESULT_ORGANIZER_V2,
  OID_RXNORM_CODE_SYSTEM,
  OID_SECTION_TIME_RANGE,
  OID_SEX_OBSERVATION,
  OID_SEXUAL_ORIENTATION_OBSERVATION,
  OID_SMOKING_STATUS_OBSERVATION,
  OID_SNOMED_CT_CODE_SYSTEM,
  OID_SOCIAL_HISTORY_OBSERVATION,
  OID_SOCIAL_HISTORY_OBSERVATION_V2,
  OID_TOBACCO_USE_OBSERVATION,
  OID_TRIBAL_AFFILIATION_OBSERVATION,
  OID_UNII_CODE_SYSTEM,
  OID_US_DLN_CODE_SYSTEM,
  OID_US_NPI_CODE_SYSTEM,
  OID_US_SSN_CODE_SYSTEM,
  OID_VA_MED_RT_CODE_SYSTEM,
  OID_VITAL_SIGNS_OBSERVATION,
  OID_VITAL_SIGNS_OBSERVATION_V2,
  OID_VITAL_SIGNS_ORGANIZER,
  OID_VITAL_SIGNS_ORGANIZER_V2,
  OID_WOUND_MEASURMENTS_OBSERVATION,
  OID_WOUND_OBSERVATION,
} from './oids';
import { CcdaCode, CcdaValue } from './types';

export interface EnumEntry<TFhirValue extends string = string, TCcdaValue extends string = string> {
  fhirValue: TFhirValue;
  ccdaValue: TCcdaValue;
  displayName: string;
}

export class EnumMapper<TFhirValue extends string, TCcdaValue extends string> {
  readonly systemName: string;
  readonly ccdaSystemOid: string;
  readonly fhirSystemUrl: string;
  readonly entries: EnumEntry<TFhirValue, TCcdaValue>[];
  readonly ccdaToFhirMap: Record<TCcdaValue, EnumEntry<TFhirValue, TCcdaValue>>;
  readonly fhirToCcdaMap: Record<TFhirValue, EnumEntry<TFhirValue, TCcdaValue>>;

  constructor(
    systemName: string,
    ccdaSystemOid: string,
    fhirSystemUrl: string,
    entries: EnumEntry<TFhirValue, TCcdaValue>[]
  ) {
    this.systemName = systemName;
    this.ccdaSystemOid = ccdaSystemOid;
    this.fhirSystemUrl = fhirSystemUrl;
    this.entries = entries;
    this.ccdaToFhirMap = {} as Record<TCcdaValue, EnumEntry<TFhirValue, TCcdaValue>>;
    this.fhirToCcdaMap = {} as Record<TFhirValue, EnumEntry<TFhirValue, TCcdaValue>>;

    for (const entry of entries) {
      if (!this.ccdaToFhirMap[entry.ccdaValue]) {
        this.ccdaToFhirMap[entry.ccdaValue] = entry;
      }
      if (!this.fhirToCcdaMap[entry.fhirValue]) {
        this.fhirToCcdaMap[entry.fhirValue] = entry;
      }
    }
  }

  getEntryByFhir(fhir: TFhirValue): EnumEntry<TFhirValue, TCcdaValue> | undefined {
    return this.fhirToCcdaMap[fhir];
  }

  mapCcdaToFhir(ccda: TCcdaValue): TFhirValue | undefined {
    return this.ccdaToFhirMap[ccda]?.fhirValue;
  }

  mapCcdaToFhirWithDefault(ccda: TCcdaValue | undefined, defaultValue: TFhirValue): TFhirValue {
    if (!ccda) {
      return defaultValue;
    }
    return this.mapCcdaToFhir(ccda) ?? defaultValue;
  }

  mapFhirToCcdaWithDefault(fhir: TFhirValue | undefined, defaultValue: TCcdaValue): TCcdaValue {
    if (!fhir) {
      return defaultValue;
    }
    return this.mapFhirToCcda(fhir) ?? defaultValue;
  }

  mapCcdaToFhirCodeableConcept(ccda: TCcdaValue): CodeableConcept | undefined {
    const entry = this.ccdaToFhirMap[ccda];
    if (!entry) {
      return undefined;
    }
    return {
      coding: [{ system: this.fhirSystemUrl, code: entry.fhirValue, display: entry.displayName }],
      text: entry.displayName,
    };
  }

  mapFhirToCcda(fhir: TFhirValue | undefined): TCcdaValue | undefined {
    if (!fhir) {
      return undefined;
    }
    return this.fhirToCcdaMap[fhir]?.ccdaValue;
  }

  mapFhirToCcdaCode(fhir: TFhirValue | undefined): CcdaCode | undefined {
    if (!fhir) {
      return undefined;
    }
    const entry = this.fhirToCcdaMap[fhir];
    if (!entry) {
      return undefined;
    }
    return {
      '@_code': entry.ccdaValue,
      '@_displayName': entry.displayName,
      '@_codeSystem': this.ccdaSystemOid,
      '@_codeSystemName': this.systemName,
    };
  }
}

/**
 * Every non-HTTPS URL will be flagged by our security tools as a potential vulnerability.
 * We therefore use one constant to minimize the number of false positives.
 * All of these URLs are used as identifiers, not as web links.
 */
export const HTTP = 'http:';

/*
 * FHIR Code Systems
 */

export const CLINICAL_CONDITION_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/condition-clinical`;
export const CONDITION_VERIFICATION_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/condition-verification`;
export const LANGUAGE_MODE_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/v3-LanguageAbilityMode`;
export const LANGUAGE_PROFICIENCY_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/v3-LanguageAbilityProficiency`;
export const RACE_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/v3-Race`;
export const CONDITION_CATEGORY_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/condition-category`;
export const CONDITION_VER_STATUS_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/condition-ver-status`;
export const ALLERGY_CLINICAL_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/allergyintolerance-clinical`;
export const ALLERGY_VERIFICATION_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/allergyintolerance-verification`;
export const ACT_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/v3-ActCode`;
export const PARTICIPATION_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/v3-ParticipationType`;
export const DIAGNOSIS_ROLE_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/diagnosis-role`;
export const CONFIDENTIALITY_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/v3-Confidentiality`;
export const OBSERVATION_CATEGORY_CODE_SYSTEM = `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/observation-category`;

/*
 * FHIR Value Sets
 */

export const ADDRESS_USE_VALUE_SET = `${HTTP_HL7_ORG}/fhir/ValueSet/address-use`;
export const NAME_USE_VALUE_SET = `${HTTP_HL7_ORG}/fhir/ValueSet/name-use`;
export const ADMINISTRATIVE_GENDER_VALUE_SET = `${HTTP_HL7_ORG}/fhir/ValueSet/administrative-gender`;
export const CONTACT_ENTITY_USE_VALUE_SET = `${HTTP_HL7_ORG}/fhir/ValueSet/contactentity-use`;
export const MEDICATION_REQUEST_STATUS_VALUE_SET = `${HTTP_HL7_ORG}/fhir/ValueSet/medicationrequest-status`;

/*
 * FHIR standard extensions
 */

export const LANGUAGE_MODE_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/language-mode`;
export const LANGUAGE_PROFICIENCY_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/language-proficiency`;

/*
 * US-Core
 */

export const US_CORE_PATIENT_URL = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`;
export const US_CORE_RACE_URL = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-race`;
export const US_CORE_ETHNICITY_URL = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-ethnicity`;
export const US_CORE_CONDITION_URL = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-condition`;
export const US_CORE_MEDICATION_REQUEST_URL = `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-medicationrequest`;

/*
 * External Terminologies:
 * https://terminology.hl7.org/external_terminologies.html
 */

export const CCDA_TEMPLATE_CODE_SYSTEM = `${HTTP_HL7_ORG}/cda/template`;
export const NCI_THESAURUS_URL = `${HTTP}//ncithesaurus-stage.nci.nih.gov`;
export const US_SSN_URL = `${HTTP_HL7_ORG}/fhir/sid/us-ssn`;
export const US_DRIVER_LICENSE_URL = `${HTTP_HL7_ORG}/fhir/sid/us-dln`;
export const US_NPI_URL = `${HTTP_HL7_ORG}/fhir/sid/us-npi`;
export const UNII_URL = `${HTTP}//fdasis.nlm.nih.gov`;
export const NUCC_TAXONOMY_URL = `${HTTP}//nucc.org/provider-taxonomy`;
export const VA_MEDRT_URL = `${HTTP}//va.gov/terminology/medrt`;
export const NDFRT_URL = `${HTTP}//hl7.org/fhir/ndfrt`;
export const CVX_URL = `${HTTP}//nucc.org/cvx`;
export const FHIR_CVX_URL = `${HTTP_HL7_ORG}/fhir/sid/cvx`;
export const XSI_URL = `${HTTP}//www.w3.org/2001/XMLSchema-instance`;
export const CCDA_NARRATIVE_REFERENCE_URL = 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference';

export const SYSTEM_MAPPER = new EnumMapper<string, string>('System', '', '', [
  {
    ccdaValue: OID_PAN_CANADIAN_LOINC_OBSERVATION_CODE_SYSTEM,
    fhirValue: 'https://fhir.infoway-inforoute.ca/CodeSystem/pCLOCD',
    displayName: 'pan-Canadian LOINC Observation Code Database (pCLOCD)',
  },
  {
    ccdaValue: OID_NCI_THESAURUS_CODE_SYSTEM,
    fhirValue: NCI_THESAURUS_URL,
    displayName: 'NCI Thesaurus',
  },
  { ccdaValue: OID_US_SSN_CODE_SYSTEM, fhirValue: US_SSN_URL, displayName: 'SSN' },
  { ccdaValue: OID_US_DLN_CODE_SYSTEM, fhirValue: US_DRIVER_LICENSE_URL, displayName: 'DLN' },
  { ccdaValue: OID_US_NPI_CODE_SYSTEM, fhirValue: US_NPI_URL, displayName: 'NPI' },
  {
    ccdaValue: OID_UNII_CODE_SYSTEM,
    fhirValue: UNII_URL,
    displayName: 'Unique Ingredient Identifier (UNII)',
  },
  { ccdaValue: OID_LOINC_CODE_SYSTEM, fhirValue: LOINC, displayName: 'LOINC' },
  {
    ccdaValue: OID_CPT_CODE_SYSTEM,
    fhirValue: CPT,
    displayName: 'Current Procedural Terminology (CPT)',
  },
  {
    ccdaValue: OID_MDC_CODE_SYSTEM,
    fhirValue: 'urn:iso:std:iso:11073:10101',
    displayName: 'Medical Device Communications (MDC)',
  },
  {
    ccdaValue: OID_NDC_CODE_SYSTEM,
    fhirValue: NDC,
    displayName: 'National Drug Code (NDC)',
  },
  {
    ccdaValue: OID_RXNORM_CODE_SYSTEM,
    fhirValue: RXNORM,
    displayName: 'RxNorm',
  },
  { ccdaValue: OID_SNOMED_CT_CODE_SYSTEM, fhirValue: SNOMED, displayName: 'SNOMED CT' },
  {
    ccdaValue: OID_NUCC_TAXONOMY_CODE_SYSTEM,
    fhirValue: NUCC_TAXONOMY_URL,
    displayName: 'NUCC Health Care Provider Taxonomy',
  },
  {
    ccdaValue: OID_VA_MED_RT_CODE_SYSTEM,
    fhirValue: VA_MEDRT_URL,
    displayName: 'Medication Reference Terminology (MED-RT)',
  },
  {
    ccdaValue: OID_NDF_RT_CODE_SYSTEM,
    fhirValue: NDFRT_URL,
    displayName: 'National Drug File Reference Terminology (NDF-RT)',
  },
  { ccdaValue: OID_CVX_CODE_SYSTEM, fhirValue: CVX_URL, displayName: 'CVX' },

  // Alternate FHIR System:
  {
    ccdaValue: OID_CVX_CODE_SYSTEM,
    fhirValue: FHIR_CVX_URL,
    displayName: 'Vaccine Administered Code Set (CVX)',
  },
]);

/**
 * Map the C-CDA system to the FHIR system.
 * @param ccda - The C-CDA system to map.
 * @returns The FHIR system.
 */
export function mapCcdaSystemToFhir(ccda: string | undefined): string | undefined {
  if (!ccda) {
    return undefined;
  }
  return SYSTEM_MAPPER.mapCcdaToFhir(ccda) ?? `urn:oid:${ccda}`;
}

/**
 * Map the FHIR system to the C-CDA system.
 * @param system - The system to map.
 * @returns The C-CDA system.
 */
export function mapFhirSystemToCcda(system: string | undefined): string | undefined {
  if (!system) {
    return undefined;
  }
  if (system.startsWith('urn:oid:')) {
    return system.replace('urn:oid:', '');
  }
  return SYSTEM_MAPPER.mapFhirToCcda(system);
}

/**
 * Map the codeable concept to the C-CDA code.
 * @param codeableConcept - The codeable concept to map.
 * @returns The C-CDA code.
 */
export function mapCodeableConceptToCcdaCode(codeableConcept: CodeableConcept | undefined): CcdaCode | undefined {
  if (!codeableConcept) {
    return undefined;
  }

  const systemEntry = codeableConcept.coding?.[0]?.system
    ? SYSTEM_MAPPER.getEntryByFhir(codeableConcept.coding[0].system)
    : undefined;
  const system = systemEntry?.ccdaValue;
  const systemName = systemEntry?.displayName;

  return {
    '@_code': codeableConcept?.coding?.[0]?.code,
    '@_displayName': codeableConcept?.coding?.[0]?.display,
    '@_codeSystem': system,
    '@_codeSystemName': systemName,
  };
}

/**
 * Map the codeable concept to the C-CDA value.
 * @param codeableConcept - The codeable concept to map.
 * @returns The C-CDA value.
 */
export function mapCodeableConceptToCcdaValue(codeableConcept: CodeableConcept | undefined): CcdaValue | undefined {
  const code = mapCodeableConceptToCcdaCode(codeableConcept);
  if (!code) {
    return undefined;
  }
  return {
    '@_xsi:type': 'CD',
    ...code,
  };
}

export const CONFIDENTIALITY_MAPPER = new EnumMapper(
  'Confidentiality',
  OID_CONFIDENTIALITY_VALUE_SET,
  CONFIDENTIALITY_CODE_SYSTEM,
  [
    { ccdaValue: 'U', fhirValue: 'U', displayName: 'unrestricted' },
    { ccdaValue: 'L', fhirValue: 'L', displayName: 'low' },
    { ccdaValue: 'M', fhirValue: 'M', displayName: 'moderate' },
    { ccdaValue: 'N', fhirValue: 'N', displayName: 'normal' },
    { ccdaValue: 'R', fhirValue: 'R', displayName: 'restricted' },
    { ccdaValue: 'V', fhirValue: 'V', displayName: 'very restricted' },
  ]
);

export const HUMAN_NAME_USE_MAPPER = new EnumMapper('HumanNameUse', '', NAME_USE_VALUE_SET, [
  { ccdaValue: 'C', fhirValue: 'usual', displayName: 'Common/Called by' },
  { ccdaValue: 'L', fhirValue: 'official', displayName: 'Legal' },
  { ccdaValue: 'TEMP', fhirValue: 'temp', displayName: 'Temporary' },
  { ccdaValue: 'N', fhirValue: 'nickname', displayName: 'Nickname' },
  { ccdaValue: 'ANON', fhirValue: 'anonymous', displayName: 'Anonymous' },
  { ccdaValue: 'M', fhirValue: 'maiden', displayName: 'Maiden' },
  { ccdaValue: 'M', fhirValue: 'old', displayName: 'Old' },
]);

export const GENDER_MAPPER = new EnumMapper('Gender', '', ADMINISTRATIVE_GENDER_VALUE_SET, [
  { ccdaValue: 'F', fhirValue: 'female', displayName: 'Female' },
  { ccdaValue: 'M', fhirValue: 'male', displayName: 'Male' },
  { ccdaValue: 'UN', fhirValue: 'unknown', displayName: 'Unknown' },
  { ccdaValue: 'UN', fhirValue: 'other', displayName: 'Other' },
]);

export const ADDRESS_USE_MAPPER = new EnumMapper('AddressUse', '', ADDRESS_USE_VALUE_SET, [
  { ccdaValue: 'HP', fhirValue: 'home', displayName: 'Home' },
  { ccdaValue: 'WP', fhirValue: 'work', displayName: 'Work' },
]);

export const TELECOM_USE_MAPPER = new EnumMapper('TelecomUse', '', CONTACT_ENTITY_USE_VALUE_SET, [
  { ccdaValue: 'WP', fhirValue: 'work', displayName: 'Work' },
  { ccdaValue: 'HP', fhirValue: 'home', displayName: 'Home' },
]);

export const ALLERGY_STATUS_MAPPER = new EnumMapper<string, string>(
  'AllergyStatus',
  '',
  ALLERGY_VERIFICATION_CODE_SYSTEM,
  [
    { ccdaValue: 'unconfirmed', fhirValue: 'unconfirmed', displayName: 'Unconfirmed' },
    { ccdaValue: 'provisional', fhirValue: 'provisional', displayName: 'Provisional' },
    { ccdaValue: 'differential', fhirValue: 'differential', displayName: 'Differential' },
    { ccdaValue: 'confirmed', fhirValue: 'confirmed', displayName: 'Confirmed' },
    { ccdaValue: 'refuted', fhirValue: 'refuted', displayName: 'Refuted' },
    { ccdaValue: 'entered-in-error', fhirValue: 'entered-in-error', displayName: 'Entered in Error' },
    { ccdaValue: 'unknown', fhirValue: 'unknown', displayName: 'Unknown' },
  ]
);

export const ALLERGY_SEVERITY_MAPPER = new EnumMapper<'mild' | 'moderate' | 'severe', string>(
  'AllergySeverity',
  SNOMED,
  ALLERGY_CLINICAL_CODE_SYSTEM,
  [
    { ccdaValue: '255604002', fhirValue: 'mild', displayName: 'Mild' },
    { ccdaValue: '6736007', fhirValue: 'moderate', displayName: 'Moderate' },
    { ccdaValue: '24484000', fhirValue: 'severe', displayName: 'Severe' },
  ]
);

export const PROBLEM_STATUS_MAPPER = new EnumMapper<string, string>(
  'ProblemStatus',
  '',
  CONDITION_VER_STATUS_CODE_SYSTEM,
  [
    { ccdaValue: 'active', fhirValue: 'active', displayName: 'Active' },
    { ccdaValue: 'inactive', fhirValue: 'inactive', displayName: 'Inactive' },
    { ccdaValue: 'resolved', fhirValue: 'inactive', displayName: 'Resolved' },
    { ccdaValue: 'remission', fhirValue: 'inactive', displayName: 'In Remission' },
    { ccdaValue: 'relapse', fhirValue: 'active', displayName: 'Relapse' },
    { ccdaValue: 'resolved relapse', fhirValue: 'inactive', displayName: 'Resolved Relapse' },
    { ccdaValue: 'aborted', fhirValue: 'aborted', displayName: 'Aborted' },
  ]
);

export const ENCOUNTER_STATUS_MAPPER = new EnumMapper('EncounterStatus', '', '', [
  { ccdaValue: 'active', fhirValue: 'in-progress', displayName: 'In Progress' },
  { ccdaValue: 'completed', fhirValue: 'finished', displayName: 'Finished' },
  { ccdaValue: 'aborted', fhirValue: 'cancelled', displayName: 'Cancelled' },
  { ccdaValue: 'cancelled', fhirValue: 'cancelled', displayName: 'Cancelled' },
  { ccdaValue: 'unknown', fhirValue: 'unknown', displayName: 'Unknown' },
]);

export const PROCEDURE_STATUS_MAPPER = new EnumMapper('ProcedureStatus', '', '', [
  { ccdaValue: 'completed', fhirValue: 'completed', displayName: 'Completed' },
  { ccdaValue: 'aborted', fhirValue: 'stopped', displayName: 'Stopped' },
  { ccdaValue: 'cancelled', fhirValue: 'not-done', displayName: 'Not Done' },
  { ccdaValue: 'new', fhirValue: 'not-done', displayName: 'Draft' },
  { ccdaValue: 'unknown', fhirValue: 'unknown', displayName: 'Unknown' },
]);

export const MEDICATION_STATUS_MAPPER = new EnumMapper<
  Required<MedicationRequest['status']>,
  'active' | 'completed' | 'aborted' | 'cancelled'
>('MedicationStatus', '', MEDICATION_REQUEST_STATUS_VALUE_SET, [
  { ccdaValue: 'active', fhirValue: 'active', displayName: 'Active' },
  { ccdaValue: 'completed', fhirValue: 'completed', displayName: 'Completed' },
  { ccdaValue: 'aborted', fhirValue: 'stopped', displayName: 'Stopped' },
  { ccdaValue: 'cancelled', fhirValue: 'cancelled', displayName: 'Cancelled' },
  { ccdaValue: 'aborted', fhirValue: 'entered-in-error', displayName: 'Entered in Error' },
  { ccdaValue: 'active', fhirValue: 'draft', displayName: 'Draft' },
  { ccdaValue: 'cancelled', fhirValue: 'unknown', displayName: 'Unknown' },
]);

export const OBSERVATION_CATEGORY_MAPPER = new EnumMapper<string, string>(
  'ObservationCategory',
  '',
  OBSERVATION_CATEGORY_CODE_SYSTEM,
  [
    // ## social-history
    // FHIR Definition: Social History Observations define the patient's occupational, personal (e.g., lifestyle), social, familial, and environmental history and health risk factors that may impact the patient's health.
    // Mapped C-CDA Templates:
    { ccdaValue: OID_SOCIAL_HISTORY_OBSERVATION, fhirValue: 'social-history', displayName: 'Social History' },
    { ccdaValue: OID_SOCIAL_HISTORY_OBSERVATION_V2, fhirValue: 'social-history', displayName: 'Social History V2' },
    { ccdaValue: OID_SMOKING_STATUS_OBSERVATION, fhirValue: 'social-history', displayName: 'Smoking Status' },
    {
      ccdaValue: OID_CURRENT_SMOKING_STATUS_OBSERVATION,
      fhirValue: 'social-history',
      displayName: 'Current Smoking Status',
    },
    { ccdaValue: OID_TOBACCO_USE_OBSERVATION, fhirValue: 'social-history', displayName: 'Tobacco Use' },
    { ccdaValue: OID_BASIC_OCCUPATION_OBSERVATION, fhirValue: 'social-history', displayName: 'Basic Occupation' },
    { ccdaValue: OID_BASIC_INDUSTRY_OBSERVATION, fhirValue: 'social-history', displayName: 'Basic Industry' },
    { ccdaValue: OID_SEXUAL_ORIENTATION_OBSERVATION, fhirValue: 'social-history', displayName: 'Sexual Orientation' },
    { ccdaValue: OID_SEX_OBSERVATION, fhirValue: 'social-history', displayName: 'Sex Observation' },
    { ccdaValue: OID_BIRTH_SEX, fhirValue: 'social-history', displayName: 'Gender Identity' },
    { ccdaValue: OID_SECTION_TIME_RANGE, fhirValue: 'social-history', displayName: 'Gender Identity V2' },
    { ccdaValue: OID_PREGNANCY_OBSERVATION, fhirValue: 'social-history', displayName: 'Pregnancy Status' },
    { ccdaValue: OID_TRIBAL_AFFILIATION_OBSERVATION, fhirValue: 'social-history', displayName: 'Tribal Affiliation' },

    // ## vital-signs
    // FHIR Definition: Clinical observations measure the body's basic functions such as blood pressure, heart rate, respiratory rate, height, weight, body mass index, head circumference, pulse oximetry, temperature, and body surface area.
    // Mapped C-CDA Templates:
    { ccdaValue: OID_VITAL_SIGNS_ORGANIZER, fhirValue: 'vital-signs', displayName: 'Vital Signs Organizer' },
    {
      ccdaValue: OID_VITAL_SIGNS_ORGANIZER_V2,
      fhirValue: 'vital-signs',
      displayName: 'Vital Signs Organizer V2',
    },
    { ccdaValue: OID_VITAL_SIGNS_OBSERVATION, fhirValue: 'vital-signs', displayName: 'Vital Signs Observation' },
    {
      ccdaValue: OID_VITAL_SIGNS_OBSERVATION_V2,
      fhirValue: 'vital-signs',
      displayName: 'Vital Signs Observation V2',
    },
    {
      ccdaValue: OID_AVERAGE_BLOOD_PRESSURE_ORGANIZER,
      fhirValue: 'vital-signs',
      displayName: 'Average Blood Pressure Organizer',
    },

    // ## laboratory
    // FHIR Definition: The results of observations generated by laboratories. Laboratory results are typically generated by laboratories providing analytic services in areas such as chemistry, hematology, serology, histology, cytology, anatomic pathology (including digital pathology), microbiology, and/or virology.
    // Mapped C-CDA Templates:
    { ccdaValue: OID_RESULT_ORGANIZER, fhirValue: 'laboratory', displayName: 'Result Organizer' },
    { ccdaValue: OID_RESULT_ORGANIZER_V2, fhirValue: 'laboratory', displayName: 'Result Organizer V2' },
    { ccdaValue: OID_RESULT_OBSERVATION, fhirValue: 'laboratory', displayName: 'Result Observation' },
    { ccdaValue: OID_RESULT_OBSERVATION_V2, fhirValue: 'laboratory', displayName: 'Result Observation V2' },
    { ccdaValue: OID_LABORATORY_BATTERY_ID, fhirValue: 'laboratory', displayName: 'Laboratory Battery (ID)' },
    {
      ccdaValue: OID_LABORATORY_OBSERVATION_ID,
      fhirValue: 'laboratory',
      displayName: 'Laboratory Observation (ID)',
    },
    {
      ccdaValue: OID_LABORATORY_RESULT_ORGANIZER_ID,
      fhirValue: 'laboratory',
      displayName: 'Laboratory Result Organizer (ID)',
    },

    // ## survey
    // FHIR Definition: Assessment tool/survey instrument observations (e.g., Apgar Scores, Montreal Cognitive Assessment (MoCA)).
    // Mapped C-CDA Templates:
    { ccdaValue: OID_ASSESSMENT_SCALE_OBSERVATION, fhirValue: 'survey', displayName: 'Assessment Scale Observation' },
    {
      ccdaValue: OID_ASSESSMENT_SCALE_SUPPORTING_OBSERVATION,
      fhirValue: 'survey',
      displayName: 'Assessment Scale Supporting Observation',
    },
    {
      ccdaValue: OID_COGNITIVE_STATUS_RESULT_OBSERVATION,
      fhirValue: 'survey',
      displayName: 'Cognitive Status Result Observation',
    },
    {
      ccdaValue: OID_COGNITIVE_STATUS_RESULT_ORGANIZER,
      fhirValue: 'survey',
      displayName: 'Cognitive Status Result Organizer',
    },
    {
      ccdaValue: OID_FUNCTIONAL_STATUS_RESULT_OBSERVATION,
      fhirValue: 'survey',
      displayName: 'Functional Status Result Observation',
    },
    {
      ccdaValue: OID_FUNCTIONAL_STATUS_RESULT_ORGANIZER,
      fhirValue: 'survey',
      displayName: 'Functional Status Result Organizer',
    },

    // ## exam
    // FHIR Definition: Observations generated by physical exam findings including direct observations made by a clinician and use of simple instruments and the result of simple maneuvers performed directly on the patient's body.
    // Mapped C-CDA Templates:
    { ccdaValue: OID_PROBLEM_OBSERVATION, fhirValue: 'exam', displayName: 'Problem Observation' },
    { ccdaValue: OID_PROBLEM_OBSSERVATION_V2, fhirValue: 'exam', displayName: 'Problem Observation V2' },
    { ccdaValue: OID_PRESSURE_ULCER_OBSERVATION, fhirValue: 'exam', displayName: 'Pressure Ulcer Observation' },
    { ccdaValue: OID_WOUND_OBSERVATION, fhirValue: 'exam', displayName: 'Wound Observation' },
    { ccdaValue: OID_WOUND_MEASURMENTS_OBSERVATION, fhirValue: 'exam', displayName: 'Wound Measurements Observation' },
    { ccdaValue: OID_PROCEDURES_SECTION_ENTRIES_REQUIRED, fhirValue: 'exam', displayName: 'Procedure Section' },
    { ccdaValue: OID_PROCEDURE_ACTIVITY_OBSERVATION, fhirValue: 'exam', displayName: 'Procedure Activity Observation' },

    // ## therapy
    // FHIR Definition: Observations generated by non-interventional treatment protocols (e.g. occupational, physical, radiation, nutritional and medication therapy)
    // Mapped C-CDA Templates:
    { ccdaValue: OID_MEDICATION_ADHERENCE, fhirValue: 'therapy', displayName: 'Medication Adherence' },
    { ccdaValue: OID_NUTRITION_RECOMMENDATION_V2, fhirValue: 'therapy', displayName: 'Nutrition Recommendations' },
    { ccdaValue: OID_DIET_STATEMENT_NUTRITION, fhirValue: 'therapy', displayName: 'Diet Statement (Nutrition)' },
    {
      ccdaValue: OID_MONITORING_EVALUATION_AND_OUTCOME_NUTRITION,
      fhirValue: 'therapy',
      displayName: 'Monitoring, Evaluation and Outcome (Nutrition)',
    },
  ]
);
