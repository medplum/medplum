import {
  createReference,
  formatHl7DateTime,
  generateId,
  getExtensionValue,
  isUUID,
  LOINC,
  resolveId,
  UCUM,
} from '@medplum/core';
import {
  Address,
  AllergyIntolerance,
  AllergyIntoleranceReaction,
  Bundle,
  CarePlan,
  CareTeam,
  CareTeamParticipant,
  CodeableConcept,
  Coding,
  Composition,
  CompositionEvent,
  CompositionSection,
  Condition,
  ContactPoint,
  Coverage,
  DocumentReference,
  Encounter,
  EncounterDiagnosis,
  Extension,
  Goal,
  HumanName,
  Identifier,
  Immunization,
  ImmunizationPerformer,
  Medication,
  Observation,
  ObservationReferenceRange,
  Organization,
  Patient,
  Period,
  Practitioner,
  PractitionerQualification,
  PractitionerRole,
  Procedure,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { XMLBuilder } from 'fast-xml-parser';
import { mapCcdaToFhirDate, mapCcdaToFhirDateTime } from './datetime';
import {
  OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM,
  OID_ALLERGIES_SECTION_ENTRIES_OPTIONAL,
  OID_ALLERGIES_SECTION_ENTRIES_OPTIONAL_V2,
  OID_ALLERGIES_SECTION_ENTRIES_REQUIRED,
  OID_ALLERGIES_SECTION_ENTRIES_REQUIRED_V2,
  OID_CARE_TEAMS_SECTION,
  OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
  OID_CPT_CODE_SYSTEM,
  OID_DOCUMENT_ID_CODE_SYSTEM,
  OID_ENCOUNTER_ACTIVITIES,
  OID_GOAL_OBSERVATION,
  OID_GOALS_SECTION,
  OID_HEALTH_CONCERNS_SECTION,
  OID_IMMUNIZATIONS_SECTION_ENTRIES_OPTIONAL,
  OID_IMMUNIZATIONS_SECTION_ENTRIES_REQUIRED,
  OID_LANGUAGE_COMMUNICATION_TEMPLATE_HITSP,
  OID_LANGUAGE_COMMUNICATION_TEMPLATE_IHE,
  OID_LOINC_CODE_SYSTEM,
  OID_MEDICATION_FREE_TEXT_SIG,
  OID_MEDICATIONS_SECTION_ENTRIES_REQUIRED,
  OID_NOTES_SECTION,
  // Additional OIDs for QRDA generation
  OID_PARTICIPANT_DEVICE,
  OID_PAYERS_SECTION,
  OID_PLAN_OF_CARE_SECTION,
  OID_PROBLEMS_SECTION_ENTRIES_OPTIONAL,
  OID_PROBLEMS_SECTION_ENTRIES_REQUIRED,
  OID_PROBLEMS_SECTION_V2_ENTRIES_OPTIONAL,
  OID_PROBLEMS_SECTION_V2_ENTRIES_REQUIRED,
  OID_PROCEDURE_ACTIVITY_ACT,
  OID_PROCEDURES_SECTION_ENTRIES_REQUIRED,
  OID_QRDA_AUTHOR_DATETIME,
  // QRDA Template OIDs
  OID_QRDA_CATEGORY_I_REPORT,
  OID_QRDA_CATEGORY_I_REPORT_CMS,
  OID_QRDA_CATEGORY_I_REPORT_QDM,
  OID_QRDA_ENCOUNTER_CLASS,
  OID_QRDA_ENCOUNTER_DIAGNOSIS,
  OID_QRDA_ENCOUNTER_PERFORMED,
  OID_QRDA_INTERVENTION_PERFORMED,
  OID_QRDA_MEASURE_ID,
  OID_QRDA_MEASURE_REFERENCE,
  OID_QRDA_MEASURE_REFERENCE_QDM,
  OID_QRDA_MEASURE_SECTION,
  OID_QRDA_MEASURE_SECTION_QDM,
  OID_QRDA_NEGATION_RATIONALE,
  OID_QRDA_PATIENT_CHARACTERISTIC_PAYER,
  OID_QRDA_PATIENT_DATA_SECTION,
  // QRDA Patient Data Section Template
  OID_QRDA_PATIENT_DATA_SECTION_LEGACY,
  OID_QRDA_PATIENT_DATA_SECTION_V2,
  OID_QRDA_PROCEDURE_PERFORMED,
  OID_QRDA_RANK,
  OID_QRDA_REPORTING_PARAMETERS_ACT,
  OID_QRDA_REPORTING_PARAMETERS_ACT_V2,
  OID_QRDA_REPORTING_PARAMETERS_SECTION,
  OID_QRDA_REPORTING_PARAMETERS_SECTION_V2,
  OID_REASON_FOR_REFERRAL,
  OID_SNOMED_CT_CODE_SYSTEM,
  OID_US_NPI_CODE_SYSTEM,
  OID_US_REALM_CDA_HEADER,
} from './oids';
import {
  ACT_CODE_SYSTEM,
  ADDRESS_USE_MAPPER,
  ALLERGY_CLINICAL_CODE_SYSTEM,
  ALLERGY_SEVERITY_MAPPER,
  ALLERGY_STATUS_MAPPER,
  ALLERGY_VERIFICATION_CODE_SYSTEM,
  CCDA_NARRATIVE_REFERENCE_URL,
  CLINICAL_CONDITION_CODE_SYSTEM,
  CONDITION_CATEGORY_CODE_SYSTEM,
  CONDITION_VER_STATUS_CODE_SYSTEM,
  CONDITION_VERIFICATION_CODE_SYSTEM,
  DIAGNOSIS_ROLE_CODE_SYSTEM,
  ENCOUNTER_STATUS_MAPPER,
  HUMAN_NAME_USE_MAPPER,
  IMMUNIZATION_STATUS_MAPPER,
  LOINC_SUMMARY_OF_EPISODE_NOTE,
  mapCcdaSystemToFhir,
  MEDICATION_STATUS_MAPPER,
  OBSERVATION_CATEGORY_MAPPER,
  PARTICIPATION_CODE_SYSTEM,
  PROBLEM_STATUS_MAPPER,
  PROCEDURE_STATUS_MAPPER,
  TELECOM_USE_MAPPER,
  US_CORE_CONDITION_URL,
  US_CORE_ETHNICITY_URL,
  US_CORE_MEDICATION_REQUEST_URL,
  US_CORE_RACE_URL,
} from './systems';
import {
  Ccda,
  CcdaAct,
  CcdaAddr,
  CcdaAssignedEntity,
  CcdaAuthor,
  CcdaCode,
  CcdaCustodian,
  CcdaDocumentationOf,
  CcdaEffectiveTime,
  CcdaEncounter,
  CcdaEntry,
  CcdaEntryRelationship,
  CcdaId,
  CcdaName,
  CcdaObservation,
  CcdaOrganizer,
  CcdaOrganizerComponent,
  CcdaPatientRole,
  CcdaPerformer,
  CcdaProcedure,
  CcdaReferenceRange,
  CcdaSection,
  CcdaSubstanceAdministration,
  CcdaTelecom,
  CcdaTemplateId,
  CcdaText,
} from './types';
import { convertToCompactXml } from './xml';

// Extension URL mappings for QRDA
const extensionURLMapping = {
  patientBirthTime: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient-birthtime',
  encounterDescription: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter-description',
  procedureRank: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-procedure-rank',
};

export interface CcdaToFhirOptions {
  ignoreUnsupportedSections?: boolean;
  generateQRDA?: boolean;
  qrdaParams?: QRDAGenerationParams;
}

export interface QRDAGenerationParams {
  patientId: string;
  measurePeriodStart: string;
  measurePeriodEnd: string;
}

export interface QRDAPatientData {
  patient: Patient;
  encounters: (Encounter | Condition)[];
  interventions: Procedure[];
  procedures: Procedure[];
  coverages: Coverage[];
}

/**
 * Converts C-CDA documents to FHIR resources
 * Following Medplum TypeScript rules:
 * - Generates new FHIR resource IDs
 * - Preserves original C-CDA IDs as identifiers
 * - Adds proper metadata and timestamps
 *
 * @param ccda - The C-CDA document to convert
 * @param options - Optional conversion options
 * @returns The converted FHIR resources
 */
export function convertCcdaToFhir(ccda: Ccda, options?: CcdaToFhirOptions): Bundle {
  return new CcdaToFhirConverter(ccda, options).convert();
}

/**
 * Builds the QRDA document structure
 * @param data - Patient data including demographics, medications, and encounters
 * @param params - QRDA generation parameters
 * @returns The complete QRDA document structure
 */
function buildQRDADocument(data: QRDAPatientData, params: QRDAGenerationParams): Record<string, any> {
  const { patient, encounters, interventions, procedures, coverages } = data;

  const currentDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const documentId = randomUUID();

  return {
    ClinicalDocument: {
      '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@_xmlns': 'urn:hl7-org:v3',
      '@_xmlns:voc': 'urn:hl7-org:v3/voc',
      '@_xmlns:sdtc': 'urn:hl7-org:sdtc',

      // QRDA Header
      realmCode: { '@_code': 'US' },
      typeId: { '@_root': '2.16.840.1.113883.1.3', '@_extension': 'POCD_HD000040' },
      templateId: [
        // US Realm Header Template Id
        { '@_root': OID_US_REALM_CDA_HEADER, '@_extension': '2015-08-01' },
        // QRDA templateId
        { '@_root': OID_QRDA_CATEGORY_I_REPORT, '@_extension': '2017-08-01' },
        // QDM-based QRDA templateId
        { '@_root': OID_QRDA_CATEGORY_I_REPORT_QDM, '@_extension': '2021-08-01' },
        // CMS QRDA templateId - QRDA Category I Report - CMS (V8)
        { '@_root': OID_QRDA_CATEGORY_I_REPORT_CMS, '@_extension': '2022-02-01' },
      ],
      id: { '@_root': documentId },
      // QRDA document type code
      code: {
        '@_code': '55182-0',
        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
        '@_codeSystemName': 'LOINC',
        '@_displayName': 'Quality Measure Report',
      },
      title: 'QRDA Incidence Report',
      // This is the document creation time
      effectiveTime: { '@_value': currentDateTime },
      confidentialityCode: { '@_code': 'N', '@_codeSystem': '2.16.840.1.113883.5.25' },
      languageCode: { '@_code': 'en' },

      // Patient Information
      recordTarget: buildRecordTarget(patient),

      // Author
      author: buildAuthor(currentDateTime),

      // Custodian
      custodian: buildCustodian(),

      // Legal Authenticator
      legalAuthenticator: buildLegalAuthenticator(currentDateTime),

      // Participant
      participant: buildParticipant(),

      // Documentation
      documentationOf: buildDocumentationOf(),

      // Body
      component: {
        structuredBody: {
          // Measure Section
          component: [
            buildMeasureSection(),
            buildReportingParametersSection(params.measurePeriodStart, params.measurePeriodEnd),
            buildPatientDataSection(patient, encounters, interventions, procedures, coverages),
          ],
        },
      },
    },
  };
}

/**
 * Builds the record target section with patient demographics
 * @param patient - The patient resource with demographic information
 * @returns The record target section for the QRDA document
 */
function buildRecordTarget(patient: Patient): Record<string, any> {
  const demographics = extractPatientDemographics(patient);
  const telecom = demographics.telecom.find((t) => t.system === 'phone');
  const email = demographics.telecom.find((t) => t.system === 'email');

  return {
    patientRole: {
      id: {
        '@_extension': patient.id,
        '@_root': '1.3.6.1.4.1.115',
      },
      addr: demographics.address
        ? {
            '@_use': 'HP',
            streetAddressLine: demographics.address.line?.[0] ?? '',
            city: demographics.address.city ?? '',
            state: demographics.address.state ?? '',
            postalCode: demographics.address.postalCode ?? '',
            country: demographics.address.country || 'US',
          }
        : undefined,
      telecom: [
        telecom ? { '@_use': 'HP', '@_value': `tel:${telecom.value}` } : undefined,
        email ? { '@_use': 'HP', '@_value': `mailto:${email.value}` } : undefined,
      ].filter(Boolean),
      patient: {
        name: {
          given: demographics.name.given,
          family: demographics.name.family,
        },
        administrativeGenderCode: {
          '@_code': demographics.gender,
          '@_codeSystem': OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM,
          '@_codeSystemName': 'AdministrativeGender',
        },
        birthTime: { '@_value': demographics.birthDateTime ? formatHl7DateTime(demographics.birthDateTime) : '' },
        raceCode: {
          '@_code': demographics.race?.code ?? '',
          '@_codeSystem': OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
          '@_codeSystemName': 'CDCREC',
        },
        ethnicGroupCode: {
          '@_code': demographics.ethnicity?.code ?? '',
          '@_codeSystem': OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
          '@_codeSystemName': 'CDCREC',
        },
        languageCommunication: {
          templateId: [
            { '@_root': OID_LANGUAGE_COMMUNICATION_TEMPLATE_HITSP, '@_assigningAuthorityName': 'HITSP/C83' },
            { '@_root': OID_LANGUAGE_COMMUNICATION_TEMPLATE_IHE, '@_assigningAuthorityName': 'IHE/PCC' },
          ],
          languageCode: { '@_code': 'eng' },
        },
      },
    },
  };
}

/**
 * Builds the author section
 * @param currentDateTime - The current date/time for the document
 * @returns The author section for the QRDA document
 */
function buildAuthor(currentDateTime: string): Record<string, any> {
  const authorData = extractAuthorCustodianData(currentDateTime);
  return {
    time: { '@_value': authorData.author.time },
    assignedAuthor: {
      id: {
        '@_extension': authorData.author.assignedAuthor.id.extension,
        '@_root': authorData.author.assignedAuthor.id.root,
      },
      addr: {
        streetAddressLine: authorData.author.assignedAuthor.addr.streetAddressLine,
        city: authorData.author.assignedAuthor.addr.city,
        state: authorData.author.assignedAuthor.addr.state,
        postalCode: authorData.author.assignedAuthor.addr.postalCode,
        country: authorData.author.assignedAuthor.addr.country,
      },
      telecom: {
        '@_use': authorData.author.assignedAuthor.telecom.use,
        '@_value': authorData.author.assignedAuthor.telecom.value,
      },
      assignedAuthoringDevice: {
        manufacturerModelName: authorData.author.assignedAuthor.assignedAuthoringDevice.manufacturerModelName,
        softwareName: authorData.author.assignedAuthor.assignedAuthoringDevice.softwareName,
      },
    },
  };
}

/**
 * Builds the custodian section
 * @returns The custodian section for the QRDA document
 */
function buildCustodian(): Record<string, any> {
  const custodianData = extractAuthorCustodianData(new Date().toISOString().replace(/[-:]/g, '').split('.')[0]);
  return {
    assignedCustodian: {
      representedCustodianOrganization: {
        id: {
          '@_extension': custodianData.custodian.assignedCustodian.representedCustodianOrganization.id.extension,
          '@_root': custodianData.custodian.assignedCustodian.representedCustodianOrganization.id.root,
        },
        name: custodianData.custodian.assignedCustodian.representedCustodianOrganization.name,
        telecom: {
          '@_use': custodianData.custodian.assignedCustodian.representedCustodianOrganization.telecom.use,
          '@_value': custodianData.custodian.assignedCustodian.representedCustodianOrganization.telecom.value,
        },
        addr: {
          '@_use': custodianData.custodian.assignedCustodian.representedCustodianOrganization.addr.use,
          streetAddressLine:
            custodianData.custodian.assignedCustodian.representedCustodianOrganization.addr.streetAddressLine,
          city: custodianData.custodian.assignedCustodian.representedCustodianOrganization.addr.city,
          state: custodianData.custodian.assignedCustodian.representedCustodianOrganization.addr.state,
          postalCode: custodianData.custodian.assignedCustodian.representedCustodianOrganization.addr.postalCode,
          country: custodianData.custodian.assignedCustodian.representedCustodianOrganization.addr.country,
        },
      },
    },
  };
}

/**
 * Builds the legal authenticator section
 * @param currentDateTime - The current date/time for the document
 * @returns The legal authenticator section for the QRDA document
 */
function buildLegalAuthenticator(currentDateTime: string): Record<string, any> {
  const authenticatorData = extractAuthorCustodianData(currentDateTime);
  return {
    time: { '@_value': authenticatorData.legalAuthenticator.time },
    signatureCode: { '@_code': authenticatorData.legalAuthenticator.signatureCode.code },
    assignedEntity: {
      id: { '@_root': authenticatorData.legalAuthenticator.assignedEntity.id.root },
      addr: {
        streetAddressLine: authenticatorData.legalAuthenticator.assignedEntity.addr.streetAddressLine,
        city: authenticatorData.legalAuthenticator.assignedEntity.addr.city,
        state: authenticatorData.legalAuthenticator.assignedEntity.addr.state,
        postalCode: authenticatorData.legalAuthenticator.assignedEntity.addr.postalCode,
        country: authenticatorData.legalAuthenticator.assignedEntity.addr.country,
      },
      telecom: {
        '@_use': authenticatorData.legalAuthenticator.assignedEntity.telecom.use,
        '@_value': authenticatorData.legalAuthenticator.assignedEntity.telecom.value,
      },
      assignedPerson: {
        name: {
          given: authenticatorData.legalAuthenticator.assignedEntity.assignedPerson.name.given,
          family: authenticatorData.legalAuthenticator.assignedEntity.assignedPerson.name.family,
        },
      },
      representedOrganization: {
        id: { root: OID_DOCUMENT_ID_CODE_SYSTEM },
        name: 'Medplum Test System',
      },
    },
  };
}

/**
 * Builds the participant section
 * @returns The participant section for the QRDA document
 */
function buildParticipant(): Record<string, any> {
  // NOTE: This is a placeholder for the participant section.
  return {
    '@_typeCode': 'DEV',
    associatedEntity: {
      '@_classCode': 'RGPR',
      id: { '@_extension': '0015CPV4ZTB4WBU', '@_root': OID_PARTICIPANT_DEVICE },
    },
  };
}

/**
 * Builds the documentation section
 * @returns The documentation section for the QRDA document
 */
function buildDocumentationOf(): Record<string, any> {
  return {
    '@_typeCode': 'DOC',
    serviceEvent: {
      '@_classCode': 'PCPR',
      // Care provision
      effectiveTime: {
        low: { '@_nullFlavor': 'UNK' },
        high: { '@_nullFlavor': 'UNK' },
      },
      performer: {
        '@_typeCode': 'PRF',
        time: {
          low: { '@_nullFlavor': 'UNK' },
          high: { '@_nullFlavor': 'UNK' },
        },
        assignedEntity: {
          id: [
            { '@_extension': '1250504853', '@_root': OID_US_NPI_CODE_SYSTEM },
            { '@_extension': '117323', '@_root': '2.16.840.1.113883.4.336' },
          ],
          code: {
            '@_code': '207Q00000X',
            '@_codeSystem': '2.16.840.1.113883.6.101',
            '@_codeSystemName': 'Healthcare Provider Taxonomy (HIPAA)',
          },
          addr: {
            '@_use': 'HP',
            streetAddressLine: '202 Burlington Rd.',
            city: 'Bedford',
            state: 'MA',
            postalCode: '01730',
            country: 'US',
          },
          assignedPerson: {
            name: {
              given: 'Sylvia',
              family: 'Joseph',
            },
          },
          representedOrganization: {
            id: { '@_extension': '916854671', '@_root': '2.16.840.1.113883.4.2' },
            addr: {
              '@_use': 'HP',
              streetAddressLine: '202 Burlington Rd.',
              city: 'Bedford',
              state: 'MA',
              postalCode: '01730',
              country: 'US',
            },
          },
        },
      },
    },
  };
}

/**
 * Builds the measure section
 * @returns The measure section for the QRDA document
 */
function buildMeasureSection(): Record<string, any> {
  return {
    section: {
      templateId: [
        // This is the templateId for Measure Section
        { '@_root': OID_QRDA_MEASURE_SECTION },
        // This is the templateId for Measure Section QDM
        { '@_root': OID_QRDA_MEASURE_SECTION_QDM },
      ],
      // This is the LOINC code for "Measure document". This stays the same for all measure section required by QRDA standard
      code: { '@_code': '55186-1', '@_codeSystem': OID_LOINC_CODE_SYSTEM },
      title: 'Measure Section',
      text: {
        table: {
          '@_border': '1',
          '@_width': '100%',
          thead: {
            tr: {
              th: ['eMeasure Title', 'Version specific identifier'],
            },
          },
          tbody: {
            tr: {
              td: [
                'Percentage of visits for which the eligible clinician attests to documenting a list of current medications using all immediate resources available on the date of the encounter',
                '8A6D0454-8DF0-2D9F-018D-F6AEBA950637',
                '',
              ],
            },
          },
        },
      },
      // 1..* Organizers, each containing a reference to an eMeasure
      entry: {
        organizer: {
          '@_classCode': 'CLUSTER',
          '@_moodCode': 'EVN',
          templateId: [
            // This is the templateId for Measure Reference
            { '@_root': OID_QRDA_MEASURE_REFERENCE },
            // This is the templateId for eMeasure Reference QDM
            { '@_root': OID_QRDA_MEASURE_REFERENCE_QDM },
          ],
          id: { '@_extension': randomUUID(), '@_root': '1.3.6.1.4.1.115' },
          statusCode: { '@_code': 'completed' },
          // Containing isBranch external references
          reference: {
            '@_typeCode': 'REFR',
            externalDocument: {
              '@_classCode': 'DOC',
              '@_moodCode': 'EVN',
              id: { '@_extension': '8A6D0454-8DF0-2D9F-018D-F6AEBA950637', '@_root': OID_QRDA_MEASURE_ID },
              text: 'Percentage of visits for which the eligible clinician attests to documenting a list of current medications using all immediate resources available on the date of the encounter',
              setId: { '@_root': '9A032D9C-3D9B-11E1-8634-00237D5BF174' },
            },
          },
        },
      },
    },
  };
}

/**
 * Builds the reporting parameters section
 * @param periodStart - Start datetime of the reporting period
 * @param periodEnd - End datetime of the reporting period
 * @returns The reporting parameters section for the QRDA document
 */
function buildReportingParametersSection(periodStart: string, periodEnd: string): Record<string, any> {
  return {
    section: {
      // This is the templateId for Reporting Parameters section
      templateId: [
        { '@_root': OID_QRDA_REPORTING_PARAMETERS_SECTION },
        { '@_root': OID_QRDA_REPORTING_PARAMETERS_SECTION_V2, '@_extension': '2016-03-01' },
      ],
      code: { '@_code': '55187-9', '@_codeSystem': OID_LOINC_CODE_SYSTEM },
      title: 'Reporting Parameters',
      text: '',
      entry: {
        '@_typeCode': 'DRIV',
        act: {
          '@_classCode': 'ACT',
          '@_moodCode': 'EVN',
          // This is the templateId for Reporting Parameters Act
          templateId: [
            { '@_root': OID_QRDA_REPORTING_PARAMETERS_ACT },
            { '@_root': OID_QRDA_REPORTING_PARAMETERS_ACT_V2, '@_extension': '2016-03-01' },
          ],
          id: { '@_extension': randomUUID(), '@_root': '1.3.6.1.4.1.115' },
          code: {
            '@_code': '252116004',
            '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
            '@_displayName': 'Observation Parameters',
          },
          effectiveTime: {
            low: { '@_value': formatHl7DateTime(periodStart) },
            high: { '@_value': formatHl7DateTime(periodEnd) },
          },
        },
      },
    },
  };
}

function buildEncounterEntry(
  encounter: Encounter,
  diagnosisCondition?: Condition,
  diagnosisConditionRank?: number
): Record<string, any> {
  const periodStart = encounter.period?.start;
  const periodEnd = encounter.period?.end;

  // Use shared code mapping
  const encounterTypeCode = mapCodeToStandard(encounter.type?.[0], OID_CPT_CODE_SYSTEM);
  const diagnosisCode = mapCodeToStandard(diagnosisCondition?.code, OID_SNOMED_CT_CODE_SYSTEM);

  return {
    encounter: {
      '@_classCode': 'ENC',
      '@_moodCode': 'EVN',
      templateId: [
        // Encounter activities template
        { '@_root': OID_ENCOUNTER_ACTIVITIES, '@_extension': '2015-08-01' },
        // Encounter performed template
        { '@_root': OID_QRDA_ENCOUNTER_PERFORMED, '@_extension': '2021-08-01' },
      ],
      id: { '@_extension': encounter.id, '@_root': '1.3.6.1.4.1.115' },
      // QDM Attribute: Code
      code: {
        '@_code': encounterTypeCode?.code ?? '',
        '@_codeSystem': normalizeCodeSystem(encounterTypeCode?.system) ?? OID_CPT_CODE_SYSTEM,
        '@_codeSystemName': 'CPT',
      },
      text: getExtensionValue(encounter, extensionURLMapping.encounterDescription) ?? '',
      statusCode: { '@_code': 'completed' },
      // QDM Attribute: Relevant Period
      effectiveTime: {
        low: { '@_value': periodStart ? formatHl7DateTime(periodStart) : '' },
        high: { '@_value': periodEnd ? formatHl7DateTime(periodEnd) : '' },
      },
      // QDM Attribute: Diagnoses
      ...(diagnosisCondition &&
        diagnosisConditionRank && {
          entryRelationship: {
            '@_typeCode': 'REFR',
            observation: {
              '@_classCode': 'OBS',
              '@_moodCode': 'EVN',
              // Encounter Diagnosis QDM
              templateId: { '@_root': OID_QRDA_ENCOUNTER_DIAGNOSIS, '@_extension': '2019-12-01' },
              // Diagnosis - https://loinc.org/29308-4
              code: {
                '@_code': '29308-4',
                '@_codeSystem': OID_LOINC_CODE_SYSTEM,
              },
              value: {
                '@_code': diagnosisCode?.code ?? '',
                '@_codeSystem': normalizeCodeSystem(diagnosisCode?.system) ?? OID_SNOMED_CT_CODE_SYSTEM,
                '@_codeSystemName': 'SNOMEDCT',
                '@_xsi:type': 'CD',
              },
              // QDM Attribute: Rank
              entryRelationship: {
                '@_typeCode': 'REFR',
                observation: {
                  '@_classCode': 'OBS',
                  '@_moodCode': 'EVN',
                  templateId: { '@_root': OID_QRDA_RANK, '@_extension': '2019-12-01' },
                  // Rank - http://snomed.info/sct/263486008
                  code: { '@_code': '263486008', '@_displayName': 'Rank', '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM },
                  value: { '@_xsi:type': 'INT', '@_value': diagnosisConditionRank.toString() },
                },
              },
            },
          },
        }),
      // QDM Attribute: Class
      ...(encounter.class?.code !== 'UNK' && {
        entryRelationship: {
          '@_typeCode': 'REFR',
          act: {
            '@_classCode': 'ACT',
            '@_moodCode': 'EVN',
            templateId: [{ '@_root': OID_QRDA_ENCOUNTER_CLASS, '@_extension': '2021-08-01' }],
            code: {
              '@_code': encounter.class?.code ?? '',
              '@_codeSystem': '2.16.840.1.113883.5.4',
              '@_codeSystemName': 'HL7 Act Code',
            },
          },
        },
      }),
      // QDM Attribute: Discharge Disposition
      ...(encounter.hospitalization?.dischargeDisposition?.coding?.[0] && {
        'sdtc:dischargeDispositionCode': {
          '@_code': encounter.hospitalization?.dischargeDisposition?.coding?.[0]?.code ?? '',
          '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
          '@_codeSystemName': 'SNOMEDCT',
        },
      }),
    },
  };
}

function buildPayerEntry(coverage: Coverage): Record<string, any> {
  const periodStart = coverage.period?.start;

  return {
    //  Patient Characteristic Payer
    observation: {
      '@_classCode': 'OBS',
      '@_moodCode': 'EVN',
      templateId: { '@_root': OID_QRDA_PATIENT_CHARACTERISTIC_PAYER },
      id: { '@_root': coverage.id },
      // Payment sources Document - https://loinc.org/48768-6
      code: {
        '@_code': '48768-6',
        '@_codeSystemName': 'LOINC',
        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
        '@_displayName': 'Payment source',
      },
      statusCode: { '@_code': 'completed' },
      effectiveTime: {
        low: { '@_value': periodStart ? formatHl7DateTime(periodStart) : '' },
        high: { '@_nullFlavor': 'UNK' },
      },
      value: {
        '@_xsi:type': 'CD',
        '@_code': coverage.type?.coding?.[0]?.code ?? '',
        '@_codeSystem': '2.16.840.1.113883.3.221.5',
        '@_codeSystemName': 'Source of Payment Typology',
      },
    },
  };
}

function buildInterventionEntry(intervention: Procedure): Record<string, any> {
  const performedDateTime = intervention.performedDateTime;
  const performedPeriodStart = intervention.performedPeriod?.start;

  // Use shared code mapping
  const interventionCode = mapCodeToStandard(intervention.code, OID_SNOMED_CT_CODE_SYSTEM);
  const statusReasonCode = mapCodeToStandard(intervention.statusReason, OID_SNOMED_CT_CODE_SYSTEM);

  return {
    act: {
      '@_classCode': 'ACT',
      '@_moodCode': 'EVN',
      '@_negationInd': 'true',
      templateId: [
        // Consolidation CDA: Procedure Activity Act template
        { '@_root': OID_PROCEDURE_ACTIVITY_ACT, '@_extension': '2014-06-09' },
        // Intervention Performed Template
        { '@_root': OID_QRDA_INTERVENTION_PERFORMED, '@_extension': '2021-08-01' },
      ],
      id: { '@_root': '1.3.6.1.4.1.115', '@_extension': intervention.id },
      code: {
        '@_code': interventionCode?.code ?? '',
        '@_codeSystem': normalizeCodeSystem(interventionCode?.system) ?? OID_SNOMED_CT_CODE_SYSTEM,
        '@_codeSystemName': 'SNOMEDCT',
      },
      text: interventionCode?.display ?? '',
      statusCode: { '@_code': 'completed' },
      effectiveTime: {
        ...(performedPeriodStart ? { '@_value': formatHl7DateTime(performedPeriodStart) } : { '@_nullFlavor': 'UNK' }),
      },
      // QDM Attribute: Author dateTime
      ...(performedDateTime && {
        author: {
          templateId: { '@_root': OID_QRDA_AUTHOR_DATETIME, '@_extension': '2019-12-01' },
          time: { '@_value': formatHl7DateTime(performedDateTime) },
          assignedAuthor: {
            id: { '@_nullFlavor': 'NA' },
          },
        },
      }),
      // QDM Attribute: Negation Rationale
      ...(intervention.statusReason?.coding?.[0] && {
        entryRelationship: {
          '@_typeCode': 'RSON',
          observation: {
            '@_classCode': 'OBS',
            '@_moodCode': 'EVN',
            templateId: { '@_root': OID_QRDA_NEGATION_RATIONALE, '@_extension': '2017-08-01' },
            // Reason care action performed or not - https://loinc.org/77301-0
            code: {
              '@_code': '77301-0',
              '@_codeSystem': OID_LOINC_CODE_SYSTEM,
              '@_displayName': 'reason',
              '@_codeSystemName': 'LOINC',
            },
            value: {
              '@_code': statusReasonCode?.code ?? '',
              '@_codeSystem': normalizeCodeSystem(statusReasonCode?.system) ?? OID_SNOMED_CT_CODE_SYSTEM,
              '@_codeSystemName': 'SNOMEDCT',
              '@_xsi:type': 'CD',
            },
          },
        },
      }),
    },
  };
}

function buildProcedureEntry(procedure: Procedure): Record<string, any> {
  const rank = getExtensionValue(procedure, extensionURLMapping.procedureRank) as number | undefined;
  const performedDateTime = procedure.performedDateTime;
  const performedPeriodStart = procedure.performedPeriod?.start;

  // Use shared code mapping
  const procedureCode = mapCodeToStandard(procedure.code, OID_SNOMED_CT_CODE_SYSTEM);
  const statusReasonCode = mapCodeToStandard(procedure.statusReason, OID_SNOMED_CT_CODE_SYSTEM);

  return {
    procedure: {
      '@_classCode': 'PROC',
      '@_moodCode': 'EVN',
      '@_negationInd': 'true',
      templateId: [
        // Procedure performed template
        { '@_root': OID_QRDA_PROCEDURE_PERFORMED, '@_extension': '2021-08-01' },
        // Procedure Activity Procedure
        { '@_root': '2.16.840.1.113883.10.20.22.4.14', '@_extension': '2014-06-09' },
      ],
      id: { '@_root': '1.3.6.1.4.1.115', '@_extension': procedure.id },
      code: {
        '@_code': procedureCode?.code ?? '',
        '@_codeSystem': normalizeCodeSystem(procedureCode?.system) ?? OID_SNOMED_CT_CODE_SYSTEM,
        '@_codeSystemName': 'SNOMEDCT',
      },
      text: procedureCode?.display ?? '',
      statusCode: { '@_code': 'completed' },
      effectiveTime: {
        ...(performedPeriodStart ? { '@_value': formatHl7DateTime(performedPeriodStart) } : { '@_nullFlavor': 'UNK' }),
      },
      // QDM Attribute: Author dateTime
      ...(performedDateTime && {
        author: {
          templateId: { '@_root': OID_QRDA_AUTHOR_DATETIME, '@_extension': '2019-12-01' },
          time: { '@_value': formatHl7DateTime(performedDateTime) },
          assignedAuthor: {
            id: { '@_nullFlavor': 'NA' },
          },
        },
      }),
      // QDM Attribute: Rank
      ...(rank && {
        entryRelationship: {
          '@_typeCode': 'REFR',
          observation: {
            '@_classCode': 'OBS',
            '@_moodCode': 'EVN',
            templateId: { '@_root': OID_QRDA_RANK, '@_extension': '2019-12-01' },
            // Rank - http://snomed.info/sct/263486008
            code: { '@_code': '263486008', '@_displayName': 'Rank', '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM },
            value: { '@_xsi:type': 'INT', '@_value': rank.toString() },
          },
        },
      }),
      // QDM Attribute: Negation Rationale
      ...(procedure.statusReason?.coding?.[0] && {
        entryRelationship: {
          '@_typeCode': 'RSON',
          observation: {
            '@_classCode': 'OBS',
            '@_moodCode': 'EVN',
            templateId: { '@_root': OID_QRDA_NEGATION_RATIONALE, '@_extension': '2017-08-01' },
            // Reason care action performed or not - https://loinc.org/77301-0
            code: {
              '@_code': '77301-0',
              '@_codeSystem': OID_LOINC_CODE_SYSTEM,
              '@_displayName': 'reason',
              '@_codeSystemName': 'LOINC',
            },
            value: {
              '@_code': statusReasonCode?.code ?? '',
              '@_codeSystem': normalizeCodeSystem(statusReasonCode?.system) ?? OID_SNOMED_CT_CODE_SYSTEM,
              '@_codeSystemName': 'SNOMEDCT',
              '@_xsi:type': 'CD',
            },
          },
        },
      }),
    },
  };
}

/**
 * Builds the patient data section with encounters and medications
 * @param patient - The patient resource
 * @param encounters - Array of encounter and condition resources
 * @param interventions - Array of intervention resources
 * @param procedures - Array of procedure resources
 * @param coverages - Array of coverage resources
 * @returns The patient data section for the QRDA document
 */
function buildPatientDataSection(
  patient: Patient,
  encounters: (Encounter | Condition)[],
  interventions: Procedure[],
  procedures: Procedure[],
  coverages: Coverage[]
): Record<string, any> {
  const entries: any[] = [];

  // Add encounter entries
  encounters.forEach((encounter) => {
    // It can contain Encounter.diagnosis.condition resources due to _include query
    if (encounter.resourceType !== 'Encounter') {
      return;
    }

    const diagnosis = encounter.diagnosis?.[0];
    const condition = encounters.find(
      (e) => e.resourceType === 'Condition' && e.id === resolveId(diagnosis?.condition)
    ) as Condition | undefined;

    entries.push(buildEncounterEntry(encounter, condition, diagnosis?.rank));
  });

  // Add interventions entries
  interventions.forEach((intervention) => {
    entries.push(buildInterventionEntry(intervention));
  });

  // Add procedures entries
  procedures.forEach((procedure) => {
    entries.push(buildProcedureEntry(procedure));
  });

  // Add patient characteristic payer
  coverages.forEach((coverage) => {
    entries.push(buildPayerEntry(coverage));
  });

  return {
    section: {
      templateId: [
        { '@_root': OID_QRDA_PATIENT_DATA_SECTION_LEGACY },
        { '@_root': OID_QRDA_PATIENT_DATA_SECTION, '@_extension': '2021-08-01' },
        { '@_root': OID_QRDA_PATIENT_DATA_SECTION_V2, '@_extension': '2022-02-01' },
      ],
      code: { '@_code': '55188-7', '@_codeSystem': OID_LOINC_CODE_SYSTEM },
      title: 'Patient Data',
      text: '',
      entry: entries,
    },
  };
}

/**
 * Shared data processing utilities for both C-CDA and QRDA generation
 */

/**
 * Extracts patient demographics data that can be used for both C-CDA and QRDA
 * @param patient - The FHIR Patient resource
 * @returns Structured patient demographics data
 */
function extractPatientDemographics(patient: Patient): {
  name: { given: string; family: string };
  gender: string | undefined;
  birthDateTime: string | undefined;
  race: Coding | undefined;
  ethnicity: Coding | undefined;
  address: Address | undefined;
  telecom: ContactPoint[];
} {
  const patientName = patient.name?.[0];
  const address = patient.address?.[0];
  const telecom = patient.telecom || [];
  const raceExtension = getExtensionValue(
    patient,
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    'ombCategory'
  ) as Coding;
  const ethnicityExtension = getExtensionValue(
    patient,
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
    'ombCategory'
  ) as Coding;
  const birthDateTime = getExtensionValue((patient as any)._birthDate, extensionURLMapping.patientBirthTime) as string;

  return {
    name: {
      given: patientName?.given?.[0] ?? '',
      family: patientName?.family ?? '',
    },
    gender: patient.gender,
    birthDateTime,
    race: raceExtension,
    ethnicity: ethnicityExtension,
    address,
    telecom,
  };
}

/**
 * Extracts author/custodian information that can be used for both C-CDA and QRDA
 * @param currentDateTime - Current date/time string
 * @returns Structured author/custodian data
 */
function extractAuthorCustodianData(currentDateTime: string): {
  author: {
    time: string;
    assignedAuthor: {
      id: { extension: string; root: string };
      addr: {
        streetAddressLine: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
      telecom: { use: string; value: string };
      assignedAuthoringDevice: {
        manufacturerModelName: string;
        softwareName: string;
      };
    };
  };
  custodian: {
    assignedCustodian: {
      representedCustodianOrganization: {
        id: { extension: string; root: string };
        name: string;
        telecom: { use: string; value: string };
        addr: {
          use: string;
          streetAddressLine: string;
          city: string;
          state: string;
          postalCode: string;
          country: string;
        };
      };
    };
  };
  legalAuthenticator: {
    time: string;
    signatureCode: { code: string };
    assignedEntity: {
      id: { root: string };
      addr: {
        streetAddressLine: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
      telecom: { use: string; value: string };
      assignedPerson: {
        name: {
          given: string;
          family: string;
        };
      };
      representedOrganization: {
        id: { root: string };
        name: string;
      };
    };
  };
} {
  return {
    author: {
      time: currentDateTime,
      assignedAuthor: {
        id: { extension: '1250504853', root: OID_US_NPI_CODE_SYSTEM },
        addr: {
          streetAddressLine: '123 Happy St',
          city: 'Sunnyvale',
          state: 'CA',
          postalCode: '95008',
          country: 'US',
        },
        telecom: { use: 'WP', value: 'tel:(781)271-3000' },
        assignedAuthoringDevice: {
          manufacturerModelName: 'Medplum Test System',
          softwareName: 'Medplum Test System',
        },
      },
    },
    custodian: {
      assignedCustodian: {
        representedCustodianOrganization: {
          id: { extension: '117323', root: '2.16.840.1.113883.4.336' },
          name: 'Medplum Test Deck',
          telecom: { use: 'WP', value: 'tel:(781)271-3000' },
          addr: {
            use: 'HP',
            streetAddressLine: '202 Burlington Rd.',
            city: 'Bedford',
            state: 'MA',
            postalCode: '01730',
            country: 'US',
          },
        },
      },
    },
    legalAuthenticator: {
      time: currentDateTime,
      signatureCode: { code: 'S' },
      assignedEntity: {
        id: { root: randomUUID() },
        addr: {
          streetAddressLine: '123 Happy St',
          city: 'Sunnyvale',
          state: 'CA',
          postalCode: '95008',
          country: 'US',
        },
        telecom: { use: 'WP', value: 'tel:(781)271-3000' },
        assignedPerson: {
          name: {
            given: 'John',
            family: 'Doe',
          },
        },
        representedOrganization: {
          id: { root: '2.16.840.1.113883.19.5' },
          name: 'Medplum Test System',
        },
      },
    },
  };
}

/**
 * Shared XML building utilities for both C-CDA and QRDA generation
 */

/**
 * Creates a standardized XML builder configuration for both C-CDA and QRDA
 * @returns XMLBuilder configuration object
 */
function createXmlBuilderConfig(): any {
  return {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
    suppressBooleanAttributes: false,
  };
}

/**
 * Builds XML header for both C-CDA and QRDA documents
 * @returns XML header string
 */
function buildXmlHeader(): string {
  return '<?xml version="1.0" encoding="utf-8"?>\n';
}

/**
 * Converts a data object to XML string using standardized configuration
 * @param data - The data object to convert
 * @returns XML string
 */
function buildXmlString(data: Record<string, any>): string {
  const builder = new XMLBuilder(createXmlBuilderConfig());
  return buildXmlHeader() + builder.build(data);
}

/**
 * Shared code mapping utilities for both C-CDA and QRDA generation
 */

/**
 * Maps a FHIR code to a standardized format for both C-CDA and QRDA
 * @param code - The FHIR CodeableConcept
 * @param defaultSystem - Default code system if not specified
 * @returns Standardized code object
 */
function mapCodeToStandard(
  code: CodeableConcept | undefined,
  defaultSystem?: string
):
  | {
      code: string;
      system: string;
      display: string;
    }
  | undefined {
  if (!code?.coding?.[0]) {
    return undefined;
  }

  const coding = code.coding[0];
  return {
    code: coding.code || '',
    system: coding.system || defaultSystem || '',
    display: coding.display || code.text || '',
  };
}

/**
 * Validates and normalizes a code system OID
 * @param system - The code system to validate
 * @returns Normalized code system or undefined if invalid
 */
function normalizeCodeSystem(system: string | undefined): string | undefined {
  if (!system) {
    return undefined;
  }

  // Ensure it's a valid OID format
  if (system.match(/^\d+(\.\d+)*$/)) {
    return system;
  }

  // Handle FHIR URLs
  if (system.startsWith('http')) {
    return system;
  }

  return undefined;
}

class CcdaToFhirConverter {
  private readonly ccda: Ccda;
  private readonly options: CcdaToFhirOptions | undefined;
  private readonly resources: Resource[] = [];
  private patient?: Patient;
  private qrdaPatientData?: QRDAPatientData;

  constructor(ccda: Ccda, options?: CcdaToFhirOptions) {
    this.ccda = ccda;
    this.options = options;
  }

  convert(): Bundle {
    this.processHeader();
    const composition = this.createComposition();

    // If QRDA generation is requested, build QRDA document
    if (this.options?.generateQRDA && this.options.qrdaParams && this.qrdaPatientData) {
      const qrdaXml = this.generateQRDACategoryI(this.qrdaPatientData, this.options.qrdaParams);
      if (qrdaXml) {
        // Add QRDA document as a DocumentReference resource
        const documentReference: DocumentReference = {
          resourceType: 'DocumentReference',
          id: generateId(),
          status: 'current',
          type: {
            coding: [
              {
                system: LOINC,
                code: '55182-0',
                display: 'Quality Measure Report',
              },
            ],
          },
          category: [
            {
              coding: [
                {
                  system: LOINC,
                  code: '55182-0',
                  display: 'Quality Measure Report',
                },
              ],
            },
          ],
          subject: this.patient ? createReference(this.patient) : undefined,
          date: new Date().toISOString(),
          content: [
            {
              attachment: {
                contentType: 'application/xml',
                data: Buffer.from(qrdaXml).toString('base64'),
              },
            },
          ],
        };
        this.resources.push(documentReference);
      }
    }

    return {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        { resource: composition },
        ...(this.patient ? [{ resource: this.patient }] : []),
        ...this.resources.map((resource) => ({ resource })),
      ],
    };
  }

  /**
   * Generates a QRDA Category I XML document for CMS68v14 measure
   * @param patientData - Patient data including demographics, medications, and encounters
   * @param params - Parameters for QRDA generation
   * @returns Generated XML string or null if patient has no data to export
   */
  private generateQRDACategoryI(patientData: QRDAPatientData, params: QRDAGenerationParams): string | null {
    // Does not create QRDA if patient has no data to export
    if (
      patientData.encounters.length === 0 &&
      patientData.interventions.length === 0 &&
      patientData.procedures.length === 0
    ) {
      return null;
    }

    // Build QRDA XML
    const qrdaDocument = buildQRDADocument(patientData, params);

    // Convert to XML string using shared utilities
    return buildXmlString(qrdaDocument);
  }

  /**
   * Collects QRDA-relevant data from processed resources
   * @param resource - The FHIR resource to check for QRDA relevance
   */
  private collectQRDAData(resource: Resource): void {
    if (!this.qrdaPatientData) {
      return;
    }

    switch (resource.resourceType) {
      case 'Encounter':
        this.qrdaPatientData.encounters.push(resource as Encounter);
        break;
      case 'Condition':
        this.qrdaPatientData.encounters.push(resource as Condition);
        break;
      case 'Procedure':
        // For now, treat all procedures as regular procedures
        // TODO: Add logic to distinguish between interventions and procedures
        this.qrdaPatientData.procedures.push(resource as Procedure);
        break;
      case 'Coverage':
        this.qrdaPatientData.coverages.push(resource as Coverage);
        break;
    }
  }

  private processHeader(): void {
    const patientRole = this.ccda.recordTarget?.[0]?.patientRole;
    if (patientRole) {
      this.patient = this.createPatient(patientRole);

      // Initialize QRDA patient data if QRDA generation is requested
      if (this.options?.generateQRDA) {
        this.qrdaPatientData = {
          patient: this.patient,
          encounters: [],
          interventions: [],
          procedures: [],
          coverages: [],
        };
      }
    }
  }

  private createPatient(patientRole: CcdaPatientRole): Patient {
    const patient = patientRole.patient;
    const extensions: Extension[] = [];
    if (patient.raceCode && patient.raceCode.length > 0 && !patient.raceCode[0]['@_nullFlavor']) {
      extensions.push({
        url: US_CORE_RACE_URL,
        extension: patient.raceCode.map((raceCode) => ({
          url: 'ombCategory',
          valueCoding: this.mapCodeToCoding(raceCode),
        })),
      });
    }

    if (patient.ethnicGroupCode && patient.ethnicGroupCode.length > 0 && !patient.ethnicGroupCode[0]['@_nullFlavor']) {
      extensions.push({
        url: US_CORE_ETHNICITY_URL,
        extension: patient.ethnicGroupCode.map((ethnicGroupCode) => ({
          url: 'ombCategory',
          valueCoding: this.mapCodeToCoding(ethnicGroupCode),
        })),
      });
    }

    return {
      resourceType: 'Patient',
      id: this.mapId(patientRole.id),
      identifier: this.mapIdentifiers(patientRole.id),
      name: this.mapCcdaNameArrayFhirHumanNameArray(patient.name),
      gender: this.mapGenderCode(patient.administrativeGenderCode?.['@_code']),
      birthDate: mapCcdaToFhirDate(patient.birthTime?.['@_value']),
      address: this.mapAddresses(patientRole.addr),
      telecom: this.mapTelecom(patientRole.telecom),
      extension: extensions.length > 0 ? extensions : undefined,
    };
  }

  private mapId(ids: CcdaId[] | undefined): string {
    // If there is an id without a root, then use that as the FHIR resource ID
    const serverId = ids?.find((id) => !id['@_extension'] && id['@_root'] && isUUID(id['@_root']));
    if (serverId) {
      return serverId['@_root'] as string;
    }

    // Otherwise generate a UUID
    return generateId();
  }

  private mapIdentifiers(ids: CcdaId[] | undefined): Identifier[] | undefined {
    if (!ids) {
      return undefined;
    }
    const result: Identifier[] = [];
    for (const id of ids) {
      if (!id['@_extension'] && id['@_root'] && isUUID(id['@_root'])) {
        // By convention, we use id without a root as the FHIR resource ID
        continue;
      }
      result.push({
        system: mapCcdaSystemToFhir(id['@_root']),
        value: id['@_extension'],
      });
    }
    return result;
  }

  private mapCcdaNameArrayFhirHumanNameArray(names: CcdaName[] | undefined): HumanName[] | undefined {
    return names?.map((n) => this.mapCcdaNameToFhirHumanName(n)).filter(Boolean) as HumanName[];
  }

  private mapCcdaNameToFhirHumanName(name: CcdaName | undefined): HumanName | undefined {
    if (!name) {
      return undefined;
    }

    const result: HumanName = {};

    const use = name['@_use'] ? HUMAN_NAME_USE_MAPPER.mapCcdaToFhir(name['@_use']) : undefined;
    if (use) {
      result.use = use;
    }

    if (name.prefix) {
      result.prefix = name.prefix.map(nodeToString)?.filter(Boolean) as string[];
    }

    if (name.family) {
      result.family = nodeToString(name.family);
    }

    if (name.given) {
      result.given = name.given.map(nodeToString)?.filter(Boolean) as string[];
    }

    if (name.suffix) {
      result.suffix = name.suffix.map(nodeToString)?.filter(Boolean) as string[];
    }

    return result;
  }

  private mapAddresses(addresses: CcdaAddr[] | undefined): Address[] | undefined {
    if (!addresses || addresses.length === 0 || addresses.every((addr) => addr['@_nullFlavor'] === 'UNK')) {
      return undefined;
    }
    return addresses?.map((addr) => ({
      '@_use': addr['@_use'] ? ADDRESS_USE_MAPPER.mapCcdaToFhir(addr['@_use']) : undefined,
      line: addr.streetAddressLine,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country,
    }));
  }

  private mapTelecom(telecoms: CcdaTelecom[] | undefined): ContactPoint[] | undefined {
    if (!telecoms || telecoms.length === 0 || telecoms.every((tel) => tel['@_nullFlavor'] === 'UNK')) {
      return undefined;
    }
    return telecoms?.map((tel) => ({
      '@_use': tel['@_use'] ? TELECOM_USE_MAPPER.mapCcdaToFhir(tel['@_use']) : undefined,
      system: this.getTelecomSystem(tel['@_value']),
      value: this.getTelecomValue(tel['@_value']),
    }));
  }

  private createComposition(): Composition {
    const components = this.ccda.component?.structuredBody?.component || [];
    const sections: CompositionSection[] = [];

    for (const component of components) {
      for (const section of component.section) {
        const resources = this.processSection(section);
        sections.push({
          title: section.title,
          code: this.mapCode(section.code),
          text: {
            status: 'generated',
            div: `<div xmlns="http://www.w3.org/1999/xhtml">${convertToCompactXml(section.text)}</div>`,
          },
          entry: resources.map(createReference),
        });
        this.resources.push(...resources);
      }
    }

    return {
      resourceType: 'Composition',
      id: this.mapId(this.ccda.id),
      language: this.ccda.languageCode?.['@_code'],
      status: 'final',
      type: this.ccda.code
        ? (this.mapCode(this.ccda.code) as CodeableConcept)
        : { coding: [{ system: LOINC, code: LOINC_SUMMARY_OF_EPISODE_NOTE }] },
      confidentiality: this.ccda.confidentialityCode?.['@_code'] as Composition['confidentiality'],
      author: this.ccda.author?.[0]
        ? [
            this.mapAuthorToReference(this.ccda.author?.[0]) as Reference<
              Practitioner | Organization | Patient | PractitionerRole
            >,
          ]
        : [{ display: 'Medplum' }],
      custodian: this.mapCustodianToReference(this.ccda.custodian),
      event: this.mapDocumentationOfToEvent(this.ccda.documentationOf),
      date: mapCcdaToFhirDateTime(this.ccda.effectiveTime?.[0]?.['@_value']) ?? new Date().toISOString(),
      title: this.ccda.title ?? 'Medical Summary',
      section: sections,
    };
  }

  private processSection(section: CcdaSection): Resource[] {
    const resources: Resource[] = [];

    if (section.entry) {
      for (const entry of section.entry) {
        this.processEntry(section, entry, resources);
      }
    }

    return resources;
  }

  private processEntry(section: CcdaSection, entry: CcdaEntry, resources: Resource[]): void {
    for (const act of entry.act ?? []) {
      const resource = this.processAct(section, act);
      if (resource) {
        resources.push(resource);
        // Collect QRDA data if enabled
        if (this.options?.generateQRDA) {
          this.collectQRDAData(resource);
        }
      }
    }

    for (const substanceAdmin of entry.substanceAdministration ?? []) {
      const resource = this.processSubstanceAdministration(section, substanceAdmin);
      if (resource) {
        resources.push(resource);
        // Collect QRDA data if enabled
        if (this.options?.generateQRDA) {
          this.collectQRDAData(resource);
        }
      }
    }

    for (const organizer of entry.organizer ?? []) {
      const resource = this.processOrganizer(section, organizer);
      resources.push(resource);
      // Collect QRDA data if enabled
      if (this.options?.generateQRDA) {
        this.collectQRDAData(resource);
      }
    }

    for (const observation of entry.observation ?? []) {
      const resource = this.processObservation(section, observation);
      resources.push(resource);
      // Collect QRDA data if enabled
      if (this.options?.generateQRDA) {
        this.collectQRDAData(resource);
      }
    }

    for (const encounter of entry.encounter ?? []) {
      const resource = this.processEncounter(section, encounter);
      resources.push(resource);
      // Collect QRDA data if enabled
      if (this.options?.generateQRDA) {
        this.collectQRDAData(resource);
      }
    }

    for (const procedure of entry.procedure ?? []) {
      const resource = this.processProcedure(section, procedure);
      resources.push(resource);
      // Collect QRDA data if enabled
      if (this.options?.generateQRDA) {
        this.collectQRDAData(resource);
      }
    }
  }

  private processAct(section: CcdaSection, act: CcdaAct): Resource | undefined {
    const templateId = section.templateId[0]['@_root'];
    switch (templateId) {
      case OID_ALLERGIES_SECTION_ENTRIES_REQUIRED:
      case OID_ALLERGIES_SECTION_ENTRIES_OPTIONAL:
      case OID_ALLERGIES_SECTION_ENTRIES_REQUIRED_V2:
      case OID_ALLERGIES_SECTION_ENTRIES_OPTIONAL_V2:
        return this.processAllergyIntoleranceAct(act);
      case OID_PROBLEMS_SECTION_ENTRIES_REQUIRED:
      case OID_PROBLEMS_SECTION_ENTRIES_OPTIONAL:
      case OID_PROBLEMS_SECTION_V2_ENTRIES_REQUIRED:
      case OID_PROBLEMS_SECTION_V2_ENTRIES_OPTIONAL:
        return this.processConditionAct(act);
      case OID_PLAN_OF_CARE_SECTION:
        return this.processCarePlanAct(act);
      case OID_HEALTH_CONCERNS_SECTION:
        return this.processConditionAct(act);
      case OID_PROCEDURES_SECTION_ENTRIES_REQUIRED:
        return this.processProcedureAct(act);
      case OID_REASON_FOR_REFERRAL:
        // This is part of USCDI v3, which is optional, and not yet implemented
        return undefined;
      case OID_NOTES_SECTION:
        // This is part of USCDI v3, which is optional, and not yet implemented
        return undefined;
      case OID_PAYERS_SECTION:
        // This is part of USCDI v3, which is optional, and not yet implemented
        return undefined;
      default:
        if (this.options?.ignoreUnsupportedSections) {
          return undefined;
        }
        throw new Error('Unhandled act templateId: ' + templateId);
    }
  }

  private processAllergyIntoleranceAct(act: CcdaAct): Resource | undefined {
    const observation = act.entryRelationship?.find((rel) => rel['@_typeCode'] === 'SUBJ')?.observation?.[0];
    if (!observation) {
      return undefined;
    }

    const allergy: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      id: this.mapId(act.id),
      clinicalStatus: this.createClinicalStatus(act),
      verificationStatus: this.createVerificationStatus(),
      type: 'allergy',
      category: ['food'],
      patient: createReference(this.patient as Patient),
      recorder: this.mapAuthorToReference(act.author?.[0]),
      recordedDate: this.mapEffectiveTimeToDateTime(act.effectiveTime?.[0]),
      onsetDateTime: this.mapEffectiveTimeToDateTime(observation.effectiveTime?.[0]),
    };

    // Set category based on the observation.value code
    if ((observation.value as CcdaCode)?.['@_code'] === '414285001') {
      allergy.category = ['food'];
    }

    allergy.extension = this.mapTextReference(observation.text);

    const allergenCode = observation.participant?.[0]?.participantRole?.playingEntity?.code;
    if (allergenCode) {
      allergy.code = this.mapCode(allergenCode);

      // Add allergen reference
      if (allergy.code && allergenCode.originalText?.reference?.['@_value']) {
        allergy.code.extension = this.mapTextReference(allergenCode.originalText);
      }
    }

    const reactionObservations = observation.entryRelationship?.find(
      (rel) => rel['@_typeCode'] === 'MFST'
    )?.observation;
    if (reactionObservations) {
      allergy.reaction = reactionObservations.map((ro) => this.processReaction(ro));
    }

    allergy.asserter = this.mapAuthorToReference(observation.author?.[0]);

    return allergy;
  }

  private processConditionAct(act: CcdaAct): Resource | undefined {
    const observation = act.entryRelationship?.find((rel) => rel['@_typeCode'] === 'SUBJ')?.observation?.[0];
    if (!observation) {
      return undefined;
    }

    const result: Condition = {
      resourceType: 'Condition',
      id: this.mapId(act.id),
      identifier: this.concatArrays(this.mapIdentifiers(act.id), this.mapIdentifiers(observation.id)),
      meta: {
        profile: [US_CORE_CONDITION_URL],
      },
      clinicalStatus: {
        coding: [
          {
            system: CLINICAL_CONDITION_CODE_SYSTEM,
            code: PROBLEM_STATUS_MAPPER.mapCcdaToFhirWithDefault(act.statusCode?.['@_code'], 'active'),
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: CONDITION_VERIFICATION_CODE_SYSTEM,
            code: 'confirmed',
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: CONDITION_CATEGORY_CODE_SYSTEM,
              code: 'problem-list-item',
              display: 'Problem List Item',
            },
          ],
        },
      ],
      code: this.mapCode(observation.value as CcdaCode),
      subject: createReference(this.patient as Patient),
      onsetDateTime: mapCcdaToFhirDateTime(observation.effectiveTime?.[0]?.low?.['@_value']),
      abatementDateTime: mapCcdaToFhirDateTime(observation.effectiveTime?.[0]?.high?.['@_value']),
      recordedDate: this.mapEffectiveTimeToDateTime(act.effectiveTime?.[0]),
      recorder: this.mapAuthorToReference(observation.author?.[0]),
      asserter: this.mapAuthorToReference(observation.author?.[0]),
    };

    result.extension = this.mapTextReference(observation.text);

    return result;
  }

  private processCarePlanAct(act: CcdaAct): Resource | undefined {
    const result: CarePlan = {
      resourceType: 'CarePlan',
      id: this.mapId(act.id),
      identifier: this.mapIdentifiers(act.id),
      status: 'completed',
      intent: 'plan',
      title: 'CARE PLAN',
      category: act.code ? [this.mapCode(act.code) as CodeableConcept] : undefined,
      subject: createReference(this.patient as Patient),
      description: nodeToString(act.text),
    };

    return result;
  }

  private processProcedureAct(act: CcdaAct): Resource | undefined {
    const result: Procedure = {
      resourceType: 'Procedure',
      id: this.mapId(act.id),
      identifier: this.mapIdentifiers(act.id),
      status: 'completed',
      code: this.mapCode(act.code),
      subject: createReference(this.patient as Patient),
      performedDateTime: mapCcdaToFhirDateTime(act.effectiveTime?.[0]?.['@_value']),
      recorder: this.mapAuthorToReference(act.author?.[0]),
      asserter: this.mapAuthorToReference(act.author?.[0]),
      extension: this.mapTextReference(act.text),
    };

    return result;
  }

  private processSubstanceAdministration(
    section: CcdaSection,
    substanceAdmin: CcdaSubstanceAdministration
  ): Resource | undefined {
    const templateId = section.templateId[0]['@_root'];
    switch (templateId) {
      case OID_MEDICATIONS_SECTION_ENTRIES_REQUIRED:
      case OID_PLAN_OF_CARE_SECTION:
        return this.processMedicationSubstanceAdministration(substanceAdmin);
      case OID_IMMUNIZATIONS_SECTION_ENTRIES_OPTIONAL:
      case OID_IMMUNIZATIONS_SECTION_ENTRIES_REQUIRED:
        return this.processImmunizationSubstanceAdministration(substanceAdmin);
      default:
        if (this.options?.ignoreUnsupportedSections) {
          return undefined;
        }
        throw new Error('Unhandled substance administration templateId: ' + templateId);
    }
  }

  private processMedicationSubstanceAdministration(substanceAdmin: CcdaSubstanceAdministration): Resource | undefined {
    const cdaId = this.mapId(substanceAdmin.id);
    const medicationCode = substanceAdmin.consumable?.manufacturedProduct?.[0]?.manufacturedMaterial?.[0]?.code?.[0];
    const routeCode = substanceAdmin.routeCode;
    const doseQuantity = substanceAdmin.doseQuantity;
    const manufacturerOrg = substanceAdmin.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization?.[0];
    const instructions = substanceAdmin.entryRelationship?.find(
      (rel) => rel.substanceAdministration?.[0]?.templateId?.[0]?.['@_root'] === OID_MEDICATION_FREE_TEXT_SIG
    )?.substanceAdministration?.[0];

    let medication: Medication | undefined = undefined;
    let medicationCodeableConcept: CodeableConcept | undefined = undefined;

    if (manufacturerOrg) {
      // If there is a manufacturer, create a Medication resource
      // We need to do this to fully represent the medication for round trip data preservation
      medication = {
        resourceType: 'Medication',
        id: 'med-' + cdaId,
        code: this.mapCode(medicationCode),
        extension: this.mapTextReference(medicationCode?.originalText),
        manufacturer: manufacturerOrg
          ? {
              identifier: {
                value: manufacturerOrg.id?.[0]?.['@_root'],
              },
              display: manufacturerOrg.name?.[0],
            }
          : undefined,
      };
    } else {
      // Otherwise, create a CodeableConcept for the medication
      // Avoid contained resources as much as possible
      medicationCodeableConcept = {
        ...this.mapCode(medicationCode),
        extension: this.mapTextReference(medicationCode?.originalText),
      };
    }

    return {
      resourceType: 'MedicationRequest',
      id: cdaId,
      contained: medication ? [medication] : undefined,
      meta: {
        profile: [US_CORE_MEDICATION_REQUEST_URL],
      },
      extension: this.mapTextReference(substanceAdmin.text),
      status: MEDICATION_STATUS_MAPPER.mapCcdaToFhirWithDefault(substanceAdmin.statusCode?.['@_code'], 'active'),
      intent: 'order',
      medicationReference: medication ? { reference: '#med-' + cdaId } : undefined,
      medicationCodeableConcept,
      subject: createReference(this.patient as Patient),
      authoredOn: mapCcdaToFhirDateTime(substanceAdmin.author?.[0]?.time?.['@_value']),
      dispenseRequest: substanceAdmin.effectiveTime?.[0]
        ? {
            validityPeriod: {
              start: mapCcdaToFhirDateTime(substanceAdmin.effectiveTime?.[0]?.low?.['@_value']),
              end: mapCcdaToFhirDateTime(substanceAdmin.effectiveTime?.[0]?.high?.['@_value']),
            },
          }
        : undefined,
      dosageInstruction: [
        {
          text: typeof substanceAdmin.text === 'string' ? substanceAdmin.text : undefined,
          extension: this.mapTextReference(instructions?.text),
          route: routeCode ? this.mapCode(routeCode) : undefined,
          timing: {
            repeat: substanceAdmin.effectiveTime?.[1]?.period
              ? {
                  period: Number(substanceAdmin.effectiveTime?.[1]?.period['@_value']),
                  periodUnit: substanceAdmin.effectiveTime?.[1]?.period['@_unit'],
                }
              : undefined,
          },
          doseAndRate: doseQuantity
            ? [
                {
                  doseQuantity: {
                    system: UCUM,
                    value: Number(doseQuantity['@_value']),
                    code: '[IU]',
                    unit: '[IU]',
                  },
                },
              ]
            : undefined,
        },
      ],
    };
  }

  private processImmunizationSubstanceAdministration(
    substanceAdmin: CcdaSubstanceAdministration
  ): Resource | undefined {
    const consumable = substanceAdmin.consumable;
    if (!consumable) {
      return undefined;
    }

    const result: Immunization = {
      resourceType: 'Immunization',
      id: this.mapId(substanceAdmin.id),
      identifier: this.mapIdentifiers(substanceAdmin.id),
      status: IMMUNIZATION_STATUS_MAPPER.mapCcdaToFhirWithDefault(substanceAdmin.statusCode?.['@_code'], 'completed'),
      vaccineCode: this.mapCode(
        consumable.manufacturedProduct?.[0]?.manufacturedMaterial?.[0]?.code?.[0]
      ) as CodeableConcept,
      patient: createReference(this.patient as Patient),
      occurrenceDateTime: mapCcdaToFhirDateTime(substanceAdmin.effectiveTime?.[0]?.['@_value']),
      lotNumber: consumable.manufacturedProduct?.[0]?.manufacturedMaterial?.[0]?.lotNumberText?.[0],
    };

    if (substanceAdmin.performer) {
      result.performer = this.mapCcdaPerformerArrayToImmunizationPerformerArray(substanceAdmin.performer);
    }

    result.extension = this.mapTextReference(substanceAdmin.text);

    if (substanceAdmin.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization?.[0]) {
      result.manufacturer = {
        display: substanceAdmin.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization?.[0]?.name?.[0],
      };
    }

    return result;
  }

  private processReaction(reactionObs: CcdaObservation): AllergyIntoleranceReaction {
    const reaction: AllergyIntoleranceReaction = {
      id: this.mapId(reactionObs.id),
      manifestation: [this.mapCode(reactionObs.value as CcdaCode)] as CodeableConcept[],
      onset: mapCcdaToFhirDateTime(reactionObs.effectiveTime?.[0]?.low?.['@_value']),
    };

    this.processSeverity(reactionObs, reaction);

    // Add reaction reference
    if (reaction.manifestation && reaction.manifestation.length > 0 && reactionObs.text?.reference?.['@_value']) {
      reaction.manifestation[0].extension = this.mapTextReference(reactionObs.text);
    }

    return reaction;
  }

  private processSeverity(reactionObs: CcdaObservation, reaction: AllergyIntoleranceReaction): void {
    const severityObs = reactionObs.entryRelationship?.find((rel) => rel['@_typeCode'] === 'SUBJ')?.observation?.[0];
    if (!severityObs) {
      return;
    }

    const severityCode = (severityObs.value as CcdaCode)?.['@_code'];
    if (severityCode) {
      reaction.severity = ALLERGY_SEVERITY_MAPPER.mapCcdaToFhir(severityCode);
    }

    reaction.extension = this.mapTextReference(severityObs.text);
  }

  private mapEffectiveTimeToDateTime(effectiveTime: CcdaEffectiveTime | undefined): string | undefined {
    if (effectiveTime?.['@_value']) {
      return mapCcdaToFhirDateTime(effectiveTime['@_value']);
    }
    if (effectiveTime?.low?.['@_value']) {
      return mapCcdaToFhirDateTime(effectiveTime.low['@_value']);
    }
    return undefined;
  }

  private mapEffectiveTimeToPeriod(effectiveTime: CcdaEffectiveTime | undefined): Period | undefined {
    if (!effectiveTime?.['@_value'] && (effectiveTime?.low || effectiveTime?.high)) {
      return {
        start: mapCcdaToFhirDateTime(effectiveTime?.low?.['@_value']),
        end: mapCcdaToFhirDateTime(effectiveTime?.high?.['@_value']),
      };
    }
    return undefined;
  }

  private mapGenderCode(code: string | undefined): Patient['gender'] {
    if (!code) {
      return undefined;
    }
    const map: { [key: string]: Patient['gender'] } = {
      F: 'female',
      M: 'male',
      UN: 'unknown',
    };
    return map[code];
  }

  private getTelecomSystem(value: string | undefined): ContactPoint['system'] {
    if (!value) {
      return undefined;
    }
    if (value.startsWith('tel:')) {
      return 'phone';
    }
    if (value.startsWith('mailto:')) {
      return 'email';
    }
    return 'other';
  }

  private getTelecomValue(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    return value.replace(/^(tel:|mailto:)/, '');
  }

  private mapCode(code: CcdaCode | undefined): CodeableConcept | undefined {
    if (!code) {
      return undefined;
    }

    const system = normalizeCodeSystem(code['@_codeSystem']);
    if (!system) {
      return undefined;
    }

    const result = {
      coding: [
        {
          system: mapCcdaSystemToFhir(system),
          code: code['@_code'],
          display: code['@_displayName'],
        },
      ],
      text: code['@_displayName'],
    };

    if (code.translation) {
      for (const translation of code.translation) {
        const translationSystem = normalizeCodeSystem(translation['@_codeSystem']);
        if (translationSystem) {
          result.coding.push({
            system: mapCcdaSystemToFhir(translationSystem),
            code: translation['@_code'],
            display: translation['@_displayName'],
          });
        }
      }
    }

    return result;
  }

  private mapCodeToCoding(code: CcdaCode | undefined): Coding | undefined {
    if (!code) {
      return undefined;
    }

    return {
      system: mapCcdaSystemToFhir(code['@_codeSystem']),
      code: code['@_code'],
      display: code['@_displayName'],
    };
  }

  private createClinicalStatus(act: CcdaAct): CodeableConcept {
    return {
      coding: [
        {
          system: ALLERGY_CLINICAL_CODE_SYSTEM,
          code: ALLERGY_STATUS_MAPPER.mapCcdaToFhirWithDefault(act.statusCode?.['@_code'], 'active'),
        },
      ],
    };
  }

  private createVerificationStatus(): CodeableConcept {
    return {
      coding: [
        {
          system: ALLERGY_VERIFICATION_CODE_SYSTEM,
          code: 'confirmed',
        },
      ],
    };
  }

  private mapAuthorToReference(author: CcdaAuthor | undefined): Reference<Practitioner> | undefined {
    if (!author) {
      return undefined;
    }

    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: this.mapId(author.assignedAuthor?.id),
      identifier: this.mapIdentifiers(author.assignedAuthor?.id),
      name: this.mapCcdaNameArrayFhirHumanNameArray(author.assignedAuthor?.assignedPerson?.name),
      address: this.mapAddresses(author.assignedAuthor?.addr),
      telecom: this.mapTelecom(author.assignedAuthor?.telecom),
      qualification: author.assignedAuthor?.code
        ? [this.mapCode(author.assignedAuthor?.code) as PractitionerQualification]
        : undefined,
    };

    this.resources.push(practitioner);

    return createReference(practitioner);
  }

  private mapAssignedEntityToReference(
    assignedEntity: CcdaAssignedEntity | undefined
  ): Reference<PractitionerRole> | undefined {
    if (!assignedEntity) {
      return undefined;
    }

    const assignedPerson = assignedEntity.assignedPerson;
    const representedOrganization = assignedEntity.representedOrganization;

    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: this.mapId(assignedEntity?.id),
      identifier: this.mapIdentifiers(assignedEntity?.id),
      name: this.mapCcdaNameArrayFhirHumanNameArray(assignedPerson?.name),
      address: this.mapAddresses(assignedEntity?.addr),
      telecom: this.mapTelecom(assignedEntity?.telecom),
    };

    this.resources.push(practitioner);

    const organization: Organization = {
      resourceType: 'Organization',
      id: this.mapId(assignedEntity?.id),
      identifier: this.mapIdentifiers(representedOrganization?.id),
      name: representedOrganization?.name?.[0],
      address: this.mapAddresses(representedOrganization?.addr),
    };
    this.resources.push(organization);

    const practitionerRole: PractitionerRole = {
      resourceType: 'PractitionerRole',
      id: this.mapId(assignedEntity?.id),
      practitioner: createReference(practitioner),
      organization: createReference(organization),
    };
    this.resources.push(practitionerRole);

    return createReference(practitionerRole);
  }

  private mapCustodianToReference(custodian: CcdaCustodian | undefined): Reference<Organization> | undefined {
    if (!custodian) {
      return undefined;
    }

    const organization: Organization = {
      resourceType: 'Organization',
      id: this.mapId(custodian.assignedCustodian.representedCustodianOrganization.id),
      identifier: this.mapIdentifiers(custodian.assignedCustodian.representedCustodianOrganization.id),
      name: custodian.assignedCustodian.representedCustodianOrganization.name?.[0],
      address: this.mapAddresses(custodian.assignedCustodian.representedCustodianOrganization.addr),
      telecom: this.mapTelecom(custodian.assignedCustodian.representedCustodianOrganization.telecom),
    };

    this.resources.push(organization);

    return createReference(organization);
  }

  private mapDocumentationOfToEvent(documentationOf: CcdaDocumentationOf | undefined): CompositionEvent[] | undefined {
    if (!documentationOf) {
      return undefined;
    }

    const serviceEvent = documentationOf.serviceEvent;
    if (!serviceEvent) {
      return undefined;
    }

    return [
      {
        code: serviceEvent.code ? [this.mapCode(serviceEvent.code) as CodeableConcept] : undefined,
        period: this.mapEffectiveTimeToPeriod(serviceEvent.effectiveTime?.[0]),
      },
    ];
  }

  private concatArrays<T>(array1: T[] | undefined, array2: T[] | undefined): T[] | undefined {
    if (!array1) {
      return array2;
    }
    if (!array2) {
      return array1;
    }
    return [...array1, ...array2];
  }

  private mapCcdaPerformerArrayToImmunizationPerformerArray(performers: CcdaPerformer[]): ImmunizationPerformer[] {
    const result: ImmunizationPerformer[] = [];

    for (const performer of performers) {
      const entity = performer.assignedEntity;
      const reference = this.mapAssignedEntityToReference(entity);
      if (reference) {
        result.push({ actor: reference });
      }
    }

    return result;
  }

  private processOrganizer(section: CcdaSection, organizer: CcdaOrganizer): Resource {
    const templateId = section.templateId[0]['@_root'];
    if (templateId === OID_CARE_TEAMS_SECTION) {
      return this.processCareTeamOrganizer(organizer);
    }
    return this.processVitalsOrganizer(organizer);
  }

  private processCareTeamOrganizer(organizer: CcdaOrganizer): CareTeam {
    const participants: CareTeamParticipant[] = [];

    if (organizer.component) {
      for (const component of organizer.component) {
        const participant = this.processCareTeamMember(component);
        if (participant) {
          participants.push(participant);
        }
      }
    }

    const result: CareTeam = {
      resourceType: 'CareTeam',
      id: this.mapId(organizer.id),
      identifier: this.mapIdentifiers(organizer.id),
      participant: participants.length > 0 ? participants : undefined,
    };

    return result;
  }

  private processCareTeamMember(component: CcdaOrganizerComponent): CareTeamParticipant | undefined {
    const act = component.act?.[0];
    if (!act) {
      return undefined;
    }

    const performer = act.performer?.[0];
    if (!performer) {
      return undefined;
    }

    return {
      role: performer.functionCode ? [this.mapCode(performer.functionCode) as CodeableConcept] : undefined,
      member: this.mapAssignedEntityToReference(performer.assignedEntity),
      period: this.mapEffectiveTimeToPeriod(act.effectiveTime?.[0]),
    };
  }

  private processVitalsOrganizer(organizer: CcdaOrganizer): Observation {
    const result: Observation = {
      resourceType: 'Observation',
      id: this.mapId(organizer.id),
      identifier: this.mapIdentifiers(organizer.id),
      status: 'final',
      category: this.mapObservationTemplateIdToObservationCategory(organizer.templateId),
      code: this.mapCode(organizer.code) as CodeableConcept,
      subject: createReference(this.patient as Patient),
    };

    if (organizer.effectiveTime?.[0]?.['@_value']) {
      result.effectiveDateTime = mapCcdaToFhirDateTime(organizer.effectiveTime?.[0]?.['@_value']);
    }

    if (organizer.component) {
      const members: Reference<Observation>[] = [];
      for (const component of organizer.component) {
        members.push(...this.processVitalsComponent(component));
      }

      if (members.length > 0) {
        result.hasMember = members;
      }
    }
    return result;
  }

  private processVitalsComponent(component: CcdaOrganizerComponent): Reference<Observation>[] {
    const result: Reference<Observation>[] = [];
    if (component.observation) {
      for (const observation of component.observation) {
        const child = this.processVitalsObservation(observation);
        result.push(createReference(child));
        this.resources.push(child);
      }
    }
    return result;
  }

  private processObservation(section: CcdaSection, observation: CcdaObservation): Resource {
    const observationTemplateId = observation.templateId[0]['@_root'];
    if (observationTemplateId === OID_GOALS_SECTION || observationTemplateId === OID_GOAL_OBSERVATION) {
      // Goal template
      return this.processGoalObservation(observation);
    }

    const sectionTemplateId = section.templateId[0]['@_root'];
    switch (sectionTemplateId) {
      case OID_PLAN_OF_CARE_SECTION:
      case OID_GOALS_SECTION:
        return this.processGoalObservation(observation);
      default:
        // Treat this as a normal observation by default
        return this.processVitalsObservation(observation);
    }
  }

  private processGoalObservation(observation: CcdaObservation): Goal {
    const result: Goal = {
      resourceType: 'Goal',
      id: this.mapId(observation.id),
      identifier: this.mapIdentifiers(observation.id),
      lifecycleStatus: this.mapGoalLifecycleStatus(observation),
      description: this.mapCode(observation.code) as CodeableConcept,
      subject: createReference(this.patient as Patient),
      startDate: mapCcdaToFhirDate(observation.effectiveTime?.[0]?.['@_value']),
      // note: this.mapNote(observation.text),
    };

    result.target = observation.entryRelationship?.map((entryRelationship) => {
      return {
        measure: this.mapCode(entryRelationship.act?.[0]?.code) as CodeableConcept,
        detailCodeableConcept: this.mapCode(entryRelationship.act?.[0]?.code) as CodeableConcept,
        dueDate: mapCcdaToFhirDateTime(entryRelationship.act?.[0]?.effectiveTime?.[0]?.low?.['@_value']),
      };
    });

    result.extension = this.mapTextReference(observation.text);

    return result;
  }

  private mapGoalLifecycleStatus(observation: CcdaObservation): Goal['lifecycleStatus'] {
    // - Map from observation's `statusCode/@code`
    // - Mapping logic:
    //   - If statusCode is "active" → "active"
    //   - If statusCode is "completed" → "achieved"
    //   - If statusCode is "cancelled" → "cancelled"
    //   - If statusCode is "aborted" → "cancelled"
    //   - If no status or other value → "active"
    const map: { [key: string]: Goal['lifecycleStatus'] } = {
      active: 'active',
      completed: 'completed',
      cancelled: 'cancelled',
      aborted: 'cancelled',
    };
    return map[observation.statusCode['@_code'] ?? 'active'];
  }

  private processVitalsObservation(observation: CcdaObservation): Observation {
    const result: Observation = {
      resourceType: 'Observation',
      id: this.mapId(observation.id),
      identifier: this.mapIdentifiers(observation.id),
      status: 'final',
      category: this.mapObservationTemplateIdToObservationCategory(observation.templateId),
      code: this.mapCode(observation.code) as CodeableConcept,
      subject: createReference(this.patient as Patient),
      referenceRange: this.mapReferenceRangeArray(observation.referenceRange),
      performer: observation.author
        ?.map((author) => this.mapAuthorToReference(author))
        .filter(Boolean) as Reference<Practitioner>[],
    };

    if (observation.value?.['@_xsi:type']) {
      switch (observation.value['@_xsi:type']) {
        case 'PQ': // Physical Quantity
        case 'CO': // Count of individuals
          result.valueQuantity = {
            value: observation.value['@_value'] ? parseFloat(observation.value['@_value']) : undefined,
            unit: observation.value['@_unit'],
            system: UCUM,
            code: observation.value['@_unit'],
          };
          break;

        case 'CD': // Code
        case 'CE': // Code with Extensions
          result.valueCodeableConcept = this.mapCode(observation.value);
          break;

        case 'ST': // String
          result.valueString = observation.value['#text'] ?? '';
          break;

        default:
          console.warn(`Unhandled observation value type: ${observation.value['@_xsi:type']}`);
      }
    }

    if (observation.effectiveTime?.[0]?.['@_value']) {
      result.effectiveDateTime = mapCcdaToFhirDateTime(observation.effectiveTime?.[0]?.['@_value']);
    }

    result.extension = this.mapTextReference(observation.text);

    return result;
  }

  private mapObservationTemplateIdToObservationCategory(
    templateIds: CcdaTemplateId[] | undefined
  ): CodeableConcept[] | undefined {
    if (!templateIds) {
      return undefined;
    }

    const codes = new Set<string>();
    const result: CodeableConcept[] = [];

    for (const templateId of templateIds) {
      const category = OBSERVATION_CATEGORY_MAPPER.mapCcdaToFhirCodeableConcept(templateId['@_root']);
      if (category?.coding?.[0]?.code && !codes.has(category.coding[0].code)) {
        codes.add(category.coding[0].code);
        result.push(category);
      }
    }

    return Array.from(result.values());
  }

  private mapReferenceRangeArray(
    referenceRange: CcdaReferenceRange[] | undefined
  ): ObservationReferenceRange[] | undefined {
    if (!referenceRange || referenceRange.length === 0) {
      return undefined;
    }

    return referenceRange.map((r) => this.mapReferenceRange(r)).filter(Boolean) as ObservationReferenceRange[];
  }

  private mapReferenceRange(referenceRange: CcdaReferenceRange | undefined): ObservationReferenceRange | undefined {
    if (!referenceRange) {
      return undefined;
    }

    const observationRange = referenceRange.observationRange;
    if (!observationRange) {
      return undefined;
    }

    const result: ObservationReferenceRange = {};

    result.extension = this.mapTextReference(observationRange.text);

    return result;
  }

  private processEncounter(section: CcdaSection, encounter: CcdaEncounter): Encounter {
    // Create the main encounter resource
    const result: Encounter = {
      resourceType: 'Encounter',
      id: this.mapId(encounter.id),
      identifier: this.mapIdentifiers(encounter.id),
      status: ENCOUNTER_STATUS_MAPPER.mapCcdaToFhirWithDefault(encounter.statusCode?.['@_code'], 'unknown'),
      class: {
        system: ACT_CODE_SYSTEM,
        code: encounter.code?.['@_code'] ?? 'AMB',
        display: encounter.code?.['@_displayName'] ?? 'Ambulatory',
      },
      type: encounter.code ? [this.mapCode(encounter.code) as CodeableConcept] : undefined,
      subject: createReference(this.patient as Patient),
      period: this.mapEffectiveTimeToPeriod(encounter.effectiveTime?.[0]),
    };

    // Add participant information
    if (encounter.performer) {
      result.participant = encounter.performer.map((performer: CcdaPerformer) => ({
        type: [
          {
            coding: [
              {
                system: PARTICIPATION_CODE_SYSTEM,
                code: performer['@_typeCode'] ?? 'PPRF',
                display: 'Primary Performer',
              },
            ],
          },
        ],
        individual: this.mapAssignedEntityToReference(performer.assignedEntity),
      }));
    }

    // Add diagnoses from entryRelationships
    if (encounter.entryRelationship) {
      const diagnoses = encounter.entryRelationship
        .filter((rel: CcdaEntryRelationship) => rel['@_typeCode'] === 'RSON')
        .map((rel: CcdaEntryRelationship) => {
          const observation = rel.observation?.[0];
          if (!observation) {
            return undefined;
          }

          // Create Condition resource
          const condition: Condition = {
            resourceType: 'Condition',
            id: this.mapId(observation.id),
            identifier: this.mapIdentifiers(observation.id),
            clinicalStatus: {
              coding: [
                {
                  system: CLINICAL_CONDITION_CODE_SYSTEM,
                  code: 'active',
                },
              ],
            },
            verificationStatus: {
              coding: [
                {
                  system: CONDITION_VER_STATUS_CODE_SYSTEM,
                  code: 'confirmed',
                },
              ],
            },
            code: this.mapCode(observation.value as CcdaCode),
            subject: createReference(this.patient as Patient),
            onsetDateTime: mapCcdaToFhirDateTime(observation.effectiveTime?.[0]?.low?.['@_value']),
          };

          // Add condition to resources array
          this.resources.push(condition);

          return {
            condition: createReference(condition),
            use: {
              coding: [
                {
                  system: DIAGNOSIS_ROLE_CODE_SYSTEM,
                  code: 'AD',
                  display: 'Admission diagnosis',
                },
              ],
            },
          };
        })
        .filter(Boolean) as EncounterDiagnosis[];

      if (diagnoses.length > 0) {
        result.diagnosis = diagnoses;
      }
    }

    result.extension = this.mapTextReference(encounter.text);

    return result;
  }

  private processProcedure(section: CcdaSection, procedure: CcdaProcedure): Procedure {
    const result: Procedure = {
      resourceType: 'Procedure',
      id: this.mapId(procedure.id),
      identifier: this.mapIdentifiers(procedure.id),
      status: PROCEDURE_STATUS_MAPPER.mapCcdaToFhirWithDefault(procedure.statusCode?.['@_code'], 'completed'),
      code: this.mapCode(procedure.code),
      subject: createReference(this.patient as Patient),
      performedPeriod: this.mapEffectiveTimeToPeriod(procedure.effectiveTime?.[0]),
      bodySite: procedure.targetSiteCode ? [this.mapCode(procedure.targetSiteCode) as CodeableConcept] : undefined,
      extension: this.mapTextReference(procedure.text),
    };

    return result;
  }

  private mapTextReference(text: string | CcdaText | undefined): Extension[] | undefined {
    if (!text || typeof text !== 'object') {
      return undefined;
    }

    if (!text?.reference?.['@_value']) {
      return undefined;
    }

    return [
      {
        url: CCDA_NARRATIVE_REFERENCE_URL,
        valueString: text.reference?.['@_value'],
      },
    ];
  }
}

function nodeToString(node: CcdaText | string | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'object' && '#text' in node) {
    return node['#text'];
  }
  return undefined;
}
