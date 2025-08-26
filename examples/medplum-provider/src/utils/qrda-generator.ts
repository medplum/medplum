// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatHl7DateTime, getExtensionValue, MedplumClient, resolveId, SNOMED } from '@medplum/core';
import { Patient, Encounter, Coding, Procedure, Condition, Coverage } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { XMLBuilder } from 'fast-xml-parser';
import { extensionURLMapping } from './intake-utils';

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
 * Generates a QRDA Category I XML document for CMS68v14 measure
 * @param medplum - Medplum client instance
 * @param params - Parameters for QRDA generation
 * @returns Generated XML string or null if patient has no data to export
 */
export async function generateQRDACategoryI(
  medplum: MedplumClient,
  params: QRDAGenerationParams
): Promise<string | null> {
  // Fetch patient data
  const patientData = await fetchPatientData(
    medplum,
    params.patientId,
    params.measurePeriodStart,
    params.measurePeriodEnd
  );

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

  // Convert to XML string
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
    suppressBooleanAttributes: false,
  });

  const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n';
  return xmlHeader + builder.build(qrdaDocument);
}

/**
 * Fetches all necessary FHIR resources for a patient
 * @param medplum - Medplum client instance
 * @param patientId - The patient ID to fetch data for
 * @param periodStart - Start datetime of the measure period
 * @param periodEnd - End datetime of the measure period (not currently used in search)
 * @returns Promise<QRDAPatientData> - Patient data including demographics, medications, and encounters
 */
export async function fetchPatientData(
  medplum: MedplumClient,
  patientId: string,
  periodStart: string,
  periodEnd: string
): Promise<QRDAPatientData> {
  // Fetch patient
  const patient = await medplum.readResource('Patient', patientId);

  // Fetch encounters during measure period with included diagnosis conditions
  const encounters = await medplum.searchResources('Encounter', [
    ['subject', `Patient/${patientId}`],
    ['date', `ge${periodStart}`],
    ['date', `le${periodEnd}`],
    ['_sort', 'date'],
    ['_include', 'Encounter:diagnosis:condition'],
  ]);

  // Fetch interventions during measure period
  const interventions = await medplum.searchResources('Procedure', [
    ['category', `${SNOMED}|409063005`],
    ['subject', `Patient/${patientId}`],
    ['date', `ge${periodStart}`],
    ['date', `le${periodEnd}`],
    ['_sort', 'date'],
  ]);

  // Fetch procedures during measure period
  const procedures = await medplum.searchResources('Procedure', [
    ['category', `${SNOMED}|103693007`],
    ['subject', `Patient/${patientId}`],
    ['date', `ge${periodStart}`],
    ['date', `le${periodEnd}`],
    ['_sort', 'date'],
  ]);

  // NOTE: There is no date filter for coverages. See https://hl7.org/fhir/R4/coverage.html
  const coverages = await medplum.searchResources('Coverage', {
    beneficiary: `Patient/${patientId}`,
  });

  return {
    patient,
    encounters,
    interventions,
    procedures,
    coverages,
  };
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
        { '@_root': '2.16.840.1.113883.10.20.22.1.1', '@_extension': '2015-08-01' },
        // QRDA templateId
        { '@_root': '2.16.840.1.113883.10.20.24.1.1', '@_extension': '2017-08-01' },
        // QDM-based QRDA templateId
        { '@_root': '2.16.840.1.113883.10.20.24.1.2', '@_extension': '2021-08-01' },
        // CMS QRDA templateId - QRDA Category I Report - CMS (V8)
        { '@_root': '2.16.840.1.113883.10.20.24.1.3', '@_extension': '2022-02-01' },
      ],
      id: { '@_root': documentId },
      // QRDA document type code
      code: {
        '@_code': '55182-0',
        '@_codeSystem': '2.16.840.1.113883.6.1',
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
  const patientName = patient.name?.[0];
  const address = patient.address?.[0];
  const telecom = patient.telecom?.find((t) => t.system === 'phone');
  const email = patient.telecom?.find((t) => t.system === 'email');
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
    patientRole: {
      id: {
        '@_extension': patient.id,
        '@_root': '1.3.6.1.4.1.115',
      },
      addr: address
        ? {
            '@_use': 'HP',
            streetAddressLine: address.line?.[0] ?? '',
            city: address.city ?? '',
            state: address.state ?? '',
            postalCode: address.postalCode ?? '',
            country: address.country || 'US',
          }
        : undefined,
      telecom: [
        telecom ? { '@_use': 'HP', '@_value': `tel:${telecom.value}` } : undefined,
        email ? { '@_use': 'HP', '@_value': `mailto:${email.value}` } : undefined,
      ].filter(Boolean),
      patient: {
        name: {
          given: patientName?.given?.[0] ?? '',
          family: patientName?.family ?? '',
        },
        administrativeGenderCode: {
          '@_code': patient.gender,
          '@_codeSystem': '2.16.840.1.113883.5.1',
          '@_codeSystemName': 'AdministrativeGender',
        },
        birthTime: { '@_value': formatHl7DateTime(birthDateTime) },
        raceCode: {
          '@_code': raceExtension?.code ?? '',
          '@_codeSystem': '2.16.840.1.113883.6.238',
          '@_codeSystemName': 'CDCREC',
        },
        ethnicGroupCode: {
          '@_code': ethnicityExtension?.code || '2135-2', // Default to Hispanic or Latino if not found
          '@_codeSystem': '2.16.840.1.113883.6.238',
          '@_codeSystemName': 'CDCREC',
        },
        languageCommunication: {
          templateId: [
            { '@_root': '2.16.840.1.113883.3.88.11.83.2', '@_assigningAuthorityName': 'HITSP/C83' },
            { '@_root': '1.3.6.1.4.1.19376.1.5.3.1.2.1', '@_assigningAuthorityName': 'IHE/PCC' },
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
  // NOTE: This is a placeholder for the author section.
  return {
    time: { '@_value': currentDateTime },
    assignedAuthor: {
      // NPI
      id: { '@_extension': '1250504853', '@_root': '2.16.840.1.113883.4.6' },
      addr: {
        streetAddressLine: '123 Happy St',
        city: 'Sunnyvale',
        state: 'CA',
        postalCode: '95008',
        country: 'US',
      },
      telecom: { '@_use': 'WP', '@_value': 'tel:(781)271-3000' },
      assignedAuthoringDevice: {
        manufacturerModelName: 'Medplum Test System',
        softwareName: 'Medplum Test System',
      },
    },
  };
}

/**
 * Builds the custodian section
 * @returns The custodian section for the QRDA document
 */
function buildCustodian(): Record<string, any> {
  // NOTE: This is a placeholder for the custodian section.
  return {
    assignedCustodian: {
      representedCustodianOrganization: {
        id: { '@_extension': '117323', '@_root': '2.16.840.1.113883.4.336' },
        name: 'Medplum Test Deck',
        telecom: { '@_use': 'WP', '@_value': 'tel:(781)271-3000' },
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
  };
}

/**
 * Builds the legal authenticator section
 * @param currentDateTime - The current date/time for the document
 * @returns The legal authenticator section for the QRDA document
 */
function buildLegalAuthenticator(currentDateTime: string): Record<string, any> {
  // NOTE: This is a placeholder for the legal authenticator section.
  return {
    time: { '@_value': currentDateTime },
    signatureCode: { '@_code': 'S' },
    assignedEntity: {
      id: { '@_root': randomUUID() },
      addr: {
        streetAddressLine: '123 Happy St',
        city: 'Sunnyvale',
        state: 'CA',
        postalCode: '95008',
        country: 'US',
      },
      telecom: { '@_use': 'WP', '@_value': 'tel:(781)271-3000' },
      assignedPerson: {
        name: {
          given: 'John',
          family: 'Doe',
        },
      },
      representedOrganization: {
        id: { '@_root': '2.16.840.1.113883.19.5' },
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
      id: { '@_extension': '0015CPV4ZTB4WBU', '@_root': '2.16.840.1.113883.3.2074.1' },
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
            { '@_extension': '1250504853', '@_root': '2.16.840.1.113883.4.6' },
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
        { '@_root': '2.16.840.1.113883.10.20.24.2.2' },
        // This is the templateId for Measure Section QDM
        { '@_root': '2.16.840.1.113883.10.20.24.2.3' },
      ],
      // This is the LOINC code for "Measure document". This stays the same for all measure section required by QRDA standard
      code: { '@_code': '55186-1', '@_codeSystem': '2.16.840.1.113883.6.1' },
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
            { '@_root': '2.16.840.1.113883.10.20.24.3.98' },
            // This is the templateId for eMeasure Reference QDM
            { '@_root': '2.16.840.1.113883.10.20.24.3.97' },
          ],
          id: { '@_extension': randomUUID(), '@_root': '1.3.6.1.4.1.115' },
          statusCode: { '@_code': 'completed' },
          // Containing isBranch external references
          reference: {
            '@_typeCode': 'REFR',
            externalDocument: {
              '@_classCode': 'DOC',
              '@_moodCode': 'EVN',
              id: { '@_extension': '8A6D0454-8DF0-2D9F-018D-F6AEBA950637', '@_root': '2.16.840.1.113883.4.738' },
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
        { '@_root': '2.16.840.1.113883.10.20.17.2.1' },
        { '@_root': '2.16.840.1.113883.10.20.17.2.1.1', '@_extension': '2016-03-01' },
      ],
      code: { '@_code': '55187-9', '@_codeSystem': '2.16.840.1.113883.6.1' },
      title: 'Reporting Parameters',
      text: '',
      entry: {
        '@_typeCode': 'DRIV',
        act: {
          '@_classCode': 'ACT',
          '@_moodCode': 'EVN',
          // This is the templateId for Reporting Parameters Act
          templateId: [
            { '@_root': '2.16.840.1.113883.10.20.17.3.8' },
            { '@_root': '2.16.840.1.113883.10.20.17.3.8.1', '@_extension': '2016-03-01' },
          ],
          id: { '@_extension': randomUUID(), '@_root': '1.3.6.1.4.1.115' },
          code: {
            '@_code': '252116004',
            '@_codeSystem': '2.16.840.1.113883.6.96',
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

  return {
    encounter: {
      '@_classCode': 'ENC',
      '@_moodCode': 'EVN',
      templateId: [
        // Encounter activities template
        { '@_root': '2.16.840.1.113883.10.20.22.4.49', '@_extension': '2015-08-01' },
        // Encounter performed template
        { '@_root': '2.16.840.1.113883.10.20.24.3.23', '@_extension': '2021-08-01' },
      ],
      id: { '@_extension': encounter.id, '@_root': '1.3.6.1.4.1.115' },
      // QDM Attribute: Code
      code: {
        '@_code': encounter.type?.[0]?.coding?.[0]?.code ?? '',
        '@_codeSystem': '2.16.840.1.113883.6.12',
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
              templateId: { '@_root': '2.16.840.1.113883.10.20.24.3.168', '@_extension': '2019-12-01' },
              // Diagnosis - https://loinc.org/29308-4
              code: {
                '@_code': '29308-4',
                '@_codeSystem': '2.16.840.1.113883.6.1',
              },
              value: {
                '@_code': diagnosisCondition.code?.coding?.[0]?.code ?? '',
                '@_codeSystem': '2.16.840.1.113883.6.96"',
                '@_codeSystemName': 'SNOMEDCT',
                '@_xsi:type': 'CD',
              },
              // QDM Attribute: Rank
              entryRelationship: {
                '@_typeCode': 'REFR',
                observation: {
                  '@_classCode': 'OBS',
                  '@_moodCode': 'EVN',
                  templateId: { '@_root': '2.16.840.1.113883.10.20.24.3.166', '@_extension': '2019-12-01' },
                  // Rank - http://snomed.info/sct/263486008
                  code: { '@_code': '263486008', '@_displayName': 'Rank', '@_codeSystem': '2.16.840.1.113883.6.96' },
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
            templateId: [{ '@_root': '2.16.840.1.113883.10.20.24.3.171', '@_extension': '2021-08-01' }],
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
          '@_codeSystem': '2.16.840.1.113883.6.96',
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
      templateId: { '@_root': '2.16.840.1.113883.10.20.24.3.55' },
      id: { '@_root': coverage.id },
      // Payment sources Document - https://loinc.org/48768-6
      code: {
        '@_code': '48768-6',
        '@_codeSystemName': 'LOINC',
        '@_codeSystem': '2.16.840.1.113883.6.1',
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

  return {
    act: {
      '@_classCode': 'ACT',
      '@_moodCode': 'EVN',
      '@_negationInd': 'true',
      templateId: [
        // Consolidation CDA: Procedure Activity Act template
        { '@_root': '2.16.840.1.113883.10.20.22.4.12', '@_extension': '2014-06-09' },
        // Intervention Performed Template
        { '@_root': '2.16.840.1.113883.10.20.24.3.32', '@_extension': '2021-08-01' },
      ],
      id: { '@_root': '1.3.6.1.4.1.115', '@_extension': intervention.id },
      code: {
        '@_code': intervention.code?.coding?.[0]?.code ?? '',
        '@_codeSystem': '2.16.840.1.113883.6.96',
        '@_codeSystemName': 'SNOMEDCT',
      },
      text: intervention.code?.coding?.[0]?.display ?? '',
      statusCode: { '@_code': 'completed' },
      effectiveTime: {
        ...(performedPeriodStart ? { '@_value': formatHl7DateTime(performedPeriodStart) } : { '@_nullFlavor': 'UNK' }),
      },
      // QDM Attribute: Author dateTime
      ...(performedDateTime && {
        author: {
          templateId: { '@_root': '2.16.840.1.113883.10.20.24.3.155', '@_extension': '2019-12-01' },
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
            templateId: { '@_root': '2.16.840.1.113883.10.20.24.3.88', '@_extension': '2017-08-01' },
            // Reason care action performed or not - https://loinc.org/77301-0
            code: {
              '@_code': '77301-0',
              '@_codeSystem': '2.16.840.1.113883.6.1',
              '@_displayName': 'reason',
              '@_codeSystemName': 'LOINC',
            },
            value: {
              '@_code': intervention.statusReason?.coding?.[0]?.code ?? '',
              '@_codeSystem': '2.16.840.1.113883.6.96',
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

  return {
    procedure: {
      '@_classCode': 'PROC',
      '@_moodCode': 'EVN',
      '@_negationInd': 'true',
      templateId: [
        // Procedure performed template
        { '@_root': '2.16.840.1.113883.10.20.24.3.64', '@_extension': '2021-08-01' },
        // Procedure Activity Procedure
        { '@_root': '2.16.840.1.113883.10.20.22.4.14', '@_extension': '2014-06-09' },
      ],
      id: { '@_root': '1.3.6.1.4.1.115', '@_extension': procedure.id },
      code: {
        '@_code': procedure.code?.coding?.[0]?.code ?? '',
        '@_codeSystem': '2.16.840.1.113883.6.96',
        '@_codeSystemName': 'SNOMEDCT',
      },
      text: procedure.code?.coding?.[0]?.display ?? '',
      statusCode: { '@_code': 'completed' },
      effectiveTime: {
        ...(performedPeriodStart ? { '@_value': formatHl7DateTime(performedPeriodStart) } : { '@_nullFlavor': 'UNK' }),
      },
      // QDM Attribute: Author dateTime
      ...(performedDateTime && {
        author: {
          templateId: { '@_root': '2.16.840.1.113883.10.20.24.3.155', '@_extension': '2019-12-01' },
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
            templateId: { '@_root': '2.16.840.1.113883.10.20.24.3.166', '@_extension': '2019-12-01' },
            // Rank - http://snomed.info/sct/263486008
            code: { '@_code': '263486008', '@_displayName': 'Rank', '@_codeSystem': '2.16.840.1.113883.6.96' },
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
            templateId: { '@_root': '2.16.840.1.113883.10.20.24.3.88', '@_extension': '2017-08-01' },
            // Reason care action performed or not - https://loinc.org/77301-0
            code: {
              '@_code': '77301-0',
              '@_codeSystem': '2.16.840.1.113883.6.1',
              '@_displayName': 'reason',
              '@_codeSystemName': 'LOINC',
            },
            value: {
              '@_code': procedure.statusReason?.coding?.[0]?.code ?? '',
              '@_codeSystem': '2.16.840.1.113883.6.96',
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
        { '@_root': '2.16.840.1.113883.10.20.17.2.4' },
        { '@_root': '2.16.840.1.113883.10.20.24.2.1', '@_extension': '2021-08-01' },
        { '@_root': '2.16.840.1.113883.10.20.24.2.1.1', '@_extension': '2022-02-01' },
      ],
      code: { '@_code': '55188-7', '@_codeSystem': '2.16.840.1.113883.6.1' },
      title: 'Patient Data',
      text: '',
      entry: entries,
    },
  };
}
