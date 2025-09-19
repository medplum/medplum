// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, generateId, isUUID, LOINC, UCUM } from '@medplum/core';
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
  Encounter,
  EncounterDiagnosis,
  Extension,
  Goal,
  GoalTarget,
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
  RelatedPerson,
  Resource,
} from '@medplum/fhirtypes';
import { mapCcdaToFhirDate, mapCcdaToFhirDateTime } from './datetime';
import {
  OID_ALLERGIES_SECTION_ENTRIES_OPTIONAL,
  OID_ALLERGIES_SECTION_ENTRIES_OPTIONAL_V2,
  OID_ALLERGIES_SECTION_ENTRIES_REQUIRED,
  OID_ALLERGIES_SECTION_ENTRIES_REQUIRED_V2,
  OID_CARE_TEAMS_SECTION,
  OID_GOAL_OBSERVATION,
  OID_GOALS_SECTION,
  OID_HEALTH_CONCERNS_SECTION,
  OID_IMMUNIZATIONS_SECTION_ENTRIES_OPTIONAL,
  OID_IMMUNIZATIONS_SECTION_ENTRIES_REQUIRED,
  OID_MEDICATION_FREE_TEXT_SIG,
  OID_MEDICATIONS_SECTION_ENTRIES_REQUIRED,
  OID_NOTES_SECTION,
  OID_PAYERS_SECTION,
  OID_PLAN_OF_CARE_SECTION,
  OID_PROBLEMS_SECTION_ENTRIES_OPTIONAL,
  OID_PROBLEMS_SECTION_ENTRIES_REQUIRED,
  OID_PROBLEMS_SECTION_V2_ENTRIES_OPTIONAL,
  OID_PROBLEMS_SECTION_V2_ENTRIES_REQUIRED,
  OID_PROCEDURES_SECTION_ENTRIES_REQUIRED,
  OID_REASON_FOR_REFERRAL,
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
  mapCcdaCodeToCodeableConcept,
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
  CcdaId,
  CcdaName,
  CcdaObservation,
  CcdaOrganizer,
  CcdaOrganizerComponent,
  CcdaParticipant,
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

export interface CcdaToFhirOptions {
  ignoreUnsupportedSections?: boolean;
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

class CcdaToFhirConverter {
  private readonly ccda: Ccda;
  private readonly options: CcdaToFhirOptions | undefined;
  private readonly resources: Resource[] = [];
  private patient?: Patient;

  constructor(ccda: Ccda, options?: CcdaToFhirOptions) {
    this.ccda = ccda;
    this.options = options;
  }

  convert(): Bundle {
    this.processHeader();
    const composition = this.createComposition();

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

  private processHeader(): void {
    const patientRole = this.ccda.recordTarget?.[0]?.patientRole;
    if (patientRole) {
      this.patient = this.createPatient(patientRole);
      this.createRelatedPersons();
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

  private createRelatedPersons(): void {
    const participants = this.ccda.participant;
    if (!participants) {
      return;
    }

    for (const participant of participants) {
      const relatedPerson = this.mapParticipantToRelatedPerson(participant);
      if (relatedPerson) {
        this.resources.push(relatedPerson);
      }
    }
  }

  private mapParticipantToRelatedPerson(participant: CcdaParticipant): RelatedPerson | undefined {
    const patient = this.patient;
    if (!patient) {
      return undefined;
    }

    const associatedEntity = participant.associatedEntity;
    if (!associatedEntity) {
      return undefined;
    }

    const relationship = mapCcdaCodeToCodeableConcept(associatedEntity.code);

    return {
      resourceType: 'RelatedPerson',
      id: this.mapId(associatedEntity.id),
      patient: createReference(patient),
      relationship: relationship ? [relationship] : undefined,
      identifier: this.mapIdentifiers(associatedEntity.id),
      name: this.mapCcdaNameArrayFhirHumanNameArray(associatedEntity.associatedPerson?.name),
      address: this.mapAddresses(associatedEntity.addr),
      telecom: this.mapTelecom(associatedEntity.telecom),
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
      use: addr['@_use'] ? ADDRESS_USE_MAPPER.mapCcdaToFhir(addr['@_use']) : undefined,
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
      use: tel['@_use'] ? TELECOM_USE_MAPPER.mapCcdaToFhir(tel['@_use']) : undefined,
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
      }
    }

    for (const substanceAdmin of entry.substanceAdministration ?? []) {
      const resource = this.processSubstanceAdministration(section, substanceAdmin);
      if (resource) {
        resources.push(resource);
      }
    }

    for (const organizer of entry.organizer ?? []) {
      resources.push(this.processOrganizer(section, organizer));
    }

    for (const observation of entry.observation ?? []) {
      resources.push(this.processObservation(section, observation));
    }

    for (const encounter of entry.encounter ?? []) {
      resources.push(this.processEncounter(section, encounter));
    }

    for (const procedure of entry.procedure ?? []) {
      resources.push(this.processProcedure(section, procedure));
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

    const result = {
      coding: [
        {
          system: mapCcdaSystemToFhir(code['@_codeSystem']),
          code: code['@_code'],
          display: code['@_displayName'],
        },
      ],
      text: code['@_displayName'],
    };

    if (code.translation) {
      for (const translation of code.translation) {
        result.coding.push({
          system: mapCcdaSystemToFhir(translation['@_codeSystem']),
          code: translation['@_code'],
          display: translation['@_displayName'],
        });
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
    const category: CodeableConcept[] = [];
    if (observation.code) {
      category.push(this.mapCode(observation.code) as CodeableConcept);
    }

    const target: GoalTarget[] = [];

    let description: CodeableConcept | undefined = undefined;
    const ccdaValue = observation.value;
    if (ccdaValue) {
      const type = ccdaValue['@_xsi:type'];
      if (type === 'CD') {
        description = mapCcdaCodeToCodeableConcept(ccdaValue);
      } else if (type === 'ST') {
        description = { text: ccdaValue['#text'] ?? '' };
      }
    }

    if (observation.entryRelationship) {
      for (const entryRelationship of observation.entryRelationship) {
        target.push({
          measure: this.mapCode(entryRelationship.act?.[0]?.code) as CodeableConcept,
          detailCodeableConcept: this.mapCode(entryRelationship.act?.[0]?.code) as CodeableConcept,
          dueDate: mapCcdaToFhirDateTime(entryRelationship.act?.[0]?.effectiveTime?.[0]?.low?.['@_value']),
        });
      }
    }

    const result: Goal = {
      resourceType: 'Goal',
      id: this.mapId(observation.id),
      extension: this.mapTextReference(observation.text),
      identifier: this.mapIdentifiers(observation.id),
      lifecycleStatus: this.mapGoalLifecycleStatus(observation),
      category,
      description: description ?? { text: 'Unknown goal' },
      subject: createReference(this.patient as Patient),
      startDate: mapCcdaToFhirDate(observation.effectiveTime?.[0]?.['@_value']),
      target,
    };

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

        case 'INT': // Integer
          result.valueInteger = observation.value['@_value'] ? parseInt(observation.value['@_value'], 10) : undefined;
          break;

        default:
          console.warn(`Unhandled observation value type: ${observation.value['@_xsi:type']}`);
      }
    }

    if (observation.effectiveTime?.[0]?.['@_value']) {
      result.effectiveDateTime = mapCcdaToFhirDateTime(observation.effectiveTime?.[0]?.['@_value']);
    }

    result.extension = this.mapTextReference(observation.text);

    // Look for child observations
    const relationships = observation.entryRelationship;
    if (relationships) {
      for (const relationship of relationships) {
        const childObservation = relationship.observation;
        if (childObservation) {
          for (const child of childObservation) {
            const childResource = this.processVitalsObservation(child);
            this.resources.push(childResource);
            if (!result.hasMember) {
              result.hasMember = [];
            }
            result.hasMember.push(createReference(childResource));
          }
        }
      }
    }

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
      result.participant = encounter.performer.map((performer) => ({
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
        .filter((rel) => rel['@_typeCode'] === 'RSON')
        .map((rel) => {
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
      status: PROCEDURE_STATUS_MAPPER.mapCcdaToFhirWithDefault(
        procedure.statusCode?.['@_code'],
        'completed'
      ) as Procedure['status'],
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
