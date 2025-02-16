import { CPT, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, LOINC, NDC, RXNORM, SNOMED } from '@medplum/core';
import { CodeableConcept, MedicationRequest } from '@medplum/fhirtypes';
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
    return this.mapCcdaToFhir(ccda) || defaultValue;
  }

  mapFhirToCcdaWithDefault(fhir: TFhirValue | undefined, defaultValue: TCcdaValue): TCcdaValue {
    if (!fhir) {
      return defaultValue;
    }
    return this.mapFhirToCcda(fhir) || defaultValue;
  }

  mapCcdaToFhirCodeableConcept(ccda: TCcdaValue): CodeableConcept | undefined {
    const entry = this.ccdaToFhirMap[ccda];
    if (!entry) {
      return undefined;
    }
    return { coding: [{ system: this.fhirSystemUrl, code: entry.fhirValue, display: entry.displayName }] };
  }

  mapFhirToCcda(fhir: TFhirValue): TCcdaValue | undefined {
    return this.fhirToCcdaMap[fhir]?.ccdaValue;
  }

  mapFhirToCcdaCode(fhir: TFhirValue): CcdaCode | undefined {
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
    ccdaValue: '2.16.840.1.113883.2.20.5.1',
    fhirValue: 'https://fhir.infoway-inforoute.ca/CodeSystem/pCLOCD',
    displayName: 'pan-Canadian LOINC Observation Code Database (pCLOCD)',
  },
  {
    ccdaValue: '2.16.840.1.113883.3.26.1.1',
    fhirValue: NCI_THESAURUS_URL,
    displayName: 'NCI Thesaurus',
  },
  { ccdaValue: '2.16.840.1.113883.4.1', fhirValue: US_SSN_URL, displayName: 'SSN' },
  { ccdaValue: '2.16.840.1.113883.4.3', fhirValue: US_DRIVER_LICENSE_URL, displayName: 'DLN' },
  { ccdaValue: '2.16.840.1.113883.4.6', fhirValue: US_NPI_URL, displayName: 'NPI' },
  {
    ccdaValue: '2.16.840.1.113883.4.9',
    fhirValue: UNII_URL,
    displayName: 'Unique Ingredient Identifier (UNII)',
  },
  { ccdaValue: '2.16.840.1.113883.6.1', fhirValue: LOINC, displayName: 'LOINC' },
  {
    ccdaValue: '2.16.840.1.113883.6.12',
    fhirValue: CPT,
    displayName: 'Current Procedural Terminology (CPT)',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.24',
    fhirValue: 'urn:iso:std:iso:11073:10101',
    displayName: 'Medical Device Communications (MDC)',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.69',
    fhirValue: NDC,
    displayName: 'National Drug Code (NDC)',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.88',
    fhirValue: RXNORM,
    displayName: 'RxNorm',
  },
  { ccdaValue: '2.16.840.1.113883.6.96', fhirValue: SNOMED, displayName: 'SNOMED CT' },
  {
    ccdaValue: '2.16.840.1.113883.6.101',
    fhirValue: NUCC_TAXONOMY_URL,
    displayName: 'NUCC Health Care Provider Taxonomy',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.345',
    fhirValue: VA_MEDRT_URL,
    displayName: 'Medication Reference Terminology (MED-RT)',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.209',
    fhirValue: NDFRT_URL,
    displayName: 'National Drug File Reference Terminology (NDF-RT)',
  },
  { ccdaValue: '2.16.840.1.113883.12.292', fhirValue: CVX_URL, displayName: 'CVX' },

  // Alternate FHIR System:
  {
    ccdaValue: '2.16.840.1.113883.12.292',
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
  return SYSTEM_MAPPER.mapCcdaToFhir(ccda) || `urn:oid:${ccda}`;
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
  '2.16.840.1.113883.5.25',
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
]);

export const ADDRESS_USE_MAPPER = new EnumMapper('AddressUse', '', ADDRESS_USE_VALUE_SET, [
  { ccdaValue: 'HP', fhirValue: 'home', displayName: 'Home' },
  { ccdaValue: 'WP', fhirValue: 'work', displayName: 'Work' },
]);

export const TELECOM_USE_MAPPER = new EnumMapper('TelecomUse', '', CONTACT_ENTITY_USE_VALUE_SET, [
  { ccdaValue: 'WP', fhirValue: 'work', displayName: 'Work' },
  { ccdaValue: 'HP', fhirValue: 'home', displayName: 'Home' },
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
    // - Social History Observation (2.16.840.1.113883.10.20.22.4.38)
    // - Social History Observation V2 (2.16.840.1.113883.10.20.22.4.38.1)
    // - Smoking Status Observation (2.16.840.1.113883.10.20.22.4.78)
    // - Current Smoking Status Observation (2.16.840.1.113883.10.20.22.4.78.2)
    // - Tobacco Use Observation (2.16.840.1.113883.10.20.22.4.85)
    // - Basic Occupation Observation (2.16.840.1.113883.10.20.22.4.503)
    // - Basic Industry Observation (2.16.840.1.113883.10.20.22.4.504)
    // - Sexual Orientation Observation (2.16.840.1.113883.10.20.22.4.501)
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.38', fhirValue: 'social-history', displayName: 'Social History' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.38.1', fhirValue: 'social-history', displayName: 'Social History V2' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.78', fhirValue: 'social-history', displayName: 'Smoking Status' },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.78.2',
      fhirValue: 'social-history',
      displayName: 'Current Smoking Status',
    },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.85', fhirValue: 'social-history', displayName: 'Tobacco Use' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.503', fhirValue: 'social-history', displayName: 'Basic Occupation' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.504', fhirValue: 'social-history', displayName: 'Basic Industry' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.501', fhirValue: 'social-history', displayName: 'Sexual Orientation' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.507', fhirValue: 'social-history', displayName: 'Sex Observation' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.200', fhirValue: 'social-history', displayName: 'Gender Identity' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.201', fhirValue: 'social-history', displayName: 'Gender Identity V2' },
    { ccdaValue: '2.16.840.1.113883.10.20.15.3.8', fhirValue: 'social-history', displayName: 'Pregnancy Status' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.506', fhirValue: 'social-history', displayName: 'Tribal Affiliation' },

    // ## vital-signs
    // FHIR Definition: Clinical observations measure the body's basic functions such as blood pressure, heart rate, respiratory rate, height, weight, body mass index, head circumference, pulse oximetry, temperature, and body surface area.
    // Mapped C-CDA Templates:
    // - Vital Signs Organizer (2.16.840.1.113883.10.20.22.4.26)
    // - Vital Signs Organizer V2 (2.16.840.1.113883.10.20.22.4.26.2)
    // - Vital Signs Observation (2.16.840.1.113883.10.20.22.4.27)
    // - Vital Signs Observation V2 (2.16.840.1.113883.10.20.22.4.27.2)
    // - Average Blood Pressure Organizer (2.16.840.1.113883.10.20.22.4.512)
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.26', fhirValue: 'vital-signs', displayName: 'Vital Signs Organizer' },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.26.2',
      fhirValue: 'vital-signs',
      displayName: 'Vital Signs Organizer V2',
    },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.27', fhirValue: 'vital-signs', displayName: 'Vital Signs Observation' },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.27.2',
      fhirValue: 'vital-signs',
      displayName: 'Vital Signs Observation V2',
    },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.512',
      fhirValue: 'vital-signs',
      displayName: 'Average Blood Pressure Organizer',
    },

    // ## laboratory
    // FHIR Definition: The results of observations generated by laboratories. Laboratory results are typically generated by laboratories providing analytic services in areas such as chemistry, hematology, serology, histology, cytology, anatomic pathology (including digital pathology), microbiology, and/or virology.
    // Mapped C-CDA Templates:
    // - Result Organizer (2.16.840.1.113883.10.20.22.4.1)
    // - Result Organizer V2 (2.16.840.1.113883.10.20.22.4.1.2)
    // - Result Observation (2.16.840.1.113883.10.20.22.4.2)
    // - Result Observation V2 (2.16.840.1.113883.10.20.22.4.2.2)
    // - Laboratory Battery (ID) (2.16.840.1.113883.10.20.22.4.406)
    // - Laboratory Observation (ID) (2.16.840.1.113883.10.20.22.4.407)
    // - Laboratory Result Organizer (ID) (2.16.840.1.113883.10.20.22.4.416)
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.1', fhirValue: 'laboratory', displayName: 'Result Organizer' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.1.2', fhirValue: 'laboratory', displayName: 'Result Organizer V2' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.2', fhirValue: 'laboratory', displayName: 'Result Observation' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.2.2', fhirValue: 'laboratory', displayName: 'Result Observation V2' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.406', fhirValue: 'laboratory', displayName: 'Laboratory Battery (ID)' },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.407',
      fhirValue: 'laboratory',
      displayName: 'Laboratory Observation (ID)',
    },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.416',
      fhirValue: 'laboratory',
      displayName: 'Laboratory Result Organizer (ID)',
    },

    // ## survey
    // FHIR Definition: Assessment tool/survey instrument observations (e.g., Apgar Scores, Montreal Cognitive Assessment (MoCA)).
    // Mapped C-CDA Templates:
    // - Assessment Scale Observation (2.16.840.1.113883.10.20.22.4.69)
    // - Assessment Scale Supporting Observation (2.16.840.1.113883.10.20.22.4.86)
    // - Cognitive Status Result Observation (2.16.840.1.113883.10.20.22.4.74)
    // - Cognitive Status Result Organizer (2.16.840.1.113883.10.20.22.4.75)
    // - Functional Status Result Observation (2.16.840.1.113883.10.20.22.4.67)
    // - Functional Status Result Organizer (2.16.840.1.113883.10.20.22.4.66)
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.69', fhirValue: 'survey', displayName: 'Assessment Scale Observation' },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.86',
      fhirValue: 'survey',
      displayName: 'Assessment Scale Supporting Observation',
    },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.74',
      fhirValue: 'survey',
      displayName: 'Cognitive Status Result Observation',
    },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.75',
      fhirValue: 'survey',
      displayName: 'Cognitive Status Result Organizer',
    },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.67',
      fhirValue: 'survey',
      displayName: 'Functional Status Result Observation',
    },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.66',
      fhirValue: 'survey',
      displayName: 'Functional Status Result Organizer',
    },

    // ## exam
    // FHIR Definition: Observations generated by physical exam findings including direct observations made by a clinician and use of simple instruments and the result of simple maneuvers performed directly on the patient's body.
    // Mapped C-CDA Templates:
    // - Problem Observation (2.16.840.1.113883.10.20.22.4.4)
    // - Problem Observation V2 (2.16.840.1.113883.10.20.22.4.4.2)
    // - Pressure Ulcer Observation (2.16.840.1.113883.10.20.22.4.70)
    // - Wound Observation (2.16.840.1.113883.10.20.22.4.114)
    // - Wound Measurements Observation (2.16.840.1.113883.10.20.22.4.133)
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.4', fhirValue: 'exam', displayName: 'Problem Observation' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.4.2', fhirValue: 'exam', displayName: 'Problem Observation V2' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.70', fhirValue: 'exam', displayName: 'Pressure Ulcer Observation' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.114', fhirValue: 'exam', displayName: 'Wound Observation' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.133', fhirValue: 'exam', displayName: 'Wound Measurements Observation' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.2.7.1', fhirValue: 'exam', displayName: 'Procedure Section' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.13', fhirValue: 'exam', displayName: 'Procedure Activity Observation' },

    // ## therapy
    // FHIR Definition: Observations generated by non-interventional treatment protocols (e.g. occupational, physical, radiation, nutritional and medication therapy)
    // Mapped C-CDA Templates:
    // - Medication Adherence (2.16.840.1.113883.10.20.22.4.508)
    // - Nutrition Recommendations (2.16.840.1.113883.10.20.22.4.130)
    // - Diet Statement (Nutrition) (2.16.840.1.113883.10.20.22.4.244)
    // - Monitoring, Evaluation and Outcome (Nutrition) (2.16.840.1.113883.10.20.22.4.250)
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.508', fhirValue: 'therapy', displayName: 'Medication Adherence' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.130', fhirValue: 'therapy', displayName: 'Nutrition Recommendations' },
    { ccdaValue: '2.16.840.1.113883.10.20.22.4.244', fhirValue: 'therapy', displayName: 'Diet Statement (Nutrition)' },
    {
      ccdaValue: '2.16.840.1.113883.10.20.22.4.250',
      fhirValue: 'therapy',
      displayName: 'Monitoring, Evaluation and Outcome (Nutrition)',
    },
  ]
);
