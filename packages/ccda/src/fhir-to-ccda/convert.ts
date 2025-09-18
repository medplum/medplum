// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SNOMED } from '@medplum/core';
import {
  Address,
  Bundle,
  CareTeam,
  ClinicalImpression,
  CodeableConcept,
  Composition,
  CompositionSection,
  ContactPoint,
  Device,
  DosageDoseAndRate,
  Encounter,
  EncounterDiagnosis,
  ExtractResource,
  HumanName,
  Immunization,
  ImmunizationPerformer,
  Location,
  MedicationRequest,
  Observation,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  Procedure,
  Reference,
  RelatedPerson,
  Resource,
  ResourceType,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { mapFhirToCcdaDate, mapFhirToCcdaDateTime } from '../datetime';
import {
  OID_ASSESSMENTS_SECTION,
  OID_AUTHOR_PARTICIPANT,
  OID_ENCOUNTER_ACTIVITIES,
  OID_ENCOUNTER_LOCATION,
  OID_HL7_REGISTERED_MODELS,
  OID_IMMUNIZATION_ACTIVITY,
  OID_IMMUNIZATION_MEDICATION_INFORMATION,
  OID_LOINC_CODE_SYSTEM,
  OID_MEDICATION_ACTIVITY,
  OID_MEDICATION_FREE_TEXT_SIG,
  OID_MEDICATION_INFORMATION_MANUFACTURED_MATERIAL,
  OID_PATIENT_REFERRAL_ACTIVITY_OBSERVATION,
  OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION,
  OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE,
  OID_PROBLEM_OBSERVATION,
  OID_PROCEDURE_ACTIVITY_ACT,
  OID_PROCEDURE_ACTIVITY_PROCEDURE,
  OID_REASON_FOR_REFERRAL,
  OID_RELATED_PERSON_RELATIONSHIP_AND_NAME_PARTICIPANT_PARTICIPATION,
  OID_SNOMED_CT_CODE_SYSTEM,
} from '../oids';
import {
  CONFIDENTIALITY_MAPPER,
  IMMUNIZATION_STATUS_MAPPER,
  LOINC_ASSESSMENTS_SECTION,
  LOINC_MEDICATION_INSTRUCTIONS,
  LOINC_REASON_FOR_REFERRAL_SECTION,
  LOINC_REFERRAL_NOTE,
  LOINC_SUMMARY_OF_EPISODE_NOTE,
  mapCodeableConceptToCcdaCode,
  mapCodeableConceptToCcdaValue,
  MEDICATION_STATUS_MAPPER,
} from '../systems';
import { CCDA_TEMPLATE_IDS, LOINC_TO_TEMPLATE_IDS, REFERRAL_TEMPLATE_IDS } from '../templates';
import {
  Ccda,
  CcdaAuthor,
  CcdaCode,
  CcdaCustodian,
  CcdaEffectiveTime,
  CcdaEntry,
  CcdaEntryRelationship,
  CcdaId,
  CcdaInformationRecipient,
  CcdaParticipant,
  CcdaPerformer,
  CcdaQuantity,
  CcdaRecordTarget,
  CcdaSection,
  CcdaSubstanceAdministration,
  CcdaTemplateId,
} from '../types';
import { createAllergyEntry } from './entries/allergy';
import { createPlanOfTreatmentCarePlanEntry } from './entries/careplan';
import { createCareTeamEntry } from './entries/careteam';
import { createClinicalImpressionEntry } from './entries/clinicalimpression';
import { createConditionEntry } from './entries/condition';
import { createDeviceUseStatementEntry } from './entries/deviceusestatement';
import { createDiagnosticReportEntry } from './entries/diagnosticreport';
import { createGoalEntry } from './entries/goal';
import { createInsuranceEntry } from './entries/insurance';
import { createObservationEntry, mapObservationTemplateId, mapObservationValue } from './entries/observation';
import { mapDocumentationOf } from './metadata';
import {
  createTextFromExtensions,
  mapEffectiveDate,
  mapEffectivePeriod,
  mapEffectiveTime,
  mapFhirAddressArrayToCcdaAddressArray,
  mapFhirTextDivToCcdaSectionText,
  mapIdentifiers,
  mapNames,
  mapPatient,
  mapTelecom,
} from './utils';

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
export class FhirToCcdaConverter {
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
      id: mapIdentifiers(this.composition.id, undefined),
      code,
      title: this.composition.title,
      effectiveTime: mapEffectiveTime(this.composition.date, undefined),
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
      participant: this.createParticipants(),
      documentationOf: mapDocumentationOf(this.composition.event),
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
  findResourceByReference<T extends Resource>(reference: Reference<T> | undefined): T | undefined {
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
          id: mapIdentifiers(this.patient.id, this.patient.identifier),
          addr: mapFhirAddressArrayToCcdaAddressArray(this.patient.address),
          telecom: mapTelecom(this.patient.telecom),
          patient: mapPatient(this.patient),
        },
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
      text: mapFhirTextDivToCcdaSectionText(section.text),
      entry: resources.map((resource) => this.createEntry(section, resource)).filter(Boolean) as CcdaEntry[],
      '@_nullFlavor': resources.length === 0 ? 'NI' : undefined,
    };
  }

  private createEntry(section: CompositionSection, resource: Resource): CcdaEntry | undefined {
    switch (resource.resourceType) {
      case 'Account':
        return createInsuranceEntry(this, resource);
      case 'AllergyIntolerance':
        return createAllergyEntry(this, resource);
      case 'CarePlan':
        return createPlanOfTreatmentCarePlanEntry(this, resource);
      case 'CareTeam':
        return createCareTeamEntry(this, resource);
      case 'ClinicalImpression':
        return createClinicalImpressionEntry(this, resource);
      case 'Condition':
        return createConditionEntry(this, section, resource);
      case 'DeviceUseStatement':
        return createDeviceUseStatementEntry(this, resource);
      case 'DiagnosticReport':
        return createDiagnosticReportEntry(this, resource);
      case 'Encounter':
        return this.createEncounterEntry(resource);
      case 'Goal':
        return createGoalEntry(section, resource);
      case 'Immunization':
        return this.createImmunizationEntry(resource as Immunization);
      case 'MedicationRequest':
        return this.createMedicationEntry(resource as MedicationRequest);
      case 'Procedure':
        return this.createHistoryOfProceduresEntry(resource) as CcdaEntry;
      case 'Observation':
        return createObservationEntry(this, resource);
      case 'ServiceRequest':
        return this.createPlanOfTreatmentServiceRequestEntry(resource as ServiceRequest);
      default:
        return undefined;
    }
  }

  // /**
  //  * Create the C-CDA allergy entry for the FHIR allergy.
  //  * @param allergy - The FHIR allergy to create the C-CDA allergy entry for.
  //  * @returns The C-CDA allergy entry.
  //  */
  // private createAllergyEntry(allergy: AllergyIntolerance): CcdaEntry {
  //   const reaction = allergy.reaction?.[0];
  //   return {
  //     act: [
  //       {
  //         '@_classCode': 'ACT',
  //         '@_moodCode': 'EVN',
  //         templateId: [
  //           {
  //             '@_root': OID_ALLERGY_PROBLEM_ACT,
  //           },
  //           {
  //             '@_root': OID_ALLERGY_PROBLEM_ACT,
  //             '@_extension': '2015-08-01',
  //           },
  //         ],
  //         id: mapIdentifiers(allergy.id, allergy.identifier),
  //         code: {
  //           '@_code': 'CONC',
  //           '@_codeSystem': OID_ACT_CLASS_CODE_SYSTEM,
  //         },
  //         statusCode: {
  //           '@_code': ALLERGY_STATUS_MAPPER.mapFhirToCcdaWithDefault(
  //             allergy.clinicalStatus?.coding?.[0]?.code,
  //             'active'
  //           ),
  //         },
  //         effectiveTime: mapEffectivePeriod(allergy.recordedDate, undefined),
  //         author: this.mapAuthor(allergy.recorder, allergy.recordedDate),
  //         text: createTextFromExtensions(allergy.extension),
  //         entryRelationship: [
  //           {
  //             '@_typeCode': 'SUBJ',
  //             observation: [
  //               {
  //                 '@_classCode': 'OBS',
  //                 '@_moodCode': 'EVN',
  //                 templateId: [
  //                   {
  //                     '@_root': OID_ALLERGY_OBSERVATION,
  //                   },
  //                   {
  //                     '@_root': OID_ALLERGY_OBSERVATION,
  //                     '@_extension': '2014-06-09',
  //                   },
  //                 ],
  //                 id: mapIdentifiers(allergy.id, allergy.identifier),
  //                 code: {
  //                   '@_code': 'ASSERTION',
  //                   '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
  //                 },
  //                 text: createTextFromExtensions(allergy.extension),
  //                 statusCode: {
  //                   '@_code': 'completed',
  //                 },
  //                 effectiveTime: mapEffectivePeriod(
  //                   allergy.onsetPeriod?.start ?? allergy.onsetDateTime,
  //                   allergy.onsetPeriod?.end,
  //                   true
  //                 ),
  //                 value: this.mapAllergyCategory(allergy.category),
  //                 author: this.mapAuthor(allergy.asserter, allergy.recordedDate),
  //                 participant: [
  //                   {
  //                     '@_typeCode': 'CSM',
  //                     participantRole: {
  //                       '@_classCode': 'MANU',
  //                       playingEntity: {
  //                         '@_classCode': 'MMAT',
  //                         code:
  //                           // Handle special case for "No known allergies"
  //                           // https://hl7.org/fhir/R4/allergyintolerance-nka.json.html
  //                           // C-CDA-Examples/Allergies/No Known Allergies
  //                           allergy.code?.coding?.[0]?.code === '716186003'
  //                             ? { '@_nullFlavor': 'NA' }
  //                             : {
  //                                 ...mapCodeableConceptToCcdaCode(allergy.code),
  //                                 originalText: allergy.code?.extension
  //                                   ? {
  //                                       reference: getNarrativeReference(allergy.code?.extension),
  //                                     }
  //                                   : undefined,
  //                               },
  //                       },
  //                     },
  //                   },
  //                 ],
  //                 entryRelationship: reaction
  //                   ? [
  //                       {
  //                         '@_typeCode': 'MFST',
  //                         '@_inversionInd': 'true',
  //                         observation: [
  //                           {
  //                             '@_classCode': 'OBS',
  //                             '@_moodCode': 'EVN',
  //                             templateId: [
  //                               {
  //                                 '@_root': OID_REACTION_OBSERVATION,
  //                               },
  //                               {
  //                                 '@_root': OID_REACTION_OBSERVATION,
  //                                 '@_extension': '2014-06-09',
  //                               },
  //                             ],
  //                             id: mapIdentifiers(reaction.id, undefined),
  //                             code: {
  //                               '@_code': 'ASSERTION',
  //                               '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
  //                             },
  //                             statusCode: {
  //                               '@_code': 'completed',
  //                             },
  //                             effectiveTime: mapEffectiveDate(allergy.onsetDateTime, allergy.onsetPeriod),
  //                             value: mapCodeableConceptToCcdaValue(reaction.manifestation?.[0]),
  //                             text: createTextFromExtensions(reaction.manifestation?.[0]?.extension),
  //                             entryRelationship: [
  //                               {
  //                                 '@_typeCode': 'SUBJ',
  //                                 '@_inversionInd': 'true',
  //                                 observation: [
  //                                   {
  //                                     '@_classCode': 'OBS',
  //                                     '@_moodCode': 'EVN',
  //                                     templateId: [
  //                                       {
  //                                         '@_root': OID_SEVERITY_OBSERVATION,
  //                                       },
  //                                       {
  //                                         '@_root': OID_SEVERITY_OBSERVATION,
  //                                         '@_extension': '2014-06-09',
  //                                       },
  //                                     ],
  //                                     code: {
  //                                       '@_code': 'SEV',
  //                                       '@_codeSystem': OID_ACT_CODE_CODE_SYSTEM,
  //                                       '@_codeSystemName': 'ActCode',
  //                                     },
  //                                     statusCode: {
  //                                       '@_code': 'completed',
  //                                     },
  //                                     value: {
  //                                       '@_xsi:type': 'CD',
  //                                       '@_code': ALLERGY_SEVERITY_MAPPER.mapFhirToCcdaWithDefault(
  //                                         reaction.severity,
  //                                         'M'
  //                                       ),
  //                                       '@_displayName': reaction.severity ? capitalize(reaction.severity) : undefined,
  //                                       '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
  //                                       '@_codeSystemName': 'SNOMED CT',
  //                                     },
  //                                     text: createTextFromExtensions(reaction.extension),
  //                                   },
  //                                 ],
  //                               },
  //                             ],
  //                           },
  //                         ],
  //                       },
  //                     ]
  //                   : [],
  //               },
  //             ],
  //           },
  //         ],
  //       },
  //     ],
  //   };
  // }

  // /**
  //  * Map the FHIR allergy category to the C-CDA allergy category.
  //  * @param category - The category to map.
  //  * @returns The C-CDA allergy category.
  //  */
  // mapAllergyCategory(category: AllergyIntolerance['category']): CcdaValue {
  //   let code = ALLERGY_CATEGORY_MAPPER.mapFhirToCcdaCode(category?.[0]);
  //   if (!code) {
  //     // Default to generic allergy if no category is provided
  //     code = {
  //       '@_code': '419199007',
  //       '@_displayName': 'Allergy to substance (disorder)',
  //       '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
  //       '@_codeSystemName': 'SNOMED CT',
  //     };
  //   }

  //   return { '@_xsi:type': 'CD', ...code };
  // }

  /**
   * Map the FHIR author to the C-CDA author.
   * @param author - The author to map.
   * @param time - The time to map.
   * @param includeDevice - Whether to include device information.
   * @returns The C-CDA author.
   */
  mapAuthor(
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
          id: mapIdentifiers(mainResource.id, mainResource.identifier),
          addr: mapFhirAddressArrayToCcdaAddressArray(address),
          telecom: mapTelecom(telecom),
          code: mapCodeableConceptToCcdaCode(code),
          assignedPerson: humanName ? { name: mapNames(humanName) } : undefined,
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
          id: mapIdentifiers(organization.id, organization.identifier),
          name: organization.name ? [organization.name] : undefined,
          telecom: mapTelecom(organization.telecom),
          addr: mapFhirAddressArrayToCcdaAddressArray(organization.address),
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
          name: mapNames(resource.name),
        },
      },
    };
  }

  private createParticipants(): CcdaParticipant[] | undefined {
    const relatedPersons = this.bundle.entry
      ?.filter((e) => e.resource?.resourceType === 'RelatedPerson')
      .map((e) => e.resource as RelatedPerson);

    if (!relatedPersons || relatedPersons.length === 0) {
      return undefined;
    }

    return relatedPersons.map((person) => ({
      '@_typeCode': 'IND',
      templateId: [
        { '@_root': OID_RELATED_PERSON_RELATIONSHIP_AND_NAME_PARTICIPANT_PARTICIPATION, '@_extension': '2023-05-01' },
      ],
      associatedEntity: {
        '@_classCode': 'PRS',
        id: mapIdentifiers(person.id, person.identifier),
        code: mapCodeableConceptToCcdaCode(person.relationship?.[0]),
        addr: mapFhirAddressArrayToCcdaAddressArray(person.address),
        telecom: mapTelecom(person.telecom),
        associatedPerson: {
          name: mapNames(person.name),
        },
      },
    }));
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
      const mapped = mapEffectiveDate(undefined, med.dispenseRequest.validityPeriod);
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
          text: createTextFromExtensions(med.extension),
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
                        originalText: createTextFromExtensions(medication?.extension),
                      },
                    ],
                  },
                ],
                manufacturerOrganization: manufacturer
                  ? [
                      {
                        id: mapIdentifiers(
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
                  text: createTextFromExtensions(instr.extension),
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
          id: mapIdentifiers(immunization.id, immunization.identifier),
          text: createTextFromExtensions(immunization.extension),
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
                        id: mapIdentifiers(
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
        id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
        addr: mapFhirAddressArrayToCcdaAddressArray(practitioner?.address),
        telecom: mapTelecom(resource.telecom),
        assignedPerson: practitioner
          ? {
              id: mapIdentifiers(practitioner.id, practitioner.identifier) as CcdaId[],
              name: mapNames(practitioner.name),
            }
          : undefined,
        representedOrganization: organization
          ? {
              id: mapIdentifiers(organization.id, organization.identifier) as CcdaId[],
              name: organization.name ? [organization.name] : undefined,
              addr: mapFhirAddressArrayToCcdaAddressArray(organization.address),
              telecom: mapTelecom(organization.telecom),
            }
          : undefined,
      },
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
              id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
              code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
              statusCode: { '@_code': 'completed' },
              effectiveTime: mapEffectiveTime(resource.performedDateTime, resource.performedPeriod),
              text: createTextFromExtensions(resource.extension),
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
            id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
            code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
            statusCode: { '@_code': 'completed' },
            effectiveTime: mapEffectiveTime(resource.performedDateTime, resource.performedPeriod),
            text: createTextFromExtensions(resource.extension),
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
            templateId: mapObservationTemplateId(resource),
            id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
            code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
            value: mapObservationValue(resource),
            statusCode: { '@_code': 'completed' },
            effectiveTime: mapEffectiveTime(resource.effectiveDateTime, resource.effectivePeriod),
            text: createTextFromExtensions(resource.extension),
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
        id: mapIdentifiers(location.id, location.identifier),
        code: mapCodeableConceptToCcdaCode(location.type?.[0]),
        addr: location.address ? mapFhirAddressArrayToCcdaAddressArray([location.address]) : undefined,
        telecom: mapTelecom(location.telecom),
        playingEntity: {
          '@_classCode': 'PLC',
          name: location.name ? [location.name] : undefined,
        },
      },
    };
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
          id: mapIdentifiers(encounter.id, encounter.identifier),
          code: mapCodeableConceptToCcdaCode(encounter.type?.[0]),
          text: createTextFromExtensions(encounter.extension),
          effectiveTime: mapEffectiveTime(undefined, encounter.period),
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
                  id: mapIdentifiers(condition.id, condition.identifier) as CcdaId[],
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
                  effectiveTime: mapEffectivePeriod(condition.onsetDateTime, condition.abatementDateTime),
                  value: mapCodeableConceptToCcdaValue(condition.code),
                },
              ],
            },
          ],
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
    // Under some circumstances, we need to use a `<procedure>` element instead of an `<observation>` element.
    // This is a pretty nasty interoperability quirk, but it's what C-CDA requires.
    // The quick 80/20 solution is to use `<procedure>` when ServiceRequest.code is a SNOMED CT code.
    const system = resource.code?.coding?.[0]?.system;
    if (system === SNOMED) {
      return {
        procedure: [
          {
            '@_classCode': 'PROC',
            '@_moodCode': 'RQO',
            templateId: [
              { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE },
              { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE, '@_extension': '2014-06-09' },
              { '@_root': OID_PLAN_OF_CARE_ACTIVITY_PROCEDURE, '@_extension': '2022-06-01' },
            ],
            id: mapIdentifiers(resource.id, resource.identifier) as CcdaId[],
            code: mapCodeableConceptToCcdaCode(resource.code) as CcdaCode,
            statusCode: { '@_code': 'active' }, // USCDI v2 requires statusCode to be "active"
            effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.authoredOn) }],
            text: createTextFromExtensions(resource.extension),
          },
        ],
      };
    }

    const result: CcdaEntry = {
      observation: [
        {
          '@_classCode': 'OBS',
          '@_moodCode': 'RQO',
          templateId: [{ '@_root': OID_PLAN_OF_CARE_ACTIVITY_OBSERVATION }],
          id: mapIdentifiers(resource.id, resource.identifier),
          code: mapCodeableConceptToCcdaCode(resource.code),
          statusCode: { '@_code': this.mapPlanOfTreatmentStatus(resource.status) },
          effectiveTime: [{ '@_value': mapFhirToCcdaDateTime(resource.occurrenceDateTime) }],
          text: createTextFromExtensions(resource.extension),
        },
      ],
    };

    return result;
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
              id: mapIdentifiers(resource.id, resource.identifier),
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
