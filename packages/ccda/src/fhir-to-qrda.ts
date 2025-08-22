// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { formatHl7DateTime, generateId } from '@medplum/core';
import { Bundle, Composition, Condition, Coverage, Encounter, Patient, Procedure } from '@medplum/fhirtypes';
import {
  findResource,
  mapFhirAddressArrayToCcdaAddressArray,
  mapIdentifiers,
  mapPatient,
  mapTelecom,
} from './cda-utils';
import { mapFhirToCcdaDateTime } from './datetime';
import {
  OID_ENCOUNTER_ACTIVITIES,
  OID_HL7_REGISTERED_MODELS,
  OID_LOINC_CODE_SYSTEM,
  OID_PROCEDURE_ACTIVITY_ACT,
  OID_PROCEDURE_ACTIVITY_PROCEDURE,
  OID_SNOMED_CT_CODE_SYSTEM,
} from './oids';
import {
  HL7_ACT_CODE_SYSTEM,
  LOINC_DIAGNOSIS,
  LOINC_MEASURE_DOCUMENT,
  LOINC_PATIENT_DATA,
  LOINC_PAYMENT_SOURCE,
  LOINC_QUALITY_MEASURE_REPORT,
  LOINC_REASON_CARE_ACTION,
  LOINC_REPORTING_PARAMETERS,
  OID_AUTHOR_DATETIME,
  OID_EMEASURE_REFERENCE_QDM,
  OID_ENCOUNTER_DIAGNOSIS_QDM,
  OID_ENCOUNTER_PERFORMED,
  OID_INTERVENTION_PERFORMED,
  OID_MEASURE_REFERENCE,
  OID_MEASURE_SECTION,
  OID_MEASURE_SECTION_QDM,
  OID_NEGATION_RATIONALE,
  OID_PATIENT_CHARACTERISTIC_PAYER,
  OID_PATIENT_DATA_SECTION,
  OID_PATIENT_DATA_SECTION_QDM,
  OID_PATIENT_DATA_SECTION_QDM_V2,
  OID_PROCEDURE_PERFORMED,
  OID_RANK_OBSERVATION,
  OID_REPORTING_PARAMETERS_ACT,
  OID_REPORTING_PARAMETERS_ACT_V2,
  OID_REPORTING_PARAMETERS_SECTION,
  OID_REPORTING_PARAMETERS_SECTION_V2,
  PAYMENT_TYPOLOGY_SYSTEM,
  QRDA_CATEGORY_I_TEMPLATE_IDS,
  SNOMED_OBSERVATION_PARAMETERS,
  SNOMED_RANK,
} from './qrda-oids';
import { CONFIDENTIALITY_MAPPER, mapCodeableConceptToCcdaCode } from './systems';
import { CcdaRecordTarget, Qrda } from './types';

export interface FhirToQrdaOptions {
  /**
   * Category of QRDA document to generate.
   * Currently only Category I is supported.
   */
  type?: 'category-i' | 'category-iii';

  /**
   * Measure period start date.
   */
  measurePeriodStart: string;

  /**
   * Measure period end date.
   */
  measurePeriodEnd: string;

  /**
   * Measure identifier and metadata.
   */
  measure?: {
    id: string;
    title: string;
    versionSpecificIdentifier: string;
    setId: string;
  };
}

/**
 * Convert a FHIR bundle to a QRDA Category I document.
 * @param bundle - The FHIR bundle to convert.
 * @param options - QRDA generation options.
 * @returns The QRDA document.
 */
export function convertFhirToQrda(bundle: Bundle, options: FhirToQrdaOptions): Qrda {
  return new FhirToQrdaConverter(bundle, options).convert();
}

/**
 * The FhirToQrdaConverter class is responsible for converting a FHIR bundle to a QRDA document.
 */
class FhirToQrdaConverter {
  private readonly bundle: Bundle;
  private readonly options: FhirToQrdaOptions;
  private readonly composition: Composition;
  private readonly patient: Patient;

  /**
   * Creates a new FhirToQrdaConverter for the given FHIR bundle.
   * @param bundle - The FHIR bundle to convert.
   * @param options - QRDA generation options.
   */
  constructor(bundle: Bundle, options: FhirToQrdaOptions) {
    this.bundle = bundle;
    this.options = options;

    const composition = findResource(bundle, 'Composition');
    if (!composition) {
      throw new Error('Composition not found');
    }

    const patient = findResource(bundle, 'Patient');
    if (!patient) {
      throw new Error('Patient not found');
    }

    this.composition = composition;
    this.patient = patient;
  }

  /**
   * Convert the FHIR bundle to a QRDA document.
   * @returns The QRDA document.
   */
  convert(): Qrda {
    const currentDateTime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

    // Get encounters, procedures, and coverages from the bundle
    const encounters = this.getEncounters();
    const interventions = this.getInterventions();
    const procedures = this.getProcedures();
    const coverages = this.getCoverages();

    // Be careful! Order is important!
    return {
      realmCode: { '@_code': 'US' },
      typeId: { '@_root': OID_HL7_REGISTERED_MODELS, '@_extension': 'POCD_HD000040' },
      // Currently only Category I is supported (this.options.type)
      templateId: QRDA_CATEGORY_I_TEMPLATE_IDS,
      id: { '@_root': this.composition.id },
      // QRDA document type code
      code: {
        '@_code': LOINC_QUALITY_MEASURE_REPORT,
        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
        '@_codeSystemName': 'LOINC',
        '@_displayName': 'Quality Measure Report',
      },
      title: 'QRDA Incidence Report',
      effectiveTime: { '@_value': mapFhirToCcdaDateTime(this.composition.date) },
      // confidentialityCode: { '@_code': 'N', '@_codeSystem': '2.16.840.1.113883.5.25' },
      confidentialityCode: this.composition.confidentiality
        ? CONFIDENTIALITY_MAPPER.mapFhirToCcdaCode(this.composition.confidentiality)
        : undefined,
      languageCode: { '@_code': this.composition.language ?? 'en-US' },

      // // Patient Information
      // recordTarget: this.createRecordTarget(),

      // // Author
      // author: this.createAuthor(currentDateTime),

      // // Custodian
      // custodian: this.createCustodian(),

      // // Legal Authenticator
      // legalAuthenticator: this.createLegalAuthenticator(currentDateTime),

      // // Participant
      // participant: this.createParticipant(),

      // // Documentation
      // documentationOf: this.createDocumentationOf(),

      // // Body
      // component: {
      //   structuredBody: {
      //     component: [
      //       this.createMeasureSection(),
      //       this.createReportingParametersSection(),
      //       this.createPatientDataSection(encounters, interventions, procedures, coverages),
      //     ],
      //   },
      // },
    };
  }

  /**
   * Get encounters from the bundle.
   * @returns Array of encounters and related conditions.
   */
  private getEncounters(): (Encounter | Condition)[] {
    const resources: (Encounter | Condition)[] = [];

    this.bundle.entry?.forEach((entry) => {
      if (entry.resource?.resourceType === 'Encounter' || entry.resource?.resourceType === 'Condition') {
        resources.push(entry.resource as Encounter | Condition);
      }
    });

    return resources;
  }

  /**
   * Get intervention procedures from the bundle.
   * @returns Array of intervention procedures.
   */
  private getInterventions(): Procedure[] {
    const procedures: Procedure[] = [];

    this.bundle.entry?.forEach((entry) => {
      if (entry.resource?.resourceType === 'Procedure') {
        const procedure = entry.resource as Procedure;
        // Check if it's an intervention (category = counseling)
        if (procedure.category?.coding?.[0]?.code === '409063005') {
          procedures.push(procedure);
        }
      }
    });

    return procedures;
  }

  /**
   * Get procedures from the bundle.
   * @returns Array of procedures.
   */
  private getProcedures(): Procedure[] {
    const procedures: Procedure[] = [];

    this.bundle.entry?.forEach((entry) => {
      if (entry.resource?.resourceType === 'Procedure') {
        const procedure = entry.resource as Procedure;
        // Check if it's a diagnostic procedure (category = diagnostic procedure)
        if (procedure.category?.coding?.[0]?.code === '103693007') {
          procedures.push(procedure);
        }
      }
    });

    return procedures;
  }

  /**
   * Get coverages from the bundle.
   * @returns Array of coverages.
   */
  private getCoverages(): Coverage[] {
    const coverages: Coverage[] = [];

    this.bundle.entry?.forEach((entry) => {
      if (entry.resource?.resourceType === 'Coverage') {
        coverages.push(entry.resource as Coverage);
      }
    });

    return coverages;
  }

  /**
   * Create the record target for the QRDA document.
   * @returns The record target.
   */
  private createRecordTarget(): CcdaRecordTarget[] {
    return [
      {
        patientRole: {
          id: { '@_extension': this.patient.id, '@_root': '1.3.6.1.4.1.115' },
          addr: mapFhirAddressArrayToCcdaAddressArray(this.patient.address),
          telecom: mapTelecom(this.patient.telecom),
          patient: mapPatient(this.patient),
        },
      },
    ];
  }

  /**
   * Create the author section.
   * @param currentDateTime - The current date/time for the document.
   * @returns The author section.
   */
  private createAuthor(currentDateTime: string): Record<string, any> {
    return {
      time: { '@_value': currentDateTime },
      assignedAuthor: {
        id: { '@_extension': '1250504853', '@_root': '2.16.840.1.113883.4.6' },
        addr: {
          streetAddressLine: '123 Medical Center Dr',
          city: 'Anytown',
          state: 'CA',
          postalCode: '12345',
          country: 'US',
        },
        telecom: { '@_use': 'WP', '@_value': 'tel:(555)123-4567' },
        assignedAuthoringDevice: {
          manufacturerModelName: 'Medplum',
          softwareName: 'Medplum QRDA Generator',
        },
      },
    };
  }

  /**
   * Create the custodian section.
   * @returns The custodian section.
   */
  private createCustodian(): Record<string, any> {
    return {
      assignedCustodian: {
        representedCustodianOrganization: {
          id: { '@_extension': '117323', '@_root': '2.16.840.1.113883.4.336' },
          name: 'Medplum Healthcare Organization',
          telecom: { '@_use': 'WP', '@_value': 'tel:(555)123-4567' },
          addr: {
            '@_use': 'WP',
            streetAddressLine: '123 Medical Center Dr',
            city: 'Anytown',
            state: 'CA',
            postalCode: '12345',
            country: 'US',
          },
        },
      },
    };
  }

  /**
   * Create the legal authenticator section.
   * @param currentDateTime - The current date/time for the document.
   * @returns The legal authenticator section.
   */
  private createLegalAuthenticator(currentDateTime: string): Record<string, any> {
    return {
      time: { '@_value': currentDateTime },
      signatureCode: { '@_code': 'S' },
      assignedEntity: {
        id: { '@_root': generateId() },
        addr: {
          streetAddressLine: '123 Medical Center Dr',
          city: 'Anytown',
          state: 'CA',
          postalCode: '12345',
          country: 'US',
        },
        telecom: { '@_use': 'WP', '@_value': 'tel:(555)123-4567' },
        assignedPerson: {
          name: {
            given: 'John',
            family: 'Doe',
          },
        },
        representedOrganization: {
          id: { '@_root': '2.16.840.1.113883.19.5' },
          name: 'Medplum Healthcare Organization',
        },
      },
    };
  }

  /**
   * Create the participant section.
   * @returns The participant section.
   */
  private createParticipant(): Record<string, any> {
    return {
      '@_typeCode': 'DEV',
      associatedEntity: {
        '@_classCode': 'RGPR',
        id: { '@_extension': generateId(), '@_root': '2.16.840.1.113883.3.2074.1' },
      },
    };
  }

  /**
   * Create the documentation section.
   * @returns The documentation section.
   */
  private createDocumentationOf(): Record<string, any> {
    return {
      '@_typeCode': 'DOC',
      serviceEvent: {
        '@_classCode': 'PCPR',
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
              { '@_extension': '1250504853', '@_root': '2.16.840.1.113883.4.6' },
              { '@_extension': '117323', '@_root': '2.16.840.1.113883.4.336' },
            ],
            code: {
              '@_code': '207Q00000X',
              '@_codeSystem': '2.16.840.1.113883.6.101',
              '@_codeSystemName': 'Healthcare Provider Taxonomy (HIPAA)',
            },
            addr: {
              '@_use': 'WP',
              streetAddressLine: '123 Medical Center Dr',
              city: 'Anytown',
              state: 'CA',
              postalCode: '12345',
              country: 'US',
            },
            assignedPerson: {
              name: {
                given: 'Jane',
                family: 'Smith',
              },
            },
            representedOrganization: {
              id: { '@_extension': '916854671', '@_root': '2.16.840.1.113883.4.2' },
              addr: {
                '@_use': 'WP',
                streetAddressLine: '123 Medical Center Dr',
                city: 'Anytown',
                state: 'CA',
                postalCode: '12345',
                country: 'US',
              },
            },
          },
        },
      },
    };
  }

  /**
   * Create the measure section.
   * @returns The measure section.
   */
  private createMeasureSection(): Record<string, any> {
    const measure = this.options.measure || {
      id: '8A6D0454-8DF0-2D9F-018D-F6AEBA950637',
      title: 'Documentation of current medications in the medical record',
      versionSpecificIdentifier: '8A6D0454-8DF0-2D9F-018D-F6AEBA950637',
      setId: '9A032D9C-3D9B-11E1-8634-00237D5BF174',
    };

    return {
      section: {
        templateId: [{ '@_root': OID_MEASURE_SECTION }, { '@_root': OID_MEASURE_SECTION_QDM }],
        code: { '@_code': LOINC_MEASURE_DOCUMENT, '@_codeSystem': OID_LOINC_CODE_SYSTEM },
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
                td: [measure.title, measure.versionSpecificIdentifier],
              },
            },
          },
        },
        entry: {
          organizer: {
            '@_classCode': 'CLUSTER',
            '@_moodCode': 'EVN',
            templateId: [{ '@_root': OID_MEASURE_REFERENCE }, { '@_root': OID_EMEASURE_REFERENCE_QDM }],
            id: { '@_extension': generateId(), '@_root': '1.3.6.1.4.1.115' },
            statusCode: { '@_code': 'completed' },
            reference: {
              '@_typeCode': 'REFR',
              externalDocument: {
                '@_classCode': 'DOC',
                '@_moodCode': 'EVN',
                id: { '@_extension': measure.id, '@_root': '2.16.840.1.113883.4.738' },
                text: measure.title,
                setId: { '@_root': measure.setId },
              },
            },
          },
        },
      },
    };
  }

  /**
   * Create the reporting parameters section.
   * @returns The reporting parameters section.
   */
  private createReportingParametersSection(): Record<string, any> {
    return {
      section: {
        templateId: [
          { '@_root': OID_REPORTING_PARAMETERS_SECTION },
          { '@_root': OID_REPORTING_PARAMETERS_SECTION_V2, '@_extension': '2016-03-01' },
        ],
        code: { '@_code': LOINC_REPORTING_PARAMETERS, '@_codeSystem': OID_LOINC_CODE_SYSTEM },
        title: 'Reporting Parameters',
        text: '',
        entry: {
          '@_typeCode': 'DRIV',
          act: {
            '@_classCode': 'ACT',
            '@_moodCode': 'EVN',
            templateId: [
              { '@_root': OID_REPORTING_PARAMETERS_ACT },
              { '@_root': OID_REPORTING_PARAMETERS_ACT_V2, '@_extension': '2016-03-01' },
            ],
            id: { '@_extension': generateId(), '@_root': '1.3.6.1.4.1.115' },
            code: {
              '@_code': SNOMED_OBSERVATION_PARAMETERS,
              '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
              '@_displayName': 'Observation Parameters',
            },
            effectiveTime: {
              low: { '@_value': formatHl7DateTime(this.options.measurePeriodStart) },
              high: { '@_value': formatHl7DateTime(this.options.measurePeriodEnd) },
            },
          },
        },
      },
    };
  }

  /**
   * Create the patient data section.
   * @param encounters - Array of encounters and conditions.
   * @param interventions - Array of interventions.
   * @param procedures - Array of procedures.
   * @param coverages - Array of coverages.
   * @returns The patient data section.
   */
  private createPatientDataSection(
    encounters: (Encounter | Condition)[],
    interventions: Procedure[],
    procedures: Procedure[],
    coverages: Coverage[]
  ): Record<string, any> {
    const entries: any[] = [];

    // Add encounter entries
    encounters.forEach((encounter) => {
      if (encounter.resourceType === 'Encounter') {
        const diagnosis = encounter.diagnosis?.[0];
        const condition = encounters.find(
          (e) => e.resourceType === 'Condition' && e.id === diagnosis?.condition?.reference?.split('/')[1]
        ) as Condition | undefined;

        entries.push(this.createEncounterEntry(encounter, condition, diagnosis?.rank));
      }
    });

    // Add intervention entries
    interventions.forEach((intervention) => {
      entries.push(this.createInterventionEntry(intervention));
    });

    // Add procedure entries
    procedures.forEach((procedure) => {
      entries.push(this.createProcedureEntry(procedure));
    });

    // Add payer entries
    coverages.forEach((coverage) => {
      entries.push(this.createPayerEntry(coverage));
    });

    return {
      section: {
        templateId: [
          { '@_root': OID_PATIENT_DATA_SECTION },
          { '@_root': OID_PATIENT_DATA_SECTION_QDM, '@_extension': '2021-08-01' },
          { '@_root': OID_PATIENT_DATA_SECTION_QDM_V2, '@_extension': '2022-02-01' },
        ],
        code: { '@_code': LOINC_PATIENT_DATA, '@_codeSystem': OID_LOINC_CODE_SYSTEM },
        title: 'Patient Data',
        text: '',
        entry: entries,
      },
    };
  }

  /**
   * Create an encounter entry.
   * @param encounter - The encounter resource.
   * @param diagnosisCondition - The related diagnosis condition.
   * @param diagnosisConditionRank - The rank of the diagnosis.
   * @returns The encounter entry.
   */
  private createEncounterEntry(
    encounter: Encounter,
    diagnosisCondition?: Condition,
    diagnosisConditionRank?: number
  ): Record<string, any> {
    const periodStart = encounter.period?.start;
    const periodEnd = encounter.period?.end;

    const entry: Record<string, any> = {
      encounter: {
        '@_classCode': 'ENC',
        '@_moodCode': 'EVN',
        templateId: [
          { '@_root': OID_ENCOUNTER_ACTIVITIES, '@_extension': '2015-08-01' },
          { '@_root': OID_ENCOUNTER_PERFORMED, '@_extension': '2021-08-01' },
        ],
        id: mapIdentifiers(encounter.id, encounter.identifier),
        code: mapCodeableConceptToCcdaCode(encounter.type?.[0]) || {
          '@_code': '99213',
          '@_codeSystem': '2.16.840.1.113883.6.12',
          '@_codeSystemName': 'CPT',
        },
        statusCode: { '@_code': 'completed' },
        effectiveTime: {
          low: { '@_value': periodStart ? formatHl7DateTime(periodStart) : '' },
          high: { '@_value': periodEnd ? formatHl7DateTime(periodEnd) : '' },
        },
      },
    };

    // Add diagnosis if present
    if (diagnosisCondition && diagnosisConditionRank) {
      entry.encounter.entryRelationship = {
        '@_typeCode': 'REFR',
        observation: {
          '@_classCode': 'OBS',
          '@_moodCode': 'EVN',
          templateId: { '@_root': OID_ENCOUNTER_DIAGNOSIS_QDM, '@_extension': '2019-12-01' },
          code: {
            '@_code': LOINC_DIAGNOSIS,
            '@_codeSystem': OID_LOINC_CODE_SYSTEM,
          },
          value: {
            '@_code': diagnosisCondition.code?.coding?.[0]?.code || '',
            '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
            '@_codeSystemName': 'SNOMEDCT',
            '@_xsi:type': 'CD',
          },
          entryRelationship: {
            '@_typeCode': 'REFR',
            observation: {
              '@_classCode': 'OBS',
              '@_moodCode': 'EVN',
              templateId: { '@_root': OID_RANK_OBSERVATION, '@_extension': '2019-12-01' },
              code: { '@_code': SNOMED_RANK, '@_displayName': 'Rank', '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM },
              value: { '@_xsi:type': 'INT', '@_value': diagnosisConditionRank.toString() },
            },
          },
        },
      };
    }

    // Add class information
    if (encounter.class?.code && encounter.class.code !== 'UNK') {
      if (!entry.encounter.entryRelationship) {
        entry.encounter.entryRelationship = [];
      } else if (!Array.isArray(entry.encounter.entryRelationship)) {
        entry.encounter.entryRelationship = [entry.encounter.entryRelationship];
      }

      entry.encounter.entryRelationship.push({
        '@_typeCode': 'REFR',
        act: {
          '@_classCode': 'ACT',
          '@_moodCode': 'EVN',
          templateId: [{ '@_root': '2.16.840.1.113883.10.20.24.3.171', '@_extension': '2021-08-01' }],
          code: {
            '@_code': encounter.class.code,
            '@_codeSystem': HL7_ACT_CODE_SYSTEM,
            '@_codeSystemName': 'HL7 Act Code',
          },
        },
      });
    }

    return entry;
  }

  /**
   * Create an intervention entry.
   * @param intervention - The intervention procedure.
   * @returns The intervention entry.
   */
  private createInterventionEntry(intervention: Procedure): Record<string, any> {
    const performedDateTime = intervention.performedDateTime;
    const performedPeriodStart = intervention.performedPeriod?.start;

    const entry: Record<string, any> = {
      act: {
        '@_classCode': 'ACT',
        '@_moodCode': 'EVN',
        '@_negationInd': 'false',
        templateId: [
          { '@_root': OID_PROCEDURE_ACTIVITY_ACT, '@_extension': '2014-06-09' },
          { '@_root': OID_INTERVENTION_PERFORMED, '@_extension': '2021-08-01' },
        ],
        id: mapIdentifiers(intervention.id, intervention.identifier),
        code: mapCodeableConceptToCcdaCode(intervention.code) || {
          '@_code': '409063005',
          '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
          '@_codeSystemName': 'SNOMEDCT',
        },
        text: intervention.code?.coding?.[0]?.display || '',
        statusCode: { '@_code': 'completed' },
        effectiveTime: {
          '@_value': performedPeriodStart ? formatHl7DateTime(performedPeriodStart) : undefined,
          '@_nullFlavor': !performedPeriodStart ? 'UNK' : undefined,
        },
      },
    };

    // Add author dateTime if present
    if (performedDateTime) {
      entry.act.author = {
        templateId: { '@_root': OID_AUTHOR_DATETIME, '@_extension': '2019-12-01' },
        time: { '@_value': formatHl7DateTime(performedDateTime) },
        assignedAuthor: {
          id: { '@_nullFlavor': 'NA' },
        },
      };
    }

    // Add negation rationale if present
    if (intervention.statusReason?.coding?.[0]) {
      entry.act.entryRelationship = {
        '@_typeCode': 'RSON',
        observation: {
          '@_classCode': 'OBS',
          '@_moodCode': 'EVN',
          templateId: { '@_root': OID_NEGATION_RATIONALE, '@_extension': '2017-08-01' },
          code: {
            '@_code': LOINC_REASON_CARE_ACTION,
            '@_codeSystem': OID_LOINC_CODE_SYSTEM,
            '@_displayName': 'reason',
            '@_codeSystemName': 'LOINC',
          },
          value: {
            '@_code': intervention.statusReason.coding[0].code || '',
            '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
            '@_codeSystemName': 'SNOMEDCT',
            '@_xsi:type': 'CD',
          },
        },
      };
    }

    return entry;
  }

  /**
   * Create a procedure entry.
   * @param procedure - The procedure resource.
   * @returns The procedure entry.
   */
  private createProcedureEntry(procedure: Procedure): Record<string, any> {
    const performedDateTime = procedure.performedDateTime;
    const performedPeriodStart = procedure.performedPeriod?.start;

    const entry: Record<string, any> = {
      procedure: {
        '@_classCode': 'PROC',
        '@_moodCode': 'EVN',
        '@_negationInd': 'false',
        templateId: [
          { '@_root': OID_PROCEDURE_PERFORMED, '@_extension': '2021-08-01' },
          { '@_root': OID_PROCEDURE_ACTIVITY_PROCEDURE, '@_extension': '2014-06-09' },
        ],
        id: mapIdentifiers(procedure.id, procedure.identifier),
        code: mapCodeableConceptToCcdaCode(procedure.code) || {
          '@_code': '103693007',
          '@_codeSystem': OID_SNOMED_CT_CODE_SYSTEM,
          '@_codeSystemName': 'SNOMEDCT',
        },
        text: procedure.code?.coding?.[0]?.display || '',
        statusCode: { '@_code': 'completed' },
        effectiveTime: {
          '@_value': performedPeriodStart ? formatHl7DateTime(performedPeriodStart) : undefined,
          '@_nullFlavor': !performedPeriodStart ? 'UNK' : undefined,
        },
      },
    };

    // Add author dateTime if present
    if (performedDateTime) {
      entry.procedure.author = {
        templateId: { '@_root': OID_AUTHOR_DATETIME, '@_extension': '2019-12-01' },
        time: { '@_value': formatHl7DateTime(performedDateTime) },
        assignedAuthor: {
          id: { '@_nullFlavor': 'NA' },
        },
      };
    }

    return entry;
  }

  /**
   * Create a payer entry.
   * @param coverage - The coverage resource.
   * @returns The payer entry.
   */
  private createPayerEntry(coverage: Coverage): Record<string, any> {
    const periodStart = coverage.period?.start;

    return {
      observation: {
        '@_classCode': 'OBS',
        '@_moodCode': 'EVN',
        templateId: { '@_root': OID_PATIENT_CHARACTERISTIC_PAYER },
        id: { '@_root': coverage.id || generateId() },
        code: {
          '@_code': LOINC_PAYMENT_SOURCE,
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
          '@_code': coverage.type?.coding?.[0]?.code || '',
          '@_codeSystem': PAYMENT_TYPOLOGY_SYSTEM,
          '@_codeSystemName': 'Source of Payment Typology',
        },
      },
    };
  }
}
