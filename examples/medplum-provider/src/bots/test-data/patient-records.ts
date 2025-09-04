// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { extensionURLMapping } from '../../utils/intake-utils';
import questionnairesBundle from '../../../data/core/c1/questionnaires.json';

export const patientIntakeQuestionnaire = questionnairesBundle.entry.find(
  (entry) => entry.resource.identifier?.[0]?.value === 'c1-patient-intake'
)?.resource as Questionnaire;

export const patientIntakeQuestionnaireResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'patient-demographics',
      item: [
        { linkId: 'first-name', answer: [{ valueString: 'Curtis' }] },
        { linkId: 'last-name', answer: [{ valueString: 'Strickland' }] },
        { linkId: 'dob', answer: [{ valueDateTime: '1997-11-21T19:45:00' }] },
        { linkId: 'street', answer: [{ valueString: '3504 Turner Gateway Station' }] },
        { linkId: 'city', answer: [{ valueString: 'Hillborough' }] },
        { linkId: 'state', answer: [{ valueCoding: { code: 'CO' } }] },
        { linkId: 'zip', answer: [{ valueString: '80034' }] },
        { linkId: 'country', answer: [{ valueString: 'US' }] },
        { linkId: 'phone', answer: [{ valueString: '502-248-7743' }] },
        { linkId: 'email', answer: [{ valueString: 'cstrickland7064@example.com' }] },
        { linkId: 'identifier', answer: [{ valueString: '68766886e2f58689a0bfdc57' }] },
        {
          linkId: 'race',
          answer: [
            {
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '1002-5',
                display: 'American Indian or Alaska Native',
              },
            },
          ],
        },
        {
          linkId: 'ethnicity',
          answer: [
            {
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '2186-5',
                display: 'Not Hispanic or Latino',
              },
            },
          ],
        },
        { linkId: 'gender-identity', answer: [{ valueCoding: { code: 'M' } }] },
      ],
    },
    // Encounter with required fields
    {
      linkId: 'encounters',
      item: [
        {
          linkId: 'encounter-description',
          answer: [{ valueString: 'Encounter to Document Medications' }],
        },
        {
          linkId: 'encounter-code',
          answer: [
            {
              valueCoding: {
                system: 'http://www.ama-assn.org/go/cpt',
                code: '99203',
                display:
                  'Office or other outpatient visit for the evaluation and management of a new patient, which requires a medically appropriate history and/or examination and low level of medical decision making. When using total time on the date of the encounter for code selection, 30 minutes must be met or exceeded.',
              },
            },
          ],
        },
        {
          linkId: 'encounter-period-start',
          answer: [{ valueDateTime: '2023-02-23T08:00:00' }],
        },
        {
          linkId: 'encounter-period-end',
          answer: [{ valueDateTime: '2023-02-23T08:30:00' }],
        },
      ],
    },
    // Encounter with class code
    {
      linkId: 'encounters',
      item: [
        {
          linkId: 'encounter-description',
          answer: [{ valueString: 'Encounter to Document Medications' }],
        },
        {
          linkId: 'encounter-code',
          answer: [
            {
              valueCoding: {
                system: 'http://www.ama-assn.org/go/cpt',
                code: '90832',
                display: 'Psychotherapy, 30 minutes with patient',
              },
            },
          ],
        },
        {
          linkId: 'encounter-period-start',
          answer: [{ valueDateTime: '2023-10-12T08:00:00' }],
        },
        {
          linkId: 'encounter-period-end',
          answer: [{ valueDateTime: '2023-10-12T08:30:00' }],
        },
        {
          linkId: 'encounter-class',
          answer: [
            {
              valueCoding: {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                code: 'VR',
                display: 'virtual',
              },
            },
          ],
        },
      ],
    },
    // Encounter with diagnosis
    {
      linkId: 'encounters',
      item: [
        {
          linkId: 'encounter-description',
          answer: [{ valueString: 'Encounter to Document Medications' }],
        },
        {
          linkId: 'encounter-code',
          answer: [
            {
              valueCoding: {
                system: 'http://www.ama-assn.org/go/cpt',
                code: '99202',
                display:
                  'Office or other outpatient visit for the evaluation and management of a new patient, which requires a medically appropriate history and/or examination and straightforward medical decision making. When using total time on the date of the encounter for code selection, 15 minutes must be met or exceeded.',
              },
            },
          ],
        },
        {
          linkId: 'encounter-period-start',
          answer: [{ valueDateTime: '2023-11-02T17:00:00' }],
        },
        {
          linkId: 'encounter-period-end',
          answer: [{ valueDateTime: '2023-11-02T18:00:00' }],
        },
        {
          linkId: 'encounter-diagnosis',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '10811161000119107',
                display: 'Major depressive disorder in mother complicating pregnancy (disorder)',
              },
            },
          ],
        },
        {
          linkId: 'encounter-diagnosis-rank',
          answer: [{ valueInteger: 1 }],
        },
      ],
    },
    // Encounter with discharge disposition
    {
      linkId: 'encounters',
      item: [
        {
          linkId: 'encounter-description',
          answer: [{ valueString: 'Encounter Inpatient' }],
        },
        {
          linkId: 'encounter-code',
          answer: [
            {
              valueCoding: {
                system: 'http://www.ama-assn.org/go/cpt',
                code: '90837',
                display: 'Psychotherapy, 60 minutes with patient',
              },
            },
          ],
        },
        {
          linkId: 'encounter-period-start',
          answer: [{ valueDateTime: '2023-11-11T08:30:00' }],
        },
        {
          linkId: 'encounter-period-end',
          answer: [{ valueDateTime: '2023-11-11T09:30:00' }],
        },
        {
          linkId: 'encounter-discharge-disposition',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '428371000124100',
                display: 'Discharge to healthcare facility for hospice care (procedure)',
              },
            },
          ],
        },
      ],
    },
    // Intervention with author date/time and negation reason
    {
      linkId: 'interventions',
      item: [
        {
          linkId: 'procedure-code',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '428191000124101',
                display: 'Documentation of current medications (procedure)',
              },
            },
          ],
        },
        {
          linkId: 'procedure-performed-datetime',
          answer: [{ valueDateTime: '2023-11-11T08:30:00' }],
        },
        {
          linkId: 'procedure-medical-reason',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '183932001',
                display: 'Procedure contraindicated (situation)',
              },
            },
          ],
        },
      ],
    },
    // Intervention with relevant and author date/time
    {
      linkId: 'interventions',
      item: [
        {
          linkId: 'procedure-code',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '428191000124101',
                display: 'Documentation of current medications (procedure)',
              },
            },
          ],
        },
        {
          linkId: 'procedure-period-start',
          answer: [{ valueDateTime: '2023-12-04T08:30:00' }],
        },
        {
          linkId: 'procedure-performed-datetime',
          answer: [{ valueDateTime: '2023-12-04T15:00:00' }],
        },
      ],
    },
    // Procedure with full set of fields
    {
      linkId: 'procedures',
      item: [
        {
          linkId: 'procedure-code',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '428191000124101',
                display: 'Documentation of current medications (procedure)',
              },
            },
          ],
        },
        {
          linkId: 'procedure-period-start',
          answer: [{ valueDateTime: '2023-04-01T16:00:00' }],
        },
        {
          linkId: 'procedure-performed-datetime',
          answer: [{ valueDateTime: '2023-04-01T17:00:00' }],
        },
        {
          linkId: 'procedure-medical-reason',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '183932001',
                display: 'Procedure contraindicated (situation)',
              },
            },
          ],
        },
        {
          linkId: 'procedure-rank',
          answer: [{ valueInteger: 1 }],
        },
      ],
    },
    // Payer
    {
      linkId: 'payers',
      item: [
        {
          linkId: 'payer-type',
          answer: [
            {
              valueCoding: {
                system: 'https://nahdo.org/sopt',
                code: '9',
                display: 'MISCELLANEOUS/OTHER',
              },
            },
          ],
        },
        { linkId: 'payer-period-start', answer: [{ valueDateTime: '2022-12-21T00:00:00' }] },
      ],
    },
  ],
};

export const patientIdentifier = patientIntakeQuestionnaireResponse.item?.[0]?.item?.find(
  (item) => item.linkId === 'identifier'
)?.answer?.[0]?.valueString;

export const patientCurtisStrickland = {
  resourceType: 'Patient',
  name: [{ given: ['Curtis'], family: 'Strickland' }],
  birthDate: '1997-11-21',
  _birthDate: {
    extension: [
      {
        url: extensionURLMapping.patientBirthTime,
        valueDateTime: '1997-11-21T19:45:00',
      },
    ],
  },
} as Patient;

export const patientJulianJohnston = {
  resourceType: 'Patient',
  name: [{ given: ['Julian'], family: 'Johnston' }],
  birthDate: '1983-10-09',
  _birthDate: {
    extension: [
      {
        url: extensionURLMapping.patientBirthTime,
        valueDateTime: '1983-10-09T15:00:00',
      },
    ],
  },
} as Patient;
