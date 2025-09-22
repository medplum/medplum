// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
  ExtractResource,
  HumanName,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
  RelatedPerson,
  Resource,
  ResourceType,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { mapFhirToCcdaDateTime } from '../datetime';
import {
  OID_ASSESSMENTS_SECTION,
  OID_AUTHOR_PARTICIPANT,
  OID_HL7_REGISTERED_MODELS,
  OID_LOINC_CODE_SYSTEM,
  OID_PATIENT_REFERRAL_ACTIVITY_OBSERVATION,
  OID_REASON_FOR_REFERRAL,
  OID_RELATED_PERSON_RELATIONSHIP_AND_NAME_PARTICIPANT_PARTICIPATION,
} from '../oids';
import {
  CONFIDENTIALITY_MAPPER,
  LOINC_ASSESSMENTS_SECTION,
  LOINC_REASON_FOR_REFERRAL_SECTION,
  LOINC_REFERRAL_NOTE,
  LOINC_SUMMARY_OF_EPISODE_NOTE,
  mapCodeableConceptToCcdaCode,
} from '../systems';
import { CCDA_TEMPLATE_IDS, LOINC_TO_TEMPLATE_IDS, REFERRAL_TEMPLATE_IDS } from '../templates';
import {
  Ccda,
  CcdaAuthor,
  CcdaCode,
  CcdaCustodian,
  CcdaEntry,
  CcdaInformationRecipient,
  CcdaParticipant,
  CcdaRecordTarget,
  CcdaSection,
  CcdaTemplateId,
} from '../types';
import { createAllergyEntry } from './entries/allergy';
import { createPlanOfTreatmentCarePlanEntry } from './entries/careplan';
import { createCareTeamEntry } from './entries/careteam';
import { createClinicalImpressionEntry } from './entries/clinicalimpression';
import { createConditionEntry } from './entries/condition';
import { createDeviceUseStatementEntry } from './entries/deviceusestatement';
import { createDiagnosticReportEntry } from './entries/diagnosticreport';
import { createEncounterEntry } from './entries/encounter';
import { createGoalEntry } from './entries/goal';
import { createImmunizationEntry } from './entries/immunization';
import { createInsuranceEntry } from './entries/insurance';
import { createMedicationEntry } from './entries/medication';
import { createObservationEntry } from './entries/observation';
import { createHistoryOfProceduresEntry } from './entries/procedure';
import { createPlanOfTreatmentServiceRequestEntry } from './entries/servicerequest';
import { mapDocumentationOf } from './metadata';
import {
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
        return createEncounterEntry(this, resource);
      case 'Goal':
        return createGoalEntry(section, resource);
      case 'Immunization':
        return createImmunizationEntry(this, resource);
      case 'MedicationRequest':
        return createMedicationEntry(this, resource);
      case 'Procedure':
        return createHistoryOfProceduresEntry(this, resource);
      case 'Observation':
        return createObservationEntry(this, resource);
      case 'ServiceRequest':
        return createPlanOfTreatmentServiceRequestEntry(this, resource);
      default:
        return undefined;
    }
  }

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
      address = mainResource.address;
    }

    let telecom: ContactPoint[] | undefined = undefined;
    if ('telecom' in mainResource) {
      telecom = mainResource.telecom;
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
