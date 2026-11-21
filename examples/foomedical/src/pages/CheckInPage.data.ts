// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CheckinRequestInit } from '@smart-health-checkin/client';

// Items from the connectathon's records.json and form-phq2.json, combined into one request:
// https://smart-health-checkin.org/connectathon/requests/
// No id, so the library assigns a fresh one to each check-in.
export const checkInRequest: CheckinRequestInit = {
  purpose: 'Pre-visit check-in',
  items: [
    {
      id: 'patient',
      title: 'Demographics',
      content: {
        kind: 'selection.fhir',
        profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
      },
      accept: ['application/fhir+json'],
    },
    {
      id: 'problems',
      title: 'Problems and health concerns',
      content: {
        kind: 'selection.fhir',
        profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'],
      },
      accept: ['application/fhir+json'],
    },
    {
      id: 'allergies',
      title: 'Allergies',
      content: {
        kind: 'selection.fhir',
        profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance'],
      },
      accept: ['application/fhir+json'],
    },
    {
      id: 'medications',
      title: 'Medications',
      content: {
        kind: 'selection.fhir',
        profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest'],
      },
      accept: ['application/fhir+json'],
    },
    {
      id: 'immunizations',
      title: 'Immunizations',
      content: {
        kind: 'selection.fhir',
        profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-immunization'],
      },
      accept: ['application/fhir+json'],
    },
    {
      id: 'coverage',
      title: 'Insurance card',
      summary: 'Your insurance card, as a CARIN digital insurance card or US Core coverage record.',
      content: {
        kind: 'selection.fhir',
        profiles: [
          'http://hl7.org/fhir/us/insurance-card/StructureDefinition/C4DIC-Coverage',
          'http://hl7.org/fhir/us/core/StructureDefinition/us-core-coverage',
        ],
      },
      accept: ['application/fhir+json', 'application/smart-health-card'],
    },
    {
      id: 'phq2',
      title: 'Two questions about your mood',
      required: true,
      content: {
        kind: 'form.fhir',
        questionnaireCanonical: 'https://smart-health-checkin.org/connectathon/Questionnaire/phq-2.json',
        questionnaire: {
          resourceType: 'Questionnaire',
          text: {
            status: 'generated',
            div: '<div xmlns="http://www.w3.org/1999/xhtml"><p><b>PHQ-2 depression screen</b></p><ol><li>Little interest or pleasure in doing things</li><li>Feeling down, depressed, or hopeless</li></ol></div>',
          },
          url: 'https://smart-health-checkin.org/connectathon/Questionnaire/phq-2.json',
          version: '1',
          name: 'PHQ2',
          title: 'PHQ-2 depression screen',
          status: 'draft',
          subjectType: ['Patient'],
          date: '2026-09-25',
          publisher: 'SMART Health IT (connectathon example)',
          description:
            'The two-question PHQ-2 depression screen, for the KTC SMART Health Check-in connectathon. Answers carry scores 0 to 3 in the ordinalValue extension; the total (LOINC 55758-7) is the sum and is computed by the receiver, not entered by the patient.',
          copyright:
            'This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the license at http://loinc.org/license. PHQ-2: Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.',
          code: [
            {
              system: 'http://loinc.org',
              code: '55757-9',
              display: 'Patient Health Questionnaire 2 item (PHQ-2) [Reported]',
            },
          ],
          item: [
            {
              linkId: 'stem',
              type: 'display',
              text: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
            },
            {
              linkId: 'phq2-1',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '44250-9',
                  display: 'Little interest or pleasure in doing things in last 2 weeks',
                },
              ],
              prefix: '1.',
              text: 'Little interest or pleasure in doing things',
              type: 'choice',
              answerOption: [
                {
                  valueCoding: {
                    system: 'http://loinc.org',
                    code: 'LA6568-5',
                    display: 'Not at all',
                  },
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 0,
                    },
                  ],
                },
                {
                  valueCoding: {
                    system: 'http://loinc.org',
                    code: 'LA6569-3',
                    display: 'Several days',
                  },
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 1,
                    },
                  ],
                },
                {
                  valueCoding: {
                    system: 'http://loinc.org',
                    code: 'LA6570-1',
                    display: 'More than half the days',
                  },
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 2,
                    },
                  ],
                },
                {
                  valueCoding: {
                    system: 'http://loinc.org',
                    code: 'LA6571-9',
                    display: 'Nearly every day',
                  },
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 3,
                    },
                  ],
                },
              ],
            },
            {
              linkId: 'phq2-2',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '44255-8',
                  display: 'Feeling down, depressed, or hopeless in last 2 weeks',
                },
              ],
              prefix: '2.',
              text: 'Feeling down, depressed, or hopeless',
              type: 'choice',
              answerOption: [
                {
                  valueCoding: {
                    system: 'http://loinc.org',
                    code: 'LA6568-5',
                    display: 'Not at all',
                  },
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 0,
                    },
                  ],
                },
                {
                  valueCoding: {
                    system: 'http://loinc.org',
                    code: 'LA6569-3',
                    display: 'Several days',
                  },
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 1,
                    },
                  ],
                },
                {
                  valueCoding: {
                    system: 'http://loinc.org',
                    code: 'LA6570-1',
                    display: 'More than half the days',
                  },
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 2,
                    },
                  ],
                },
                {
                  valueCoding: {
                    system: 'http://loinc.org',
                    code: 'LA6571-9',
                    display: 'Nearly every day',
                  },
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 3,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      accept: ['application/fhir+json'],
    },
  ],
};

export const walletRegistryUrl = 'https://smart-health-checkin.org/connectathon/wallets.json';

// SMART Testing Wallet config URL that always declines the immunizations item:
// base64url of {"status":{"immunizations":"declined"}}
export const decliningTestWalletUrl =
  'https://smart-health-checkin.org/connectathon/testing-wallet/eyJzdGF0dXMiOnsiaW1tdW5pemF0aW9ucyI6ImRlY2xpbmVkIn19/';
