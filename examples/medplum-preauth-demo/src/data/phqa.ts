// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire } from '@medplum/fhirtypes';

//Sample PHQA Questionnaire
export const PHQA: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'draft',
  url: 'https://example.org/fhir/Questionnaire/phq-a',
  version: '1.0.0',
  name: 'phq-a',
  title: 'PHQ-9 modified for Adolescents (PHQ-A)',
  description:
    'Instructions: How often have you been bothered by each of the following symptoms during the past two weeks? For each symptom select the answer that best describes how you have been feeling.',
  copyright:
    'Modified with permission from the PHQ (Spitzer, Williams & Kroenke, 1999) by J. Johnson (Johnson, 2002). Source form: Boston Children\'s Hospital PHQ Form (2022).',
  subjectType: ['Patient'],
  code: [
    {
      system: 'http://loinc.org',
      code: '72109-2',
      display: 'Depression screening using Patient Health Questionnaire Nine Item (PHQ-9) [Reported]',
    },
  ],
  item: [
    {
      linkId: 'phqa-instructions',
      type: 'display',
      text: 'Instructions: How often have you been bothered by each of the following symptoms during the past two weeks? For each symptom select the answer that best describes how you have been feeling.',
    },
    {
      linkId: 'phqa-symptoms',
      type: 'group',
      item: [
        {
          linkId: 'phqa-1',
          text: '1. Feeling down, depressed, irritable, or hopeless?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44251-7', display: 'Feeling down, depressed, or hopeless in last 2 weeks' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
        {
          linkId: 'phqa-2',
          text: '2. Little interest or pleasure in doing things?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44250-9', display: 'Little interest or pleasure in doing things' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
        {
          linkId: 'phqa-3',
          text: '3. Trouble falling asleep, staying asleep, or sleeping too much?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44252-5', display: 'Trouble falling or staying asleep, or sleeping too much' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
        {
          linkId: 'phqa-4',
          text: '4. Poor appetite, weight loss, or overeating?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44254-1', display: 'Poor appetite or overeating' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
        {
          linkId: 'phqa-5',
          text: '5. Feeling tired, or having little energy?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44253-3', display: 'Feeling tired or having little energy' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
        {
          linkId: 'phqa-6',
          text: '6. Feeling bad about yourself – or feeling that you are a failure, or that you have let yourself or your family down?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44255-8', display: 'Feeling bad about yourself-or you are a failure or have let yourself or your family down' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
        {
          linkId: 'phqa-7',
          text: '7. Trouble concentrating on things like school work, reading, or watching TV?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44256-6', display: 'Trouble concentrating on things such as reading the newspaper or watching television' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
        {
          linkId: 'phqa-8',
          text: '8. Moving or speaking so slowly that other people could have noticed? Or the opposite – being so fidgety or restless that you were moving around a lot more than usual?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44257-4', display: 'Moving or speaking so slowly that other people could have noticed. Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
        {
          linkId: 'phqa-9',
          text: '9. Thoughts that you would be better off dead, or of hurting yourself in some way?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '44258-2', display: 'Thoughts that you would be better off dead, or of hurting yourself in some way' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6568-5', display: 'Not at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6569-3', display: 'Several days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6570-1', display: 'More than half the days' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6571-9', display: 'Nearly every day' } },
          ],
        },
      ],
    },
    {
      linkId: 'phqa-supplemental',
      type: 'group',
      item: [
        {
          linkId: 'phqa-past-year-depressed',
          text: '10. In the past year have you felt depressed or sad most days, even if you felt okay sometimes?',
          type: 'choice',
          required: true,
          answerOption: [
            { valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0136', code: 'Y', display: 'Yes' } },
            { valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0136', code: 'N', display: 'No' } },
          ],
        },
        {
          linkId: 'phqa-functional-impact',
          text: '11. If you are experiencing any of the problems on this form, how difficult have these problems made it for you to do your work, take care of things at home or get along with other people?',
          type: 'choice',
          required: true,
          code: [{ system: 'http://loinc.org', code: '69722-7', display: 'How difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?' }],
          answerOption: [
            { valueCoding: { system: 'http://loinc.org', code: 'LA6572-7', display: 'Not difficult at all' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6573-5', display: 'Somewhat difficult' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6575-0', display: 'Very difficult' } },
            { valueCoding: { system: 'http://loinc.org', code: 'LA6574-3', display: 'Extremely difficult' } },
          ],
        },
        {
          linkId: 'phqa-past-month-suicidal',
          text: '12. Has there been a time in the past month when you have had serious thoughts about ending your life?',
          type: 'choice',
          required: true,
          answerOption: [
            { valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0136', code: 'Y', display: 'Yes' } },
            { valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0136', code: 'N', display: 'No' } },
          ],
        },
        {
          linkId: 'phqa-lifetime-attempt',
          text: '13. Have you EVER, in your WHOLE LIFE, tried to kill yourself or made a suicide attempt?',
          type: 'choice',
          required: true,
          answerOption: [
            { valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0136', code: 'Y', display: 'Yes' } },
            { valueCoding: { system: 'http://terminology.hl7.org/CodeSystem/v2-0136', code: 'N', display: 'No' } },
          ],
        },
      ],
    },
    {
      linkId: 'phqa-crisis',
      type: 'display',
      text: 'If you have had thoughts that you would be better off dead or of hurting yourself in some way, please discuss this with your Health Care Clinician, go to a hospital emergency room or call 911.',
    },
  ],
};
