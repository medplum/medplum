import { capitalize } from '@medplum/core';
import {
  Address,
  AllergyIntolerance,
  Bundle,
  CarePlan,
  CareTeam,
  CodeableConcept,
  Coding,
  Composition,
  CompositionEvent,
  CompositionSection,
  Condition,
  ContactPoint,
  DosageDoseAndRate,
  Encounter,
  Extension,
  ExtractResource,
  Goal,
  HumanName,
  Identifier,
  Immunization,
  ImmunizationPerformer,
  MedicationRequest,
  Narrative,
  Observation,
  ObservationReferenceRange,
  Organization,
  Patient,
  Period,
  Practitioner,
  Procedure,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { mapFhirToCcdaDate, mapFhirToCcdaDateTime } from './datetime';
import {
  OID_ACT_CLASS_CODE_SYSTEM,
  OID_ACT_CODE_CODE_SYSTEM,
  OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM,
  OID_ALLERGY_OBSERVATION,
  OID_ALLERGY_PROBLEM_ACT,
  OID_AUTHOR_PARTICIPANT,
  OID_CARE_TEAM_ORGANIZER_ENTRY,
  OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
  OID_ENCOUNTER_ACTIVITIES,
  OID_ENCOUNTER_LOCATION,
  OID_HL7_REGISTERED_MODELS,
  OID_IMMUNIZATION_ACTIVITY,
  OID_IMMUNIZATION_MEDICATION_INFORMATION,
  OID_INSTRUCTIONS,
  OID_LOINC_CODE_SYSTEM,
  OID_MEDICATION_ACTIVITY,
  OID_MEDICATION_FREE_TEXT_SIG,
  OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL,
  OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION,
  OID_PROBLEM_ACT,
  OID_PROBLEM_OBSERVATION,
  OID_PROCEDURE_ACTIVITY_ACT,
  OID_PROCEDURE_ACTIVITY_PROCEDURE,
  OID_REACTION_OBSERVATION,
  OID_SEVERITY_OBSERVATION,
  OID_SNOMED_CT_CODE_SYSTEM,
  OID_VITAL_SIGNS_OBSERVATION,
  OID_VITAL_SIGNS_ORGANIZER,
} from './oids';
import {
  ADDRESS_USE_MAPPER,
  ALLERGY_SEVERITY_MAPPER,
  ALLERGY_STATUS_MAPPER,
  CCDA_NARRATIVE_REFERENCE_URL,
  CCDA_TEMPLATE_CODE_SYSTEM,
  CONFIDENTIALITY_MAPPER,
  GENDER_MAPPER,
  HUMAN_NAME_USE_MAPPER,
  mapCodeableConceptToCcdaCode,
  mapCodeableConceptToCcdaValue,
  mapFhirSystemToCcda,
  MEDICATION_STATUS_MAPPER,
  OBSERVATION_CATEGORY_MAPPER,
  PROBLEM_STATUS_MAPPER,
  TELECOM_USE_MAPPER,
  US_CORE_ETHNICITY_URL,
  US_CORE_RACE_URL,
} from './systems';
import { CCDA_TEMPLATE_IDS, LOINC_TO_TEMPLATE_IDS } from './templates';
import {
  Ccda,
  CcdaAddr,
  CcdaAuthor,
  CcdaCode,
  CcdaCustodian,
  CcdaDocumentationOf,
  CcdaEffectiveTime,
  CcdaEntry,
  CcdaId,
  CcdaLanguageCommunication,
  CcdaName,
  CcdaNarrative,
  CcdaObservation,
  CcdaOrganizer,
  CcdaOrganizerComponent,
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

/**
 * Convert a FHIR bundle to a C-CDA document.
 * @param bundle - The FHIR bundle to convert.
 * @returns The C-CDA document.
 */
export function convertFhirToCcda(bundle: Bundle): Ccda {
  return new FhirToCcdaConverter(bundle).convert();
}

/**
 * The FhirToCcdaConverter class is responsible for converting a FHIR bundle to a C-CDA document.
 */
class FhirToCcdaConverter {
  private readonly bundle: Bundle;
  private readonly composition: Composition;
  private readonly patient: Patient;

  /**
   * Creates a new FhirToCcdaConverter for the given FHIR bundle.
   * @param bundle - The FHIR bundle to convert.
   */
  constructor(bundle: Bundle) {
    this.bundle = bundle;

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
      templateId: CCDA_TEMPLATE_IDS,
      id: this.mapIdentifiers(this.composition.id, undefined),
      code: this.composition.type ? mapCodeableConceptToCcdaCode(this.composition.type) : undefined,
      title: this.composition.title,
      effectiveTime: this.mapEffectiveTime(this.composition.date, undefined),
      confidentialityCode: this.composition.confidentiality
        ? CONFIDENTIALITY_MAPPER.mapFhirToCcdaCode(this.composition.confidentiality)
        : undefined,
      languageCode: this.composition.language ? { '@_code': this.composition.language } : undefined,
      recordTarget: this.createRecordTarget(),
      author: this.mapAuthor(this.composition.author?.[0], this.composition.date),
      custodian: this.mapCustodian(this.composition.custodian),
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
      raceCode: this.mapRace(patient.extension),
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
      '@_xsi:type': 'CE',
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
   * @param extensions - The extensions to map.
   * @returns The C-CDA race.
   */
  private mapRace(extensions: Extension[] | undefined): CcdaCode[] | undefined {
    const raceExt = extensions?.find((e) => e.url === US_CORE_RACE_URL);
    const ombCategory = raceExt?.extension?.find((e) => e.url === 'ombCategory')?.valueCoding;

    if (!ombCategory) {
      return undefined;
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
   * Map the ethnicity to the C-CDA ethnicity.
   * @param extensions - The extensions to map.
   * @returns The C-CDA ethnicity.
   */
  private mapEthnicity(extensions: Extension[] | undefined): CcdaCode[] | undefined {
    const ethnicityExt = extensions?.find((e) => e.url === US_CORE_ETHNICITY_URL);
    const ombCategory = ethnicityExt?.extension?.find((e) => e.url === 'ombCategory')?.valueCoding;

    if (!ombCategory) {
      return undefined;
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
        '@_languageCode': communication[0].language?.coding?.[0]?.code,
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

    return {
      templateId: templateId,
      code: mapCodeableConceptToCcdaCode(section.code),
      title: section.title,
      text: this.mapFhirTextDivToCcdaSectionText(section.text),
      entry: resources.map((resource) => this.createEntry(section, resource)),
      '@_nullFlavor': resources.length === 0 ? 'NI' : undefined,
    };
  }

  private createEntry(section: CompositionSection, resource: Resource): CcdaEntry {
    switch (resource.resourceType) {
      case 'AllergyIntolerance':
        return this.createAllergyEntry(resource as AllergyIntolerance);
      case 'CarePlan':
        return this.createPlanOfTreatmentCarePlanEntry(resource);
      case 'CareTeam':
        return this.createCareTeamEntry(resource);
      case 'Condition':
        return this.createProblemEntry(resource);
      case 'Encounter':
        return this.createEncounterEntry(resource);
      case 'Goal':
        return this.createPlanOfTreatmentGoalEntry(resource);
      case 'Immunization':
        return this.createImmunizationEntry(resource as Immunization);
      case 'MedicationRequest':
        return this.createMedicationEntry(resource as MedicationRequest);
      case 'Procedure':
        return this.createHistoryOfProceduresEntry(resource) as CcdaEntry;
      case 'Observation':
        return this.createObservationEntry(resource as Observation);
      default:
        throw new Error(`Unknown resource type: ${resource.resourceType}`);
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
          effectiveTime: this.mapEffectiveTime(allergy.recordedDate, undefined),
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
                  statusCode: {
                    '@_code': 'completed',
                  },
                  author: this.mapAuthor(allergy.asserter, allergy.recordedDate),
                  effectiveTime: this.mapEffectiveDate(allergy.onsetDateTime, undefined),
                  value: this.mapAllergyCategory(allergy.category),
                  text: this.createTextFromExtensions(allergy.extension),
                  participant: [
                    {
                      '@_typeCode': 'CSM',
                      participantRole: {
                        '@_classCode': 'MANU',
                        playingEntity: {
                          '@_classCode': 'MMAT',
                          code: {
                            ...mapCodeableConceptToCcdaCode(allergy.code),
                            originalText: {
                              reference: this.getNarrativeReference(allergy.code?.extension),
                            },
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
  private mapAllergyCategory(category: AllergyIntolerance['category']): CcdaValue | undefined {
    if (!category) {
      return undefined;
    }

    if (category.length === 1 && category[0] === 'food') {
      return {
        '@_xsi:type': 'CD',
        '@_code': '414285001',
        '@_displayName': 'Allergy to food (finding)',
        '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
        '@_codeSystemName': 'SNOMED CT',
      };
    }

    return undefined;
  }

  /**
   * Map the FHIR author to the C-CDA author.
   * @param author - The author to map.
   * @param time - The time to map.
   * @returns The C-CDA author.
   */
  private mapAuthor(author: Reference | undefined, time?: string): CcdaAuthor[] | undefined {
    if (!author) {
      return undefined;
    }

    const practitioner = this.findResourceByReference(author);
    if (practitioner?.resourceType !== 'Practitioner') {
      return undefined;
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
          id: this.mapIdentifiers(practitioner.id, practitioner.identifier),
          addr: this.mapFhirAddressArrayToCcdaAddressArray(practitioner.address),
          telecom: this.mapTelecom(practitioner.telecom),
          code: mapCodeableConceptToCcdaCode(practitioner.qualification?.[0]),
          assignedPerson: {
            name: this.mapNames(practitioner.name),
          },
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

    // Get narrative references
    const medicationRef = '#Medication_6'; // Main reference
    const medicationNameRef = '#MedicationName_6'; // For manufacturedMaterial
    const sigRef = '#MedicationSig_6'; // For instructions

    return {
      substanceAdministration: [
        {
          '@_classCode': 'SBADM',
          '@_moodCode': 'EVN',
          templateId: [{ '@_root': OID_MEDICATION_ACTIVITY, '@_extension': '2014-06-09' }],
          id: [{ '@_root': med.id || crypto.randomUUID() }],
          text: { reference: { '@_value': medicationRef } },
          statusCode: { '@_code': MEDICATION_STATUS_MAPPER.mapFhirToCcdaWithDefault(med.status, 'active') },
          // effectiveTime: this.mapEffectiveTime(med.dosageInstruction?.[0]?.timing?.event?.[0], undefined),
          effectiveTime: this.mapEffectiveDate(undefined, med.dispenseRequest?.validityPeriod),
          routeCode: this.mapMedicationRoute(med.dosageInstruction?.[0]?.route),
          doseQuantity: this.mapDoseQuantity(med.dosageInstruction?.[0]?.doseAndRate?.[0]),
          consumable: {
            '@_typeCode': 'CSM',
            manufacturedProduct: [
              {
                '@_classCode': 'MANU',
                templateId: [
                  { '@_root': OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL, '@_extension': '2014-06-09' },
                ],
                manufacturedMaterial: [
                  {
                    code: [
                      {
                        ...(mapCodeableConceptToCcdaCode(medicationCode) as CcdaCode),
                        originalText: { reference: { '@_value': medicationNameRef } },
                      },
                    ],
                  },
                ],
                manufacturerOrganization: manufacturer
                  ? [
                      {
                        id: this.mapIdentifiers(manufacturer.id, [manufacturer.identifier]),
                        name: [manufacturer.display as string],
                      },
                    ]
                  : undefined,
              },
            ],
          },
          entryRelationship: [
            {
              '@_typeCode': 'COMP',
              substanceAdministration: [
                {
                  '@_classCode': 'SBADM',
                  '@_moodCode': 'EVN',
                  templateId: [{ '@_root': OID_MEDICATION_FREE_TEXT_SIG }],
                  code: {
                    '@_code': '76662-6',
                    '@_codeSystem': OID_LOINC_CODE_SYSTEM,
                    '@_codeSystemName': 'LOINC',
                    '@_displayName': 'Medication Instructions',
                  },
                  text: { reference: { '@_value': sigRef } },
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
            },
          ],
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
      '@_xsi:type': 'PQ',
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
      '@_use': cp.use ? TELECOM_USE_MAPPER.mapFhirToCcda(cp.use as 'home' | 'work') : undefined,
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
  private mapIdentifiers(
    id: string | undefined,
    identifiers: (Identifier | undefined)[] | undefined
  ): CcdaId[] | undefined {
    const result: CcdaId[] = [];

    if (id) {
      result.push({
        '@_root': id,
      });
    }

    if (identifiers) {
      for (const id of identifiers) {
        if (id) {
          result.push({
            '@_root': mapFhirSystemToCcda(id.system),
            '@_extension': id.value,
          });
        }
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
          // statusCode: { '@_code': this.mapStatus(problem.clinicalStatus?.coding?.[0]?.code) },
          statusCode: {
            '@_code': PROBLEM_STATUS_MAPPER.mapFhirToCcdaWithDefault(
              problem.clinicalStatus?.coding?.[0]?.code,
              'active'
            ),
          },
          effectiveTime: this.mapEffectiveTime(problem.recordedDate, undefined),
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
                  id: this.mapIdentifiers(undefined, problem.identifier),
                  text: this.createTextFromExtensions(problem.extension),
                  code: {
                    '@_code': '55607006',
                    '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
                    '@_codeSystemName': 'SNOMED CT',
                    '@_displayName': 'Problem',
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
          statusCode: { '@_code': 'completed' },
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
                        id: this.mapIdentifiers(manufacturer.id, [manufacturer.identifier]),
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

  private createPlanOfTreatmentCarePlanEntry(resource: CarePlan): CcdaEntry {
    return {
      act: [
        {
          '@_classCode': 'ACT',
          '@_moodCode': 'INT',
          id: this.mapIdentifiers(resource.id, resource.identifier),
          code: mapCodeableConceptToCcdaValue(resource.category?.[0]) as CcdaCode,
          templateId: [{ '@_root': OID_INSTRUCTIONS }],
          statusCode: { '@_code': 'completed' },
          text: resource.description
            ? { '#text': resource.description }
            : this.createTextFromExtensions(resource.extension),
        },
      ],
    };
  }

  private createPlanOfTreatmentGoalEntry(resource: Goal): CcdaEntry {
    const result: CcdaEntry = {
      observation: [
        {
          '@_classCode': 'OBS',
          '@_moodCode': 'GOL',
          templateId: [{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }],
          id: this.mapIdentifiers(resource.id, resource.identifier),
          code: mapCodeableConceptToCcdaCode(resource.description),
          statusCode: { '@_code': this.mapGoalStatus(resource.lifecycleStatus) },
          effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.startDate) }],
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

    return result;
  }

  private mapGoalStatus(status: string | undefined): string {
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
        if (child) {
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
      value: this.mapObservationValue(observation),
      effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(observation.effectiveDateTime) }],
      referenceRange: this.mapReferenceRangeArray(observation.referenceRange),
      text: this.createTextFromExtensions(observation.extension),
      author: this.mapAuthor(observation.performer?.[0], observation.effectiveDateTime),
    };

    return result;
  }

  private mapObservationTemplateId(observation: Observation): CcdaTemplateId[] {
    // If the Observation.category includes at least one entry with system "http://hl7.org/cda/template",
    // then use those template IDs directly.
    const templateIds = observation.category
      ?.filter((c) => c.coding?.some((coding) => coding.system === CCDA_TEMPLATE_CODE_SYSTEM))
      .map((c) => c.coding?.find((coding) => coding.system === CCDA_TEMPLATE_CODE_SYSTEM))
      .filter((c) => c?.code) as (Coding & { code: string })[];

    if (templateIds && templateIds.length > 0) {
      return templateIds.map((id) =>
        id.version ? { '@_root': id.code, '@_extension': id.version } : { '@_root': id.code }
      );
    }

    // If the Observation.category includes at least one entry with a mapping in OBSERVATION_CATEGORY_MAPPER,
    // then use the template ID from the mapping.
    if (observation.category?.[0]?.coding?.[0]?.code) {
      const category = OBSERVATION_CATEGORY_MAPPER.getEntryByFhir(observation.category?.[0]?.coding?.[0]?.code);
      if (category) {
        return [{ '@_root': category.ccdaValue }, { '@_root': category.ccdaValue, '@_extension': '2014-06-09' }];
      }
    }

    // Otherwise, fall back to the default template ID.
    return [
      { '@_root': OID_VITAL_SIGNS_OBSERVATION },
      { '@_root': OID_VITAL_SIGNS_OBSERVATION, '@_extension': '2014-06-09' },
    ];
  }

  private mapObservationValue(observation: Observation): CcdaValue | undefined {
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

  private mapEffectiveTime(dateTime: string | undefined, period: Period | undefined): CcdaEffectiveTime[] | undefined {
    if (period) {
      return [
        {
          '@_xsi:type': 'IVL_TS',
          low: { '@_value': mapFhirToCcdaDateTime(period.start) },
          high: { '@_value': mapFhirToCcdaDateTime(period.end) },
        },
      ];
    }
    if (dateTime) {
      return [
        {
          '@_xsi:type': 'TS',
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
          '@_xsi:type': 'TS',
          '@_value': mapFhirToCcdaDate(dateTime),
        },
      ];
    }
    return undefined;
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
          entryRelationship: encounter.participant?.map((participant) => ({
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
}
