// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { capitalize, generateId, getExtension } from '@medplum/core';
import {
  Address,
  AllergyIntolerance,
  Bundle,
  CarePlan,
  CareTeam,
  ClinicalImpression,
  CodeableConcept,
  Composition,
  CompositionEvent,
  CompositionSection,
  Condition,
  ContactPoint,
  Device,
  DeviceUseStatement,
  DiagnosticReport,
  DosageDoseAndRate,
  Encounter,
  EncounterDiagnosis,
  Extension,
  ExtractResource,
  Goal,
  HumanName,
  Identifier,
  Immunization,
  ImmunizationPerformer,
  Location,
  MedicationRequest,
  Narrative,
  Observation,
  ObservationComponent,
  ObservationReferenceRange,
  Organization,
  Patient,
  Period,
  Practitioner,
  PractitionerRole,
  Procedure,
  Reference,
  RelatedPerson,
  Resource,
  ResourceType,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { mapFhirToCcdaDate, mapFhirToCcdaDateTime } from './datetime';
import {
  OID_ACT_CLASS_CODE_SYSTEM,
  OID_ACT_CODE_CODE_SYSTEM,
  OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM,
  OID_ALLERGY_OBSERVATION,
  OID_ALLERGY_PROBLEM_ACT,
  OID_ASSESSMENTS_SECTION,
  OID_AUTHOR_PARTICIPANT,
  OID_BIRTH_SEX,
  OID_CARE_TEAM_ORGANIZER_ENTRY,
  OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
  OID_ENCOUNTER_ACTIVITIES,
  OID_ENCOUNTER_LOCATION,
  OID_FDA_CODE_SYSTEM,
  OID_GOAL_OBSERVATION,
  OID_HEALTH_CONCERN_ACT,
  OID_HL7_REGISTERED_MODELS,
  OID_IMMUNIZATION_ACTIVITY,
  OID_IMMUNIZATION_MEDICATION_INFORMATION,
  OID_INSTRUCTIONS,
  OID_LOINC_CODE_SYSTEM,
  OID_MEDICATION_ACTIVITY,
  OID_MEDICATION_FREE_TEXT_SIG,
  OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL,
  OID_NOTE_ACTIVITY,
  OID_PATIENT_REFERRAL_ACTIVITY_OBSERVATION,
  OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION,
  OID_PROBLEM_ACT,
  OID_PROBLEM_OBSERVATION,
  OID_PROCEDURE_ACTIVITY_ACT,
  OID_PROCEDURE_ACTIVITY_OBSERVATION,
  OID_PROCEDURE_ACTIVITY_PROCEDURE,
  OID_PRODUCT_INSTANCE,
  OID_REACTION_OBSERVATION,
  OID_REASON_FOR_REFERRAL,
  OID_RESULT_OBSERVATION,
  OID_RESULT_ORGANIZER,
  OID_SEVERITY_OBSERVATION,
  OID_SEX_OBSERVATION,
  OID_SMOKING_STATUS_OBSERVATION,
  OID_SNOMED_CT_CODE_SYSTEM,
  OID_TOBACCO_USE_OBSERVATION,
  OID_VITAL_SIGNS_OBSERVATION,
  OID_VITAL_SIGNS_ORGANIZER,
} from './oids';
import {
  ADDRESS_USE_MAPPER,
  ALLERGY_CATEGORY_MAPPER,
  ALLERGY_SEVERITY_MAPPER,
  ALLERGY_STATUS_MAPPER,
  CCDA_NARRATIVE_REFERENCE_URL,
  CONFIDENTIALITY_MAPPER,
  GENDER_MAPPER,
  HUMAN_NAME_USE_MAPPER,
  IMMUNIZATION_STATUS_MAPPER,
  LOINC_ADMINISTRATIVE_SEX,
  LOINC_ASSESSMENTS_SECTION,
  LOINC_BIRTH_SEX,
  LOINC_CONDITION,
  LOINC_GOALS_SECTION,
  LOINC_HEALTH_CONCERNS_SECTION,
  LOINC_HISTORY_OF_TOBACCO_USE,
  LOINC_MEDICATION_INSTRUCTIONS,
  LOINC_NOTES_SECTION,
  LOINC_OVERALL_GOAL,
  LOINC_PLAN_OF_TREATMENT_SECTION,
  LOINC_PROBLEMS_SECTION,
  LOINC_REASON_FOR_REFERRAL_SECTION,
  LOINC_REFERRAL_NOTE,
  LOINC_SUMMARY_OF_EPISODE_NOTE,
  LOINC_TOBACCO_SMOKING_STATUS,
  mapCodeableConceptToCcdaCode,
  mapCodeableConceptToCcdaValue,
  mapFhirSystemToCcda,
  MEDICATION_STATUS_MAPPER,
  PROBLEM_STATUS_MAPPER,
  TELECOM_USE_MAPPER,
  US_CORE_ETHNICITY_URL,
  US_CORE_RACE_URL,
} from './systems';
import { CCDA_TEMPLATE_IDS, LOINC_TO_TEMPLATE_IDS, REFERRAL_TEMPLATE_IDS } from './templates';
import {
  Ccda,
  CcdaAddr,
  CcdaAuthor,
  CcdaCode,
  CcdaCustodian,
  CcdaDocumentationOf,
  CcdaEffectiveTime,
  CcdaEntry,
  CcdaEntryRelationship,
  CcdaId,
  CcdaInformationRecipient,
  CcdaLanguageCommunication,
  CcdaName,
  CcdaNarrative,
  CcdaObservation,
  CcdaOrganizer,
  CcdaOrganizerComponent,
  CcdaParticipant,
  CcdaPatient,
  CcdaPerformer,
  CcdaQuantity,
  CcdaRecordTarget,
  CcdaReference,
  CcdaReferenceRange,
  CcdaSection,
  CcdaSubstanceAdministration,
  CcdaTelecom,
  CcdaTemplateId,
  CcdaText,
  CcdaTimeStamp,
  CcdaValue,
} from './types';
import { parseXml } from './xml';

export interface FhirToCcdaOptions {
  /**
   * Type of C-CDA document to generate.
   */
  type?: 'referral' | 'discharge' | 'summary';
}

/**
 * Convert a FHIR bundle to a C-CDA document.
 * @param bundle - The FHIR bundle to convert.
 * @param options - Optional options.
 * @returns The C-CDA document.
 */
export function convertFhirToCcda(bundle: Bundle, options?: FhirToCcdaOptions): Ccda {
  return new FhirToCcdaConverter(bundle, options).convert();
}

/**
 * The FhirToCcdaConverter class is responsible for converting a FHIR bundle to a C-CDA document.
 */
class FhirToCcdaConverter {
  private readonly bundle: Bundle;
  private readonly options: FhirToCcdaOptions | undefined;
  private readonly composition: Composition;
  private readonly patient: Patient;

  /**
   * Creates a new FhirToCcdaConverter for the given FHIR bundle.
   * @param bundle - The FHIR bundle to convert.
   * @param options - Optional options.
   */
  constructor(bundle: Bundle, options?: FhirToCcdaOptions) {
    this.bundle = bundle;
    this.options = options;

    const composition = this.findResource('Composition');
    if (!composition) {
      throw new Error('Composition not found');
    }

    const patient = this.findResource('Patient');
    if (!patient) {
      throw new Error('Patient not found');
    }

    this.composition = composition;
    this.patient = patient;
  }

  /**
   * Convert the FHIR bundle to a C-CDA document.
   * @returns The C-CDA document.
   */
  convert(): Ccda {
    const sections = this.createSections();

    const referral = this.composition.section
      ?.find((s) => s.code?.coding?.[0]?.code === LOINC_REASON_FOR_REFERRAL_SECTION)
      ?.entry?.find((e) => e.reference?.startsWith('ServiceRequest/')) as Reference<ServiceRequest> | undefined;

    let templateId: CcdaTemplateId[];
    let code: CcdaCode | undefined;

    if (this.options?.type === 'referral') {
      templateId = REFERRAL_TEMPLATE_IDS;
      code = {
        '@_code': LOINC_REFERRAL_NOTE,
        '@_displayName': 'Referral Note',
        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
        '@_codeSystemName': 'LOINC',
      };
    } else {
      templateId = CCDA_TEMPLATE_IDS;
      code = {
        '@_code': LOINC_SUMMARY_OF_EPISODE_NOTE,
        '@_displayName': 'Summarization of Episode Note',
        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
        '@_codeSystemName': 'LOINC',
      };
    }

    // Be careful! Order is important!
    // Validate changes with ETT: https://ett.healthit.gov/ett/#/validators/ccdauscidv3#ccdaValdReport
    return {
      realmCode: {
        '@_code': 'US',
      },
      typeId: {
        '@_root': OID_HL7_REGISTERED_MODELS,
        '@_extension': 'POCD_HD000040',
      },
      templateId,
      id: this.mapIdentifiers(this.composition.id, undefined),
      code,
      title: this.composition.title,
      effectiveTime: this.mapEffectiveTime(this.composition.date, undefined),
      confidentialityCode: this.composition.confidentiality
        ? CONFIDENTIALITY_MAPPER.mapFhirToCcdaCode(this.composition.confidentiality)
        : undefined,
      // Consol US Realm Header SHALL contain exactly one [1..1] languageCode,
      // which SHALL be selected from ValueSet Language 2.16.840.1.113883.1.11.11526 DYNAMIC (CONF:5372, R2.1=CONF:1198-5372, DSTU:806)
      languageCode: { '@_code': this.composition.language ?? 'en-US' },
      recordTarget: this.createRecordTarget(),
      author: this.mapAuthor(this.composition.author?.[0], this.composition.date, true),
      custodian: this.mapCustodian(this.composition.custodian),
      informationRecipient: this.mapRecipient(referral),
      documentationOf: this.mapDocumentationOf(this.composition.event),
      component:
        sections.length > 0
          ? {
              structuredBody: {
                component: sections.map((section) => ({
                  section: [section],
                })),
              },
            }
          : undefined,
    };
  }

  /**
   * Find a resource in the FHIR bundle by resource type.
   * @param resourceType - The type of resource to find.
   * @returns The resource if found, otherwise undefined.
   */
  private findResource<K extends ResourceType>(resourceType: K): ExtractResource<K> | undefined {
    return this.bundle.entry?.find((e) => e.resource?.resourceType === resourceType)?.resource as ExtractResource<K>;
  }

  /**
   * Find a resource in the FHIR bundle by reference.
   * @param reference - The reference to the resource.
   * @returns The resource if found, otherwise undefined.
   */
  private findResourceByReference<T extends Resource>(reference: Reference<T> | undefined): T | undefined {
    if (!reference?.reference) {
      return undefined;
    }
    const [resourceType, id] = reference.reference.split('/');
    if (!resourceType || !id) {
      return undefined;
    }
    return this.bundle.entry?.find((e) => e.resource?.resourceType === resourceType && e.resource?.id === id)
      ?.resource as T;
  }

  /**
   * Find resources in the FHIR bundle by references.
   * @param references - The references to the resources.
   * @returns The resources if found, otherwise undefined.
   */
  private findResourcesByReferences(references: Reference[] | undefined): Resource[] {
    if (!references) {
      return [];
    }
    return references.map((ref) => this.findResourceByReference(ref)).filter((r): r is Resource => !!r);
  }

  /**
   * Create the record target for the C-CDA document.
   * @returns The record target.
   */
  private createRecordTarget(): CcdaRecordTarget[] {
    if (!this.patient) {
      throw new Error('Patient not found');
    }

    return [
      {
        patientRole: {
          id: this.mapIdentifiers(this.patient.id, this.patient.identifier),
          addr: this.mapFhirAddressArrayToCcdaAddressArray(this.patient.address),
          telecom: this.mapTelecom(this.patient.telecom),
          patient: this.mapPatient(this.patient),
        },
      },
    ];
  }

  /**
   * Map the patient to the C-CDA patient.
   * @param patient - The patient to map.
   * @returns The C-CDA patient.
   */
  private mapPatient(patient: Patient): CcdaPatient {
    return {
      name: this.mapNames(patient.name),
      administrativeGenderCode: this.mapGender(patient.gender),
      birthTime: this.mapBirthDate(patient.birthDate),
      raceCode: this.mapRace(patient),
      'sdtc:raceCode': this.mapDetailedRace(patient),
      ethnicGroupCode: this.mapEthnicity(patient.extension),
      languageCommunication: this.mapLanguageCommunication(patient.communication),
    };
  }

  /**
   * Map the names to the C-CDA names.
   * @param names - The names to map.
   * @returns The C-CDA names.
   */
  private mapNames(names: HumanName[] | undefined): CcdaName[] | undefined {
    return names?.map((name) => ({
      '@_use': name.use ? HUMAN_NAME_USE_MAPPER.mapFhirToCcdaWithDefault(name.use, 'L') : undefined,
      prefix: name.prefix,
      family: name.family,
      given: name.given,
      suffix: name.suffix,
    }));
  }

  /**
   * Map the gender to the C-CDA gender.
   * @param gender - The gender to map.
   * @returns The C-CDA gender.
   */

  private mapGender(gender: Patient['gender']): CcdaCode | undefined {
    if (!gender) {
      return undefined;
    }
    return {
      '@_code': GENDER_MAPPER.mapFhirToCcda(gender),
      '@_displayName': gender ? capitalize(gender) : 'Unknown',
      '@_codeSystem': OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM,
      '@_codeSystemName': 'AdministrativeGender',
    };
  }

  /**
   * Map the birth date to the C-CDA birth date.
   * @param birthDate - The birth date to map.
   * @returns The C-CDA birth date.
   */
  private mapBirthDate(birthDate: string | undefined): CcdaTimeStamp | undefined {
    if (!birthDate) {
      return undefined;
    }
    return {
      '@_value': birthDate.replace(/-/g, ''),
    };
  }

  /**
   * Map the addresses to the C-CDA addresses.
   * @param addresses - The addresses to map.
   * @returns The C-CDA addresses.
   */
  private mapFhirAddressArrayToCcdaAddressArray(addresses: Address[] | undefined): CcdaAddr[] {
    if (!addresses || addresses.length === 0) {
      return [{ '@_nullFlavor': 'UNK' }];
    }
    return addresses.map((addr) => this.mapFhirAddressToCcdaAddress(addr)).filter(Boolean) as CcdaAddr[];
  }

  private mapFhirAddressToCcdaAddress(address: Address | undefined): CcdaAddr | undefined {
    if (!address) {
      return undefined;
    }
    const result: CcdaAddr = {
      '@_use': address.use ? ADDRESS_USE_MAPPER.mapFhirToCcda(address.use as 'home' | 'work') : undefined,
      streetAddressLine: address.line || [],
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    };

    return result;
  }

  /**
   * Map the race to the C-CDA race.
   * @param patient - The patient to map.
   * @returns The C-CDA race.
   */
  private mapRace(patient: Patient): CcdaCode[] | undefined {
    const ombCategory = getExtension(patient, US_CORE_RACE_URL, 'ombCategory')?.valueCoding;
    if (!ombCategory) {
      return [
        {
          '@_nullFlavor': 'UNK',
        },
      ];
    }

    return [
      {
        '@_code': ombCategory.code,
        '@_displayName': ombCategory.display,
        '@_codeSystem': OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
        '@_codeSystemName': 'CDC Race and Ethnicity',
      },
    ];
  }

  /**
   * Map the race to the C-CDA race.
   * @param patient - The patient to map.
   * @returns The C-CDA race.
   */
  private mapDetailedRace(patient: Patient): CcdaCode[] | undefined {
    const detailed = getExtension(patient, US_CORE_RACE_URL, 'detailed')?.valueCoding;
    if (!detailed) {
      return undefined;
    }

    return [
      {
        '@_code': detailed.code,
        '@_displayName': detailed.display,
        '@_codeSystem': OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
        '@_codeSystemName': 'CDC Race and Ethnicity',
      },
    ];
  }

  /**
   * Map the ethnicity to the C-CDA ethnicity.
   * @param extensions - The extensions to map.
   * @returns The C-CDA ethnicity.
   */
  private mapEthnicity(extensions: Extension[] | undefined): CcdaCode[] | undefined {
    const ethnicityExt = extensions?.find((e) => e.url === US_CORE_ETHNICITY_URL);
    const ombCategory = ethnicityExt?.extension?.find((e) => e.url === 'ombCategory')?.valueCoding;

    if (!ombCategory) {
      return [
        {
          '@_nullFlavor': 'UNK',
        },
      ];
    }

    return [
      {
        '@_code': ombCategory.code,
        '@_displayName': ombCategory.display,
        '@_codeSystem': OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
        '@_codeSystemName': 'CDC Race and Ethnicity',
      },
    ];
  }

  /**
   * Map the language communication to the C-CDA language communication.
   * @param communication - The communication to map.
   * @returns The C-CDA language communication.
   */
  private mapLanguageCommunication(communication: Patient['communication']): CcdaLanguageCommunication[] | undefined {
    if (!communication?.length) {
      return undefined;
    }

    return [
      {
        languageCode: { '@_code': communication[0].language?.coding?.[0]?.code },
      },
    ];
  }

  /**
   * Create the sections for the C-CDA document.
   * @returns The sections.
   */
  private createSections(): CcdaSection[] {
    const sections: CcdaSection[] = [];

    if (this.composition.section) {
      for (const section of this.composition.section) {
        sections.push(this.createSection(section));
      }
    }

    return sections;
  }

  private createSection(section: CompositionSection): CcdaSection {
    // Get the section code to determine type
    const sectionCode = section.code?.coding?.[0]?.code;
    if (!sectionCode) {
      throw new Error(`Missing section code: ${JSON.stringify(section.code)}`);
    }

    const templateId = LOINC_TO_TEMPLATE_IDS[sectionCode];
    if (!templateId) {
      throw new Error(`Unknown section code: ${sectionCode}`);
    }

    const resources = this.findResourcesByReferences(section.entry);

    // Assessments section is special case, because it does not have any "entry" elements
    // Instead, the entire clinical impression resource is included in the section
    if (
      sectionCode === LOINC_ASSESSMENTS_SECTION &&
      resources.length === 1 &&
      resources[0].resourceType === 'ClinicalImpression'
    ) {
      return this.createClinicalImpressionSection(section, resources[0] as ClinicalImpression);
    }

    if (
      sectionCode === LOINC_REASON_FOR_REFERRAL_SECTION &&
      resources.length === 1 &&
      resources[0].resourceType === 'ServiceRequest'
    ) {
      return this.createReasonForReferralSection(section, resources[0] as ServiceRequest);
    }

    return {
      templateId: templateId,
      code: mapCodeableConceptToCcdaCode(section.code),
      title: section.title,
      text: this.mapFhirTextDivToCcdaSectionText(section.text),
      entry: resources.map((resource) => this.createEntry(section, resource)).filter(Boolean) as CcdaEntry[],
      '@_nullFlavor': resources.length === 0 ? 'NI' : undefined,
    };
  }

  private createEntry(section: CompositionSection, resource: Resource): CcdaEntry | undefined {
    switch (resource.resourceType) {
      case 'AllergyIntolerance':
        return this.createAllergyEntry(resource as AllergyIntolerance);
      case 'CarePlan':
        return this.createPlanOfTreatmentCarePlanEntry(resource);
      case 'CareTeam':
        return this.createCareTeamEntry(resource);
      case 'ClinicalImpression':
        return this.createClinicalImpressionEntry(resource);
      case 'Condition':
        return this.createConditionEntry(section, resource);
      case 'DeviceUseStatement':
        return this.createDeviceUseStatementEntry(resource);
      case 'DiagnosticReport':
        return this.createDiagnosticReportEntry(resource);
      case 'Encounter':
        return this.createEncounterEntry(resource);
      case 'Goal':
        return this.createGoalEntry(section, resource);
      case 'Immunization':
        return this.createImmunizationEntry(resource as Immunization);
      case 'MedicationRequest':
        return this.createMedicationEntry(resource as MedicationRequest);
      case 'Procedure':
        return this.createHistoryOfProceduresEntry(resource) as CcdaEntry;
      case 'Observation':
        return this.createObservationEntry(resource as Observation);
      case 'ServiceRequest':
        return this.createPlanOfTreatmentServiceRequestEntry(resource as ServiceRequest);
      default:
        return undefined;
    }
  }

  private mapFhirTextDivToCcdaSectionText(text: Narrative | undefined): CcdaNarrative | undefined {
    if (!text) {
      return undefined;
    }

    const result = parseXml(text.div)?.div;

    if (result?.['@_xmlns']) {
      delete result['@_xmlns'];
    }

    return result;
  }

  /**
   * Create the C-CDA allergy entry for the FHIR allergy.
   * @param allergy - The FHIR allergy to create the C-CDA allergy entry for.
   * @returns The C-CDA allergy entry.
   */
  private createAllergyEntry(allergy: AllergyIntolerance): CcdaEntry {
    const reaction = allergy.reaction?.[0];
    return {
      act: [
        {
          '@_classCode': 'ACT',
          '@_moodCode': 'EVN',
          templateId: [
            {
              '@_root': OID_ALLERGY_PROBLEM_ACT,
            },
            {
              '@_root': OID_ALLERGY_PROBLEM_ACT,
              '@_extension': '2015-08-01',
            },
          ],
          id: this.mapIdentifiers(allergy.id, allergy.identifier),
          code: {
            '@_code': 'CONC',
            '@_codeSystem': OID_ACT_CLASS_CODE_SYSTEM,
          },
          statusCode: {
            '@_code': ALLERGY_STATUS_MAPPER.mapFhirToCcdaWithDefault(
              allergy.clinicalStatus?.coding?.[0]?.code,
              'active'
            ),
          },
          effectiveTime: this.mapEffectivePeriod(allergy.recordedDate, undefined),
          author: this.mapAuthor(allergy.recorder, allergy.recordedDate),
          text: this.createTextFromExtensions(allergy.extension),
          entryRelationship: [
            {
              '@_typeCode': 'SUBJ',
              observation: [
                {
                  '@_classCode': 'OBS',
                  '@_moodCode': 'EVN',
                  templateId: [
                    {
                      '@_root': OID_ALLERGY_OBSERVATION,
                    },
                    {
                      '@_root': OID_ALLERGY_OBSERVATION,
                      '@_extension': '2014-06-09',
                    },
                  ],
                  id: this.mapIdentifiers(allergy.id, allergy.identifier),
                  code: {
                    '@_code': 'ASSERTION',
                    '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
                  },
                  text: this.createTextFromExtensions(allergy.extension),
                  statusCode: {
                    '@_code': 'completed',
                  },
                  effectiveTime: this.mapEffectivePeriod(
                    allergy.onsetPeriod?.start ?? allergy.onsetDateTime,
                    allergy.onsetPeriod?.end,
                    true
                  ),
                  value: this.mapAllergyCategory(allergy.category),
                  author: this.mapAuthor(allergy.asserter, allergy.recordedDate),
                  participant: [
                    {
                      '@_typeCode': 'CSM',
                      participantRole: {
                        '@_classCode': 'MANU',
                        playingEntity: {
                          '@_classCode': 'MMAT',
                          code:
                            // Handle special case for "No known allergies"
                            // https://hl7.org/fhir/R4/allergyintolerance-nka.json.html
                            // C-CDA-Examples/Allergies/No Known Allergies
                            allergy.code?.coding?.[0]?.code === '716186003'
                              ? { '@_nullFlavor': 'NA' }
                              : {
                                  ...mapCodeableConceptToCcdaCode(allergy.code),
                                  originalText: allergy.code?.extension
                                    ? {
                                        reference: this.getNarrativeReference(allergy.code?.extension),
                                      }
                                    : undefined,
                                },
                        },
                      },
                    },
                  ],
                  entryRelationship: reaction
                    ? [
                        {
                          '@_typeCode': 'MFST',
                          '@_inversionInd': 'true',
                          observation: [
                            {
                              '@_classCode': 'OBS',
                              '@_moodCode': 'EVN',
                              templateId: [
                                {
                                  '@_root': OID_REACTION_OBSERVATION,
                                },
                                {
                                  '@_root': OID_REACTION_OBSERVATION,
                                  '@_extension': '2014-06-09',
                                },
                              ],
                              id: this.mapIdentifiers(reaction.id, undefined),
                              code: {
                                '@_code': 'ASSERTION',
                                '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
                              },
                              statusCode: {
                                '@_code': 'completed',
                              },
                              effectiveTime: this.mapEffectiveDate(allergy.onsetDateTime, allergy.onsetPeriod),
                              value: mapCodeableConceptToCcdaValue(reaction.manifestation?.[0]),
                              text: this.createTextFromExtensions(reaction.manifestation?.[0]?.extension),
                              entryRelationship: [
                                {
                                  '@_typeCode': 'SUBJ',
                                  '@_inversionInd': 'true',
                                  observation: [
                                    {
                                      '@_classCode': 'OBS',
                                      '@_moodCode': 'EVN',
                                      templateId: [
                                        {
                                          '@_root': OID_SEVERITY_OBSERVATION,
                                        },
                                        {
                                          '@_root': OID_SEVERITY_OBSERVATION,
                                          '@_extension': '2014-06-09',
                                        },
                                      ],
                                      code: {
                                        '@_code': 'SEV',
                                        '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
                                        '@_codeSystemName': 'ActCode',
                                      },
                                      statusCode: {
                                        '@_code': 'completed',
                                      },
                                      value: {
                                        '@_xsi:type': 'CD',
                                        '@_code': ALLERGY_SEVERITY_MAPPER.mapFhirToCcdaWithDefault(
                                          reaction.severity,
                                          'M'
                                        ),
                                        '@_displayName': reaction.severity ? capitalize(reaction.severity) : undefined,
                                        '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
                                        '@_codeSystemName': 'SNOMED CT',
                                      },
                                      text: this.createTextFromExtensions(reaction.extension),
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ]
                    : [],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  /**
   * Map the FHIR allergy category to the C-CDA allergy category.
   * @param category - The category to map.
   * @returns The C-CDA allergy category.
   */
  private mapAllergyCategory(category: AllergyIntolerance['category']): CcdaValue {
    let code = ALLERGY_CATEGORY_MAPPER.mapFhirToCcdaCode(category?.[0]);
    if (!code) {
      // Default to generic allergy if no category is provided
      code = {
        '@_code': '419199007',
        '@_displayName': 'Allergy to substance (disorder)',
        '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
        '@_codeSystemName': 'SNOMED CT',
      };
    }

    return { '@_xsi:type': 'CD', ...code };
  }

  /**
   * Map the FHIR author to the C-CDA author.
   * @param author - The author to map.
   * @param time - The time to map.
   * @param includeDevice - Whether to include device information.
   * @returns The C-CDA author.
   */
  private mapAuthor(
    author:
      | Reference<CareTeam | Device | Organization | Patient | Practitioner | PractitionerRole | RelatedPerson>
      | undefined,
    time?: string,
    includeDevice?: boolean
  ): CcdaAuthor[] | undefined {
    if (!author) {
      return undefined;
    }

    let mainResource = this.findResourceByReference(author);
    if (!mainResource) {
      return undefined;
    }

    let organization: Organization | undefined = undefined;

    if (mainResource.resourceType === 'Organization') {
      organization = mainResource;
    } else if (mainResource.resourceType === 'PractitionerRole') {
      organization = this.findResourceByReference(mainResource.organization);
      mainResource = this.findResourceByReference(mainResource.practitioner);
    }

    if (!mainResource) {
      return undefined;
    }

    let address: Address[] | undefined = undefined;
    if ('address' in mainResource) {
      address = (mainResource as Patient | RelatedPerson).address;
    }

    let telecom: ContactPoint[] | undefined = undefined;
    if ('telecom' in mainResource) {
      telecom = (mainResource as Patient | RelatedPerson).telecom;
    }

    let code: CodeableConcept | undefined = undefined;
    if ('qualification' in mainResource) {
      code = mainResource.qualification?.[0];
    }

    let humanName: HumanName[] | undefined = undefined;
    if (['Patient', 'Practitioner', 'RelatedPerson'].includes(mainResource.resourceType)) {
      humanName = (mainResource as Patient | Practitioner | RelatedPerson).name;
    }

    return [
      {
        templateId: [
          {
            '@_root': OID_AUTHOR_PARTICIPANT,
          },
        ],
        time: time ? { '@_value': mapFhirToCcdaDateTime(time) } : undefined,
        assignedAuthor: {
          id: this.mapIdentifiers(mainResource.id, mainResource.identifier),
          addr: this.mapFhirAddressArrayToCcdaAddressArray(address),
          telecom: this.mapTelecom(telecom),
          code: mapCodeableConceptToCcdaCode(code),
          assignedPerson: humanName ? { name: this.mapNames(humanName) } : undefined,
          assignedAuthoringDevice:
            !humanName && includeDevice ? { manufacturerModelName: 'Medplum', softwareName: 'Medplum' } : undefined,
          representedOrganization: organization?.name ? { name: [organization.name] } : undefined,
        },
      },
    ];
  }

  private mapCustodian(custodian: Reference<Organization> | undefined): CcdaCustodian | undefined {
    if (!custodian) {
      return undefined;
    }

    const organization = this.findResourceByReference(custodian);
    if (!organization) {
      return undefined;
    }

    return {
      assignedCustodian: {
        representedCustodianOrganization: {
          id: this.mapIdentifiers(organization.id, organization.identifier),
          name: organization.name ? [organization.name] : undefined,
          telecom: this.mapTelecom(organization.telecom),
          addr: this.mapFhirAddressArrayToCcdaAddressArray(organization.address),
        },
      },
    };
  }

  private mapRecipient(referral: Reference<ServiceRequest> | undefined): CcdaInformationRecipient | undefined {
    if (!referral) {
      return undefined;
    }

    const serviceRequest = this.findResourceByReference(referral);
    if (!serviceRequest) {
      return undefined;
    }

    const recipient = serviceRequest.performer;
    if (!recipient || recipient.length === 0) {
      return undefined;
    }

    const resource = this.findResourceByReference(recipient[0]);
    if (!resource || resource.resourceType !== 'Practitioner') {
      return undefined;
    }

    return {
      intendedRecipient: {
        informationRecipient: {
          name: this.mapNames(resource.name),
        },
      },
    };
  }

  private mapDocumentationOf(events: CompositionEvent[] | undefined): CcdaDocumentationOf | undefined {
    if (!events || events.length === 0) {
      return undefined;
    }

    const event = events[0];
    if (!event || (!event.code && !event.period)) {
      return undefined;
    }

    return {
      serviceEvent: {
        '@_classCode': 'PCPR',
        code: mapCodeableConceptToCcdaCode(event.code?.[0]),
        effectiveTime: this.mapEffectiveDate(undefined, event.period),
      },
    };
  }

  /**
   * Create the C-CDA medication entry for the FHIR medication.
   * @param med - The FHIR medication to create the C-CDA medication entry for.
   * @returns The C-CDA medication entry.
   */
  private createMedicationEntry(med: MedicationRequest): CcdaEntry {
    // Get medication details either from contained resource or inline concept
    const medication = med.contained?.find((r) => r.resourceType === 'Medication');
    const medicationCode = medication?.code || med.medicationCodeableConcept;
    const manufacturer = medication?.manufacturer;

    const effectiveTime: CcdaEffectiveTime[] = [];

    if (med.dispenseRequest?.validityPeriod) {
      const mapped = this.mapEffectiveDate(undefined, med.dispenseRequest.validityPeriod);
      if (mapped) {
        effectiveTime.push(...mapped);
      }
    }

    if (med.dosageInstruction?.[0]?.timing?.repeat?.period) {
      effectiveTime.push({
        '@_xsi:type': 'PIVL_TS',
        '@_institutionSpecified': 'true',
        '@_operator': 'A',
        period: {
          '@_value': med.dosageInstruction[0].timing.repeat.period.toString(),
          '@_unit': med.dosageInstruction[0].timing.repeat.periodUnit,
        },
      });
    }

    return {
      substanceAdministration: [
        {
          '@_classCode': 'SBADM',
          '@_moodCode': 'EVN',
          templateId: [
            { '@_root': OID_MEDICATION_ACTIVITY, '@_extension': '2014-06-09' },
            { '@_root': OID_MEDICATION_ACTIVITY },
          ],
          id: [{ '@_root': med.id || crypto.randomUUID() }],
          text: this.createTextFromExtensions(med.extension),
          statusCode: { '@_code': MEDICATION_STATUS_MAPPER.mapFhirToCcdaWithDefault(med.status, 'active') },
          effectiveTime,
          routeCode: this.mapMedicationRoute(med.dosageInstruction?.[0]?.route),
          doseQuantity: this.mapDoseQuantity(med.dosageInstruction?.[0]?.doseAndRate?.[0]),
          consumable: {
            '@_typeCode': 'CSM',
            manufacturedProduct: [
              {
                '@_classCode': 'MANU',
                templateId: [
                  { '@_root': OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL, '@_extension': '2014-06-09' },
                  { '@_root': OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL },
                ],
                manufacturedMaterial: [
                  {
                    code: [
                      {
                        ...(mapCodeableConceptToCcdaCode(medicationCode) as CcdaCode),
                        originalText: this.createTextFromExtensions(medication?.extension),
                      },
                    ],
                  },
                ],
                manufacturerOrganization: manufacturer
                  ? [
                      {
                        id: this.mapIdentifiers(
                          manufacturer.id,
                          manufacturer.identifier ? [manufacturer.identifier] : undefined
                        ),
                        name: [manufacturer.display as string],
                      },
                    ]
                  : undefined,
              },
            ],
          },
          author: this.mapAuthor(med.requester, med.authoredOn),
          entryRelationship: med.dosageInstruction
            ?.filter((instr) => !!instr.extension)
            ?.map((instr) => ({
              '@_typeCode': 'COMP',
              substanceAdministration: [
                {
                  '@_classCode': 'SBADM',
                  '@_moodCode': 'EVN',
                  templateId: [{ '@_root': OID_MEDICATION_FREE_TEXT_SIG }],
                  code: {
                    '@_code': LOINC_MEDICATION_INSTRUCTIONS,
                    '@_codeSystem': OID_LOINC_CODE_SYSTEM,
                    '@_codeSystemName': 'LOINC',
                    '@_displayName': 'Medication Instructions',
                  },
                  text: this.createTextFromExtensions(instr.extension),
                  consumable: {
                    manufacturedProduct: [
                      {
                        manufacturedLabeledDrug: [
                          {
                            '@_nullFlavor': 'NA',
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            })),
        },
      ],
    };
  }

  /**
   * Map the FHIR medication route to the C-CDA medication route.
   * @param route - The route to map.
   * @returns The C-CDA medication route.
   */
  private mapMedicationRoute(route: CodeableConcept | undefined): CcdaCode | undefined {
    if (!route) {
      return undefined;
    }
    return mapCodeableConceptToCcdaCode(route);
  }

  /**
   * Map the FHIR dose quantity to the C-CDA dose quantity.
   * @param doseAndRate - The dose and rate to map.
   * @returns The C-CDA dose quantity.
   */
  private mapDoseQuantity(doseAndRate: DosageDoseAndRate | undefined): CcdaQuantity | undefined {
    if (!doseAndRate?.doseQuantity) {
      return undefined;
    }

    return {
      '@_value': doseAndRate.doseQuantity.value?.toString(),
      '@_unit': doseAndRate.doseQuantity.unit,
    };
  }

  /**
   * Map the FHIR telecom to the C-CDA telecom.
   * @param contactPoints - The contact points to map.
   * @returns The C-CDA telecom.
   */
  private mapTelecom(contactPoints: ContactPoint[] | undefined): CcdaTelecom[] {
    if (!contactPoints || contactPoints.length === 0) {
      return [{ '@_nullFlavor': 'UNK' }];
    }
    return contactPoints?.map((cp) => ({
      '@_use': cp.use ? TELECOM_USE_MAPPER.mapFhirToCcda(cp.use as 'home' | 'work' | 'mobile') : undefined,
      '@_value': `${this.mapTelecomSystemToPrefix(cp.system)}${cp.value}`,
    }));
  }

  /**
   * Map the FHIR telecom system to the C-CDA telecom system.
   * @param system - The system to map.
   * @returns The C-CDA telecom system.
   */
  private mapTelecomSystemToPrefix(system: string | undefined): string {
    if (system === 'email') {
      return 'mailto:';
    }
    if (system === 'phone') {
      return 'tel:';
    }
    if (system === 'fax') {
      return 'fax:';
    }
    return '';
  }

  /**
   * Map the FHIR identifiers to the C-CDA identifiers.
   * @param id - The FHIR resource ID
   * @param identifiers - The FHIR identifiers to map.
   * @returns The C-CDA identifiers.
   */
  private mapIdentifiers(id: string | undefined, identifiers: Identifier[] | undefined): CcdaId[] | undefined {
    const result: CcdaId[] = [];

    if (id) {
      result.push({ '@_root': id });
    }

    if (identifiers) {
      for (const id of identifiers) {
        const root = mapFhirSystemToCcda(id.system);
        if (!root) {
          continue;
        }
        result.push({ '@_root': root, '@_extension': id.value });
      }
    }

    return result;
  }

  /**
   * Get the narrative reference from the FHIR extensions.
   * @param extensions - The extensions to get the narrative reference from.
   * @returns The C-CDA narrative reference.
   */
  private getNarrativeReference(extensions: Extension[] | undefined): CcdaReference | undefined {
    const ref = extensions?.find((e) => e.url === CCDA_NARRATIVE_REFERENCE_URL)?.valueString;

    return ref ? { '@_value': ref } : undefined;
  }

  /**
   * Create the C-CDA observation text for the FHIR observation.
   * @param extensions - The extensions to create the C-CDA observation text for.
   * @returns The C-CDA observation text.
   */
  private createTextFromExtensions(extensions: Extension[] | undefined): CcdaText | undefined {
    const ref = this.getNarrativeReference(extensions);
    return ref ? { reference: ref } : undefined;
  }

  private createConditionEntry(section: CompositionSection, condition: Condition): CcdaEntry | undefined {
    const sectionCode = section.code?.coding?.[0]?.code;
    if (sectionCode === LOINC_PROBLEMS_SECTION) {
      return this.createProblemEntry(condition);
    }
    if (sectionCode === LOINC_HEALTH_CONCERNS_SECTION) {
      return this.createHealthConcernEntry(condition);
    }
    return undefined;
  }

  private createProblemEntry(problem: Condition): CcdaEntry {
    return {
      act: [
        {
          '@_classCode': 'ACT',
          '@_moodCode': 'EVN',
          templateId: [{ '@_root': OID_PROBLEM_ACT }, { '@_root': OID_PROBLEM_ACT, '@_extension': '2015-08-01' }],
          id: this.mapIdentifiers(problem.id, undefined),
          code: {
            '@_code': 'CONC',
            '@_codeSystem': OID_ACT_CLASS_CODE_SYSTEM,
          },
          statusCode: {
            '@_code': PROBLEM_STATUS_MAPPER.mapFhirToCcdaWithDefault(
              problem.clinicalStatus?.coding?.[0]?.code,
              'active'
            ),
          },
          effectiveTime: this.mapEffectivePeriod(problem.recordedDate, undefined),
          entryRelationship: [
            {
              '@_typeCode': 'SUBJ',
              observation: [
                {
                  '@_classCode': 'OBS',
                  '@_moodCode': 'EVN',
                  templateId: [
                    { '@_root': OID_PROBLEM_OBSERVATION },
                    { '@_root': OID_PROBLEM_OBSERVATION, '@_extension': '2015-08-01' },
                  ],
                  id: problem.identifier
                    ? this.mapIdentifiers(undefined, problem.identifier)
                    : [
                        {
                          '@_root': generateId(),
                        },
                      ],
                  text: this.createTextFromExtensions(problem.extension),
                  code: {
                    '@_code': '55607006',
                    '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
                    '@_codeSystemName': 'SNOMED CT',
                    '@_displayName': 'Problem',
                    translation: [
                      {
                        '@_code': LOINC_CONDITION,
                        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
                        '@_codeSystemName': 'LOINC',
                        '@_displayName': 'Condition',
                      },
                    ],
                  },
                  statusCode: { '@_code': 'completed' },
                  effectiveTime: [
                    {
                      low: problem.onsetDateTime ? { '@_value': mapFhirToCcdaDate(problem.onsetDateTime) } : undefined,
                      high: problem.abatementDateTime
                        ? { '@_value': mapFhirToCcdaDateTime(problem.abatementDateTime) }
                        : undefined,
                    },
                  ],
                  value: mapCodeableConceptToCcdaValue(problem.code),
                  author: this.mapAuthor(problem.asserter, problem.recordedDate),
                },
              ],
            },
          ],
        },
      ],
    };
  }

  private createHealthConcernEntry(problem: Condition): CcdaEntry {
    return {
      act: [
        {
          '@_classCode': 'ACT',
          '@_moodCode': 'EVN',
          templateId: [
            { '@_root': OID_HEALTH_CONCERN_ACT, '@_extension': '2015-08-01' },
            { '@_root': OID_HEALTH_CONCERN_ACT, '@_extension': '2022-06-01' },
          ],
          id: this.mapIdentifiers(problem.id, undefined),
          code: {
            '@_code': LOINC_HEALTH_CONCERNS_SECTION,
            '@_codeSystem': OID_LOINC_CODE_SYSTEM,
            '@_codeSystemName': 'LOINC',
            '@_displayName': 'Health Concern',
          },
          statusCode: {
            '@_code': PROBLEM_STATUS_MAPPER.mapFhirToCcdaWithDefault(
              problem.clinicalStatus?.coding?.[0]?.code,
              'active'
            ),
          },
          effectiveTime: this.mapEffectivePeriod(problem.recordedDate, undefined),
        },
      ],
    };
  }

  private createImmunizationEntry(immunization: Immunization): CcdaEntry {
    const manufacturer = immunization?.manufacturer;
    const result = {
      substanceAdministration: [
        {
          '@_classCode': 'SBADM',
          '@_moodCode': 'EVN',
          '@_negationInd': 'false',
          templateId: [
            { '@_root': OID_IMMUNIZATION_ACTIVITY },
            { '@_root': OID_IMMUNIZATION_ACTIVITY, '@_extension': '2015-08-01' },
          ],
          id: this.mapIdentifiers(immunization.id, immunization.identifier),
          text: this.createTextFromExtensions(immunization.extension),
          statusCode: {
            '@_code': IMMUNIZATION_STATUS_MAPPER.mapFhirToCcdaWithDefault(immunization.status, 'completed'),
          },
          effectiveTime: [{ '@_value': mapFhirToCcdaDate(immunization.occurrenceDateTime) }],
          consumable: {
            manufacturedProduct: [
              {
                '@_classCode': 'MANU',
                templateId: [
                  { '@_root': OID_IMMUNIZATION_MEDICATION_INFORMATION },
                  { '@_root': OID_IMMUNIZATION_MEDICATION_INFORMATION, '@_extension': '2014-06-09' },
                ],
                manufacturedMaterial: [
                  {
                    code: [mapCodeableConceptToCcdaCode(immunization.vaccineCode) as CcdaCode],
                    lotNumberText: immunization.lotNumber ? [immunization.lotNumber] : undefined,
                  },
                ],
                manufacturerOrganization: manufacturer
                  ? [
                      {
                        id: this.mapIdentifiers(
                          manufacturer.id,
                          manufacturer.identifier ? [manufacturer.identifier] : undefined
                        ),
                        name: [manufacturer.display as string],
                      },
                    ]
                  : undefined,
              },
            ],
          },
        },
      ],
    } satisfies CcdaEntry;

    if (immunization.performer) {
      (result.substanceAdministration[0] as CcdaSubstanceAdministration).performer = immunization.performer
        .map((p) => this.mapImmunizationPerformerToCcdaPerformer(p))
        .filter(Boolean) as CcdaPerformer[];
    }

    return result;
  }

  /**
   * Map the FHIR author to the C-CDA performer.
   * @param performer - The performer to map.
   * @returns The C-CDA performer.
   */
  private mapImmunizationPerformerToCcdaPerformer(
    performer: ImmunizationPerformer | undefined
  ): CcdaPerformer | undefined {
    if (!performer) {
      return undefined;
    }

    const resource = this.findResourceByReference(performer.actor);
    if (!resource) {
      return undefined;
    }

    let practitioner: Practitioner | undefined = undefined;
    let organization: Organization | undefined = undefined;

    if (resource.resourceType === 'PractitionerRole') {
      practitioner = this.findResourceByReference(resource.practitioner) as Practitioner;
      organization = this.findResourceByReference(resource.organization) as Organization;
    } else if (resource.resourceType === 'Practitioner') {
      practitioner = resource as Practitioner;
    } else if (resource.resourceType === 'Organization') {
      organization = resource as Organization;
    }

    return {
      assignedEntity: {
        id: this.mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
        addr: this.mapFhirAddressArrayToCcdaAddressArray(practitioner?.address),
        telecom: this.mapTelecom(resource.telecom),
        assignedPerson: practitioner
          ? {
              id: this.mapIdentifiers(practitioner.id, practitioner.identifier) as CcdaId[],
              name: this.mapNames(practitioner.name),
            }
          : undefined,
        representedOrganization: organization
          ? {
              id: this.mapIdentifiers(organization.id, organization.identifier) as CcdaId[],
              name: organization.name ? [organization.name] : undefined,
              addr: this.mapFhirAddressArrayToCcdaAddressArray(organization.address),
              telecom: this.mapTelecom(organization.telecom),
            }
          : undefined,
      },
    };
  }

  private createObservationEntry(observation: Observation): CcdaEntry {
    if (observation.hasMember) {
      // Organizer
      return {
        organizer: [this.createVitalSignsOrganizer(observation)],
      };
    } else {
      // Direct observation
      return {
        observation: [this.createVitalSignObservation(observation)],
      };
    }
  }

  private createPlanOfTreatmentCarePlanEntry(resource: CarePlan): CcdaEntry | undefined {
    if (resource.status === 'completed') {
      return {
        act: [
          {
            '@_classCode': 'ACT',
            '@_moodCode': 'INT',
            templateId: [{ '@_root': OID_INSTRUCTIONS }],
            id: this.mapIdentifiers(resource.id, resource.identifier),
            code: mapCodeableConceptToCcdaValue(resource.category?.[0]) as CcdaCode,
            text: resource.description
              ? { '#text': resource.description }
              : this.createTextFromExtensions(resource.extension),
            statusCode: { '@_code': resource.status },
          },
        ],
      };
    }

    return undefined;
  }

  private createGoalEntry(section: CompositionSection, resource: Goal): CcdaEntry | undefined {
    const sectionCode = section.code?.coding?.[0]?.code;

    let templateId: CcdaTemplateId[];
    if (sectionCode === LOINC_PLAN_OF_TREATMENT_SECTION) {
      templateId = [{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }];
    } else if (sectionCode === LOINC_GOALS_SECTION) {
      templateId = [{ '@_root': OID_GOAL_OBSERVATION }];
    } else {
      return undefined;
    }

    let code: CcdaCode | undefined;
    if (sectionCode === LOINC_GOALS_SECTION) {
      code = {
        '@_code': LOINC_OVERALL_GOAL,
        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
        '@_codeSystemName': 'LOINC',
        '@_displayName': "Resident's overall goal established during assessment process",
      };
    } else if (resource.description) {
      code = mapCodeableConceptToCcdaCode(resource.description);
    } else {
      return undefined;
    }

    return {
      observation: [
        {
          '@_classCode': 'OBS',
          '@_moodCode': 'GOL',
          templateId,
          id: this.mapIdentifiers(resource.id, resource.identifier),
          code,
          statusCode: { '@_code': this.mapPlanOfTreatmentStatus(resource.lifecycleStatus) },
          effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.startDate) }],
          value: resource.description?.text ? { '@_xsi:type': 'ST', '#text': resource.description.text } : undefined,
          text: this.createTextFromExtensions(resource.extension),
          entryRelationship: resource.target?.map((target) => ({
            '@_typeCode': 'RSON',
            '@_inversionInd': 'true',
            act: [
              {
                '@_classCode': 'ACT',
                '@_moodCode': 'EVN',
                templateId: [
                  { '@_root': OID_PROCEDURE_ACTIVITY_ACT },
                  { '@_root': OID_PROCEDURE_ACTIVITY_ACT, '@_extension': '2014-06-09' },
                ],
                code: mapCodeableConceptToCcdaCode(target.measure) as CcdaCode,
                statusCode: { '@_code': 'completed' },
                effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.startDate) }],
              },
            ],
          })),
        },
      ],
    };
  }

  private mapPlanOfTreatmentStatus(status: string | undefined): string {
    switch (status) {
      case 'achieved':
        return 'completed';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'active';
    }
  }

  private createVitalSignsOrganizer(observation: Observation): CcdaOrganizer {
    const components: CcdaOrganizerComponent[] = [];

    if (observation.hasMember) {
      for (const member of observation.hasMember) {
        const child = this.findResourceByReference(member);
        if (!child || child.resourceType !== 'Observation') {
          continue;
        }

        if (child.component) {
          for (const component of child.component) {
            components.push({
              observation: [this.createVitalSignComponentObservation(child as Observation, component)],
            });
          }
        } else {
          components.push({
            observation: [this.createVitalSignObservation(child as Observation)],
          });
        }
      }
    }

    const result: CcdaOrganizer = {
      '@_classCode': 'CLUSTER',
      '@_moodCode': 'EVN',
      templateId: [
        { '@_root': OID_VITAL_SIGNS_ORGANIZER },
        { '@_root': OID_VITAL_SIGNS_ORGANIZER, '@_extension': '2015-08-01' },
      ],
      id: this.mapIdentifiers(observation.id, observation.identifier) as CcdaId[],
      code: mapCodeableConceptToCcdaCode(observation.code) as CcdaCode,
      statusCode: { '@_code': 'completed' },
      effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(observation.effectiveDateTime) }],
      component: components,
    };

    return result;
  }

  private createVitalSignObservation(observation: Observation): CcdaObservation {
    const result: CcdaObservation = {
      '@_classCode': 'OBS',
      '@_moodCode': 'EVN',
      templateId: this.mapObservationTemplateId(observation),
      id: this.mapIdentifiers(observation.id, observation.identifier) as CcdaId[],
      code: mapCodeableConceptToCcdaCode(observation.code),
      statusCode: { '@_code': 'completed' },
      effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(observation.effectiveDateTime) }],
      value: this.mapObservationValue(observation),
      referenceRange: this.mapReferenceRangeArray(observation.referenceRange),
      text: this.createTextFromExtensions(observation.extension),
      author: this.mapAuthor(observation.performer?.[0], observation.effectiveDateTime),
    };

    return result;
  }

  private createVitalSignComponentObservation(
    observation: Observation,
    component: ObservationComponent
  ): CcdaObservation {
    const result: CcdaObservation = {
      '@_classCode': 'OBS',
      '@_moodCode': 'EVN',
      templateId: this.mapObservationTemplateId(observation),
      id: this.mapIdentifiers(observation.id, observation.identifier) as CcdaId[],
      code: mapCodeableConceptToCcdaCode(component.code),
      statusCode: { '@_code': 'completed' },
      effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(observation.effectiveDateTime) }],
      value: this.mapObservationValue(component),
      referenceRange: this.mapReferenceRangeArray(component.referenceRange),
      text: this.createTextFromExtensions(component.extension),
      author: this.mapAuthor(observation.performer?.[0], observation.effectiveDateTime),
    };

    return result;
  }

  private mapObservationTemplateId(observation: Observation): CcdaTemplateId[] {
    const code = observation.code?.coding?.[0]?.code;
    const category = observation.category?.[0]?.coding?.[0]?.code;

    if (code === LOINC_TOBACCO_SMOKING_STATUS) {
      return [
        { '@_root': OID_SMOKING_STATUS_OBSERVATION },
        { '@_root': OID_SMOKING_STATUS_OBSERVATION, '@_extension': '2014-06-09' },
      ];
    }

    if (code === LOINC_HISTORY_OF_TOBACCO_USE) {
      return [
        { '@_root': OID_TOBACCO_USE_OBSERVATION },
        { '@_root': OID_TOBACCO_USE_OBSERVATION, '@_extension': '2014-06-09' },
      ];
    }

    if (code === LOINC_ADMINISTRATIVE_SEX) {
      return [{ '@_root': OID_SEX_OBSERVATION, '@_extension': '2023-06-28' }];
    }

    if (code === LOINC_BIRTH_SEX) {
      return [{ '@_root': OID_BIRTH_SEX }, { '@_root': OID_BIRTH_SEX, '@_extension': '2016-06-01' }];
    }

    if (category === 'exam') {
      return [
        { '@_root': OID_PROCEDURE_ACTIVITY_OBSERVATION },
        { '@_root': OID_PROCEDURE_ACTIVITY_OBSERVATION, '@_extension': '2014-06-09' },
      ];
    }

    if (category === 'laboratory') {
      return [{ '@_root': OID_RESULT_OBSERVATION }, { '@_root': OID_RESULT_OBSERVATION, '@_extension': '2015-08-01' }];
    }

    // Otherwise, fall back to the default template ID.
    return [
      { '@_root': OID_VITAL_SIGNS_OBSERVATION },
      { '@_root': OID_VITAL_SIGNS_OBSERVATION, '@_extension': '2014-06-09' },
    ];
  }

  private mapObservationValue(observation: Observation | ObservationComponent): CcdaValue | undefined {
    if (observation.valueQuantity) {
      return {
        '@_xsi:type': 'PQ',
        '@_unit': observation.valueQuantity.unit,
        '@_value': observation.valueQuantity.value?.toString(),
      };
    }

    if (observation.valueCodeableConcept) {
      return mapCodeableConceptToCcdaValue(observation.valueCodeableConcept);
    }

    if (observation.valueString) {
      return { '@_xsi:type': 'ST', '#text': observation.valueString };
    }

    return undefined;
  }

  private mapReferenceRangeArray(
    referenceRange: ObservationReferenceRange[] | undefined
  ): CcdaReferenceRange[] | undefined {
    if (!referenceRange || referenceRange.length === 0) {
      return undefined;
    }

    return referenceRange.map((range) => this.mapReferenceRange(range)).filter(Boolean) as CcdaReferenceRange[];
  }

  private mapReferenceRange(referenceRange: ObservationReferenceRange | undefined): CcdaReferenceRange | undefined {
    if (!referenceRange) {
      return undefined;
    }

    const narrativeReference = this.getNarrativeReference(referenceRange.extension);
    if (narrativeReference) {
      // Special case for reference ranges that are a narrative reference
      return {
        observationRange: {
          text: { reference: narrativeReference },
          value: { '@_xsi:type': 'ED', reference: narrativeReference },
        },
      };
    }

    return {
      observationRange: {
        text: this.createTextFromExtensions(referenceRange.extension),
      },
    };
  }

  private createHistoryOfProceduresEntry(resource: Procedure | Observation): CcdaEntry | undefined {
    if (resource.resourceType === 'Procedure') {
      // A <procedure> in C-CDA typically represents a direct intervention, like a surgery, that changes a patient's physical state.
      // In contrast, an <act> is a broader category encompassing actions that don't necessarily alter the physical state, such as counseling, education, or referrals.
      // The key distinction lies in whether the action primarily focuses on a physical change in the patient or a broader interaction or process.
      const actCodes = [
        // Counseling and Education:
        '183948003', // Patient education (procedure)
        '409063005', // Counseling (procedure)
        '311331002', // Patient counseling (procedure)
        '61310001', // Nutrition education (procedure)
        // Care Management:
        '183945009', // Referral to specialist (procedure)
        '309814009', // Discharge planning (procedure)
        '278373008', // Home visit (procedure)
        // Social Services:
        '410606002', // Social service procedure (procedure)
        '183933003', // Social work assessment (procedure)
        // Other:
        '24642003', // Psychiatry procedure or service (procedure)
        '225338006', // Physiotherapy procedure (procedure)
        '128939004', // First aid (procedure)
      ];
      const procedureCode = resource.code?.coding?.[0]?.code;
      if (procedureCode && actCodes.includes(procedureCode)) {
        // Create an <act> entry
        return {
          act: [
            {
              '@_classCode': 'ACT',
              '@_moodCode': 'EVN',
              templateId: [
                { '@_root': OID_PROCEDURE_ACTIVITY_ACT },
                { '@_root': OID_PROCEDURE_ACTIVITY_ACT, '@_extension': '2014-06-09' },
              ],
              id: this.mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
              code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
              statusCode: { '@_code': 'completed' },
              effectiveTime: this.mapEffectiveTime(resource.performedDateTime, resource.performedPeriod),
              text: this.createTextFromExtensions(resource.extension),
            },
          ],
        };
      }
      return {
        procedure: [
          {
            '@_classCode': 'PROC',
            '@_moodCode': 'EVN',
            templateId: [
              { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE },
              { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE, '@_extension': '2014-06-09' },
            ],
            id: this.mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
            code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
            statusCode: { '@_code': 'completed' },
            effectiveTime: this.mapEffectiveTime(resource.performedDateTime, resource.performedPeriod),
            text: this.createTextFromExtensions(resource.extension),
            targetSiteCode: mapCodeableConceptToCcdaCode(resource.bodySite?.[0]) as CcdaCode,
            participant: [this.mapLocationToParticipant(resource.location)].filter(Boolean) as CcdaParticipant[],
          },
        ],
      };
    }
    if (resource.resourceType === 'Observation') {
      // Create an <observation> entry
      return {
        observation: [
          {
            '@_classCode': 'OBS',
            '@_moodCode': 'EVN',
            templateId: this.mapObservationTemplateId(resource),
            id: this.mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
            code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
            value: this.mapObservationValue(resource),
            statusCode: { '@_code': 'completed' },
            effectiveTime: this.mapEffectiveTime(resource.effectiveDateTime, resource.effectivePeriod),
            text: this.createTextFromExtensions(resource.extension),
          },
        ],
      };
    }
    throw new Error(`Unknown history of procedures resource type: ${(resource as any).resourceType}`);
  }

  private mapLocationToParticipant(ref: Reference<Location> | undefined): CcdaParticipant | undefined {
    if (!ref) {
      return undefined;
    }

    const location = this.findResourceByReference(ref);
    if (!location) {
      return undefined;
    }

    return {
      '@_typeCode': 'LOC',
      participantRole: {
        '@_classCode': 'SDLOC',
        templateId: [{ '@_root': OID_ENCOUNTER_LOCATION }],
        id: this.mapIdentifiers(location.id, location.identifier),
        code: mapCodeableConceptToCcdaCode(location.type?.[0]),
        addr: location.address ? this.mapFhirAddressArrayToCcdaAddressArray([location.address]) : undefined,
        telecom: this.mapTelecom(location.telecom),
        playingEntity: {
          '@_classCode': 'PLC',
          name: location.name ? [location.name] : undefined,
        },
      },
    };
  }

  private mapEffectiveTime(dateTime: string | undefined, period: Period | undefined): CcdaEffectiveTime[] | undefined {
    if (period) {
      return [
        {
          low: { '@_value': mapFhirToCcdaDateTime(period.start) },
          high: { '@_value': mapFhirToCcdaDateTime(period.end) },
        },
      ];
    }
    if (dateTime) {
      return [
        {
          '@_value': mapFhirToCcdaDateTime(dateTime),
        },
      ];
    }
    return undefined;
  }

  private mapEffectiveDate(dateTime: string | undefined, period: Period | undefined): CcdaEffectiveTime[] | undefined {
    if (period) {
      return [
        {
          '@_xsi:type': 'IVL_TS',
          low: period.start ? { '@_value': mapFhirToCcdaDate(period.start) } : undefined,
          high: period.end ? { '@_value': mapFhirToCcdaDate(period.end) } : undefined,
        },
      ];
    }
    if (dateTime) {
      return [
        {
          '@_value': mapFhirToCcdaDate(dateTime),
        },
      ];
    }
    return undefined;
  }

  private mapEffectivePeriod(
    start: string | undefined,
    end: string | undefined,
    useNullFlavor = false
  ): CcdaEffectiveTime[] | undefined {
    if (!start && !end) {
      return undefined;
    }

    const result: CcdaEffectiveTime = {};

    if (start) {
      result['low'] = { '@_value': mapFhirToCcdaDateTime(start) };
    } else if (useNullFlavor) {
      result['low'] = { '@_nullFlavor': 'NI' };
    }

    if (end) {
      result['high'] = { '@_value': mapFhirToCcdaDateTime(end) };
    } else if (useNullFlavor) {
      result['high'] = { '@_nullFlavor': 'NI' };
    }

    return [result];
  }

  private createEncounterEntry(encounter: Encounter): CcdaEntry {
    return {
      encounter: [
        {
          '@_classCode': 'ENC',
          '@_moodCode': 'EVN',
          templateId: [
            {
              '@_root': OID_ENCOUNTER_ACTIVITIES,
            },
            {
              '@_root': OID_ENCOUNTER_ACTIVITIES,
              '@_extension': '2015-08-01',
            },
          ],
          id: this.mapIdentifiers(encounter.id, encounter.identifier),
          code: mapCodeableConceptToCcdaCode(encounter.type?.[0]),
          text: this.createTextFromExtensions(encounter.extension),
          effectiveTime: this.mapEffectiveTime(undefined, encounter.period),
          participant: encounter.participant?.map((participant) => ({
            '@_typeCode': 'LOC',
            participantRole: {
              '@_classCode': 'SDLOC',
              templateId: [
                {
                  '@_root': OID_ENCOUNTER_LOCATION,
                },
              ],
              code: mapCodeableConceptToCcdaCode(participant.type?.[0]),
            },
          })),
          entryRelationship: encounter.diagnosis?.map((d) => this.createEncounterDiagnosis(d)).filter(Boolean) as
            | CcdaEntryRelationship[]
            | undefined,
        },
      ],
    };
  }

  private createEncounterDiagnosis(diagnosis: EncounterDiagnosis): CcdaEntryRelationship | undefined {
    const condition = this.findResourceByReference(diagnosis.condition);
    if (!condition || condition.resourceType !== 'Condition') {
      return undefined;
    }
    return {
      '@_typeCode': 'REFR',
      act: [
        {
          '@_classCode': 'ACT',
          '@_moodCode': 'EVN',
          templateId: [
            { '@_root': OID_ENCOUNTER_ACTIVITIES, '@_extension': '2015-08-01' },
            { '@_root': OID_ENCOUNTER_ACTIVITIES },
          ],
          code: {
            '@_code': '29308-4', // Diagnosis
            '@_displayName': 'Diagnosis',
            '@_codeSystem': OID_LOINC_CODE_SYSTEM,
            '@_codeSystemName': 'LOINC',
          },
          entryRelationship: [
            {
              '@_typeCode': 'SUBJ',
              observation: [
                {
                  '@_classCode': 'OBS',
                  '@_moodCode': 'EVN',
                  templateId: [
                    { '@_root': OID_PROBLEM_OBSERVATION, '@_extension': '2015-08-01' },
                    { '@_root': OID_PROBLEM_OBSERVATION },
                  ],
                  id: this.mapIdentifiers(condition.id, condition.identifier) as CcdaId[],
                  code: {
                    '@_code': '282291009', // Diagnosis interpretation
                    '@_displayName': 'Diagnosis interpretation',
                    '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
                    '@_codeSystemName': 'SNOMED CT',
                    translation: [
                      {
                        '@_code': '29308-4', // Diagnosis
                        '@_displayName': 'Diagnosis',
                        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
                        '@_codeSystemName': 'LOINC',
                      },
                    ],
                  },
                  statusCode: { '@_code': 'completed' },
                  effectiveTime: this.mapEffectivePeriod(condition.onsetDateTime, condition.abatementDateTime),
                  value: mapCodeableConceptToCcdaValue(condition.code),
                },
              ],
            },
          ],
        },
      ],
    };
  }

  private createCareTeamEntry(careTeam: CareTeam): CcdaEntry {
    return {
      organizer: [
        {
          '@_classCode': 'CLUSTER',
          '@_moodCode': 'EVN',
          templateId: [
            {
              '@_root': OID_CARE_TEAM_ORGANIZER_ENTRY,
              '@_extension': '2022-07-01',
            },
            {
              '@_root': OID_CARE_TEAM_ORGANIZER_ENTRY,
              '@_extension': '2022-06-01',
            },
          ],
          id: this.mapIdentifiers(careTeam.id, careTeam.identifier) as CcdaId[],
          component: careTeam.participant?.map((participant) => ({
            '@_typeCode': 'PRF',
            role: participant.role,
          })) as CcdaOrganizerComponent[],
        },
      ],
    };
  }

  /**
   * Handles the ClinicalImpression special case.
   * Unlike most other sections, the "Assessments" section can skip the `<entry>` elements and directly contain the `<text>` element.
   * @param section - The Composition section to create the C-CDA section for.
   * @param resource - The ClinicalImpression resource to create the C-CDA section for.
   * @returns The C-CDA section for the ClinicalImpression resource.
   */
  private createClinicalImpressionSection(section: CompositionSection, resource: ClinicalImpression): CcdaSection {
    return {
      templateId: [{ '@_root': OID_ASSESSMENTS_SECTION }],
      code: mapCodeableConceptToCcdaCode(section.code),
      title: section.title,
      text: resource.summary,
      author: this.mapAuthor(resource.assessor, resource.date),
    };
  }

  private createPlanOfTreatmentServiceRequestEntry(resource: ServiceRequest): CcdaEntry {
    const result: CcdaEntry = {
      observation: [
        {
          '@_classCode': 'OBS',
          '@_moodCode': 'RQO',
          templateId: [{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }],
          id: this.mapIdentifiers(resource.id, resource.identifier),
          code: mapCodeableConceptToCcdaCode(resource.code),
          statusCode: { '@_code': this.mapPlanOfTreatmentStatus(resource.status) },
          effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.occurrenceDateTime) }],
          text: this.createTextFromExtensions(resource.extension),
        },
      ],
    };

    return result;
  }

  private createDiagnosticReportEntry(resource: DiagnosticReport): CcdaEntry {
    const components: CcdaOrganizerComponent[] = [];

    if (resource.result) {
      for (const member of resource.result) {
        const child = this.findResourceByReference(member);
        if (!child || child.resourceType !== 'Observation') {
          continue;
        }

        components.push({
          observation: [this.createVitalSignObservation(child as Observation)],
        });
      }
    }

    // Note: The effectiveTime is an interval that spans the effectiveTimes of the contained result observations.
    // Because all contained result observations have a required time stamp,
    // it is not required that this effectiveTime be populated.

    return {
      organizer: [
        {
          '@_classCode': 'CLUSTER',
          '@_moodCode': 'EVN',
          templateId: [
            { '@_root': OID_RESULT_ORGANIZER },
            { '@_root': OID_RESULT_ORGANIZER, '@_extension': '2015-08-01' },
          ],
          id: this.mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
          code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
          statusCode: { '@_code': 'completed' },
          component: components,
        },
      ],
    };
  }

  private createDeviceUseStatementEntry(resource: DeviceUseStatement): CcdaEntry | undefined {
    const device = this.findResourceByReference(resource.device);
    if (!device) {
      return undefined;
    }

    const ids: CcdaId[] = [];

    const deviceIds = this.mapIdentifiers(device.id, device.identifier);
    if (deviceIds) {
      ids.push(...deviceIds);
    }

    if (device.udiCarrier?.[0]?.deviceIdentifier) {
      ids.push({
        '@_root': OID_FDA_CODE_SYSTEM,
        '@_extension': device.udiCarrier[0].carrierHRF,
        '@_assigningAuthorityName': 'FDA',
      });
    }

    return {
      procedure: [
        {
          '@_classCode': 'PROC',
          '@_moodCode': 'EVN',
          templateId: [
            { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE, '@_extension': '2014-06-09' },
            { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE },
          ],
          id: this.mapIdentifiers(resource.id, resource.identifier),
          code: {
            '@_code': '360030002',
            '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
            '@_codeSystemName': 'SNOMED CT',
            '@_displayName': 'Application of medical device',
          },
          statusCode: {
            '@_code': 'completed',
          },
          participant: [
            {
              '@_typeCode': 'DEV',
              participantRole: {
                '@_classCode': 'MANU',
                templateId: [{ '@_root': OID_PRODUCT_INSTANCE }],
                id: ids,
                playingDevice: {
                  '@_classCode': 'DEV',
                  code: mapCodeableConceptToCcdaCode(device.type) as CcdaCode,
                },
                scopingEntity: {
                  id: [{ '@_root': OID_FDA_CODE_SYSTEM }],
                },
              },
            },
          ],
        },
      ],
    };
  }

  private createClinicalImpressionEntry(resource: ClinicalImpression): CcdaEntry | undefined {
    return {
      act: [
        {
          '@_classCode': 'ACT',
          '@_moodCode': 'EVN',
          templateId: [{ '@_root': OID_NOTE_ACTIVITY, '@_extension': '2016-11-01' }],
          id: this.mapIdentifiers(resource.id, resource.identifier),
          code: mapCodeableConceptToCcdaCode(resource.code) ?? {
            '@_code': LOINC_NOTES_SECTION,
            '@_codeSystem': OID_LOINC_CODE_SYSTEM,
            '@_codeSystemName': 'LOINC',
            '@_displayName': 'Note',
          },
          text: resource.summary ? { '#text': resource.summary } : this.createTextFromExtensions(resource.extension),
          statusCode: { '@_code': 'completed' },
          effectiveTime: [{ '@_value': mapFhirToCcdaDate(resource.date) }],
          author: this.mapAuthor(resource.assessor, resource.date),
        },
      ],
    };
  }

  /**
   * Handles the Reason for Referral special case.
   * @param section - The Composition section to create the C-CDA section for.
   * @param resource - The ClinicalImpression resource to create the C-CDA section for.
   * @returns The C-CDA section for the ClinicalImpression resource.
   */
  private createReasonForReferralSection(section: CompositionSection, resource: ServiceRequest): CcdaSection {
    return {
      templateId: [
        { '@_root': OID_REASON_FOR_REFERRAL, '@_extension': '2014-06-09' },
        { '@_root': OID_REASON_FOR_REFERRAL },
      ],
      code: mapCodeableConceptToCcdaCode(section.code),
      title: section.title,
      text: resource.note?.[0]?.text,
      entry: [
        {
          act: [
            {
              '@_classCode': 'PCPR',
              '@_moodCode': 'INT',
              templateId: [{ '@_root': OID_PATIENT_REFERRAL_ACTIVITY_OBSERVATION }],
              id: this.mapIdentifiers(resource.id, resource.identifier),
              code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
              statusCode: { '@_code': 'active' },
              effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.occurrenceDateTime) }],
              priorityCode: {
                '@_code': 'A',
                '@_codeSystem': '2.16.840.1.113883.5.7',
                '@_codeSystemName': 'ActPriority',
                '@_displayName': 'ASAP',
              },
              author: this.mapAuthor(resource.requester, resource.occurrenceDateTime),
            },
          ],
        },
      ],
    };
  }
}
