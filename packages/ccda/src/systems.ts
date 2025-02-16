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

// External Terminologies:
// https://terminology.hl7.org/external_terminologies.html

export const SYSTEM_MAPPER = new EnumMapper<string, string>('System', '', '', [
  {
    ccdaValue: '2.16.840.1.113883.2.20.5.1',
    fhirValue: 'https://fhir.infoway-inforoute.ca/CodeSystem/pCLOCD',
    displayName: 'pan-Canadian LOINC Observation Code Database (pCLOCD)',
  },
  {
    ccdaValue: '2.16.840.1.113883.3.26.1.1',
    fhirValue: 'http://ncithesaurus-stage.nci.nih.gov',
    displayName: 'NCI Thesaurus',
  },
  { ccdaValue: '2.16.840.1.113883.4.1', fhirValue: 'http://hl7.org/fhir/sid/us-ssn', displayName: 'SSN' },
  { ccdaValue: '2.16.840.1.113883.4.3', fhirValue: 'http://hl7.org/fhir/sid/us-dln', displayName: 'DLN' },
  { ccdaValue: '2.16.840.1.113883.4.6', fhirValue: 'http://hl7.org/fhir/sid/us-npi', displayName: 'NPI' },
  {
    ccdaValue: '2.16.840.1.113883.4.9',
    fhirValue: 'http://fdasis.nlm.nih.gov',
    displayName: 'Unique Ingredient Identifier (UNII)',
  },
  { ccdaValue: '2.16.840.1.113883.6.1', fhirValue: 'http://loinc.org', displayName: 'LOINC' },
  {
    ccdaValue: '2.16.840.1.113883.6.12',
    fhirValue: 'http://www.ama-assn.org/go/cpt',
    displayName: 'Current Procedural Terminology (CPT)',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.24',
    fhirValue: 'urn:iso:std:iso:11073:10101',
    displayName: 'Medical Device Communications (MDC)',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.69',
    fhirValue: 'http://hl7.org/fhir/sid/ndc',
    displayName: 'National Drug Code (NDC)',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.88',
    fhirValue: 'http://www.nlm.nih.gov/research/umls/rxnorm',
    displayName: 'RxNorm',
  },
  { ccdaValue: '2.16.840.1.113883.6.96', fhirValue: 'http://snomed.info/sct', displayName: 'SNOMED CT' },
  {
    ccdaValue: '2.16.840.1.113883.6.101',
    fhirValue: 'http://nucc.org/provider-taxonomy',
    displayName: 'NUCC Health Care Provider Taxonomy',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.345',
    fhirValue: 'http://va.gov/terminology/medrt',
    displayName: 'Medication Reference Terminology (MED-RT)',
  },
  {
    ccdaValue: '2.16.840.1.113883.6.209',
    fhirValue: 'http://hl7.org/fhir/ndfrt',
    displayName: 'National Drug File Reference Terminology (NDF-RT)',
  },
  { ccdaValue: '2.16.840.1.113883.12.292', fhirValue: 'http://nucc.org/cvx', displayName: 'CVX' },

  // Alternate FHIR System:
  {
    ccdaValue: '2.16.840.1.113883.12.292',
    fhirValue: 'http://hl7.org/fhir/sid/cvx',
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
  'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
  [
    { ccdaValue: 'U', fhirValue: 'U', displayName: 'unrestricted' },
    { ccdaValue: 'L', fhirValue: 'L', displayName: 'low' },
    { ccdaValue: 'M', fhirValue: 'M', displayName: 'moderate' },
    { ccdaValue: 'N', fhirValue: 'N', displayName: 'normal' },
    { ccdaValue: 'R', fhirValue: 'R', displayName: 'restricted' },
    { ccdaValue: 'V', fhirValue: 'V', displayName: 'very restricted' },
  ]
);

export const HUMAN_NAME_USE_MAPPER = new EnumMapper('HumanNameUse', '', 'http://hl7.org/fhir/ValueSet/name-use', [
  { ccdaValue: 'C', fhirValue: 'usual', displayName: 'Common/Called by' },
  { ccdaValue: 'L', fhirValue: 'official', displayName: 'Legal' },
  { ccdaValue: 'TEMP', fhirValue: 'temp', displayName: 'Temporary' },
  { ccdaValue: 'N', fhirValue: 'nickname', displayName: 'Nickname' },
  { ccdaValue: 'ANON', fhirValue: 'anonymous', displayName: 'Anonymous' },
  { ccdaValue: 'M', fhirValue: 'maiden', displayName: 'Maiden' },
  { ccdaValue: 'M', fhirValue: 'old', displayName: 'Old' },
]);

export const GENDER_MAPPER = new EnumMapper('Gender', '', 'http://hl7.org/fhir/ValueSet/administrative-gender', [
  { ccdaValue: 'F', fhirValue: 'female', displayName: 'Female' },
  { ccdaValue: 'M', fhirValue: 'male', displayName: 'Male' },
  { ccdaValue: 'UN', fhirValue: 'unknown', displayName: 'Unknown' },
]);

export const ADDRESS_USE_MAPPER = new EnumMapper('AddressUse', '', 'http://hl7.org/fhir/ValueSet/address-use', [
  { ccdaValue: 'HP', fhirValue: 'home', displayName: 'Home' },
  { ccdaValue: 'WP', fhirValue: 'work', displayName: 'Work' },
]);

export const TELECOM_USE_MAPPER = new EnumMapper('TelecomUse', '', 'http://hl7.org/fhir/ValueSet/contactentity-use', [
  { ccdaValue: 'WP', fhirValue: 'work', displayName: 'Work' },
  { ccdaValue: 'HP', fhirValue: 'home', displayName: 'Home' },
]);

export const MEDICATION_STATUS_MAPPER = new EnumMapper<
  Required<MedicationRequest['status']>,
  'active' | 'completed' | 'aborted' | 'cancelled'
>('MedicationStatus', '', 'http://hl7.org/fhir/ValueSet/medicationrequest-status', [
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
  'http://terminology.hl7.org/CodeSystem/observation-category',
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
