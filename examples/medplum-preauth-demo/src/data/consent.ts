// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';

// Consent groups copied from the provider app's /onboarding questionnaire
// (examples/medplum-provider/src/pages/patient/IntakeFormPage.tsx). The checkboxes are required here.
const consentItems: QuestionnaireItem[] = [
  {
    linkId: 'consent-for-treatment',
    text: 'Consent for Treatment',
    type: 'group',
    item: [
      {
        linkId: 'consent-for-treatment-signature',
        text: 'I the undersigned patient (or authorized representative, or parent/guardian), consent to and authorize the performance of any treatments, examinations, medical services, surgical or diagnostic procedures, including lab and radiographic studies, as ordered by this office and it’s healthcare providers.',
        type: 'boolean',
        required: true,
      },
      {
        linkId: 'consent-for-treatment-date',
        text: 'Date',
        type: 'date',
      },
    ],
  },
  {
    linkId: 'agreement-to-pay-for-treatment',
    text: 'Agreement to Pay for Treatment',
    type: 'group',
    item: [
      {
        linkId: 'agreement-to-pay-for-treatment-help',
        text: 'I, the responsible party, hereby agree to pay all the charges submitted by this office during the course of treatment for the patient. If the patient has insurance coverage with a managed care organization, with which this office has a contractual agreement, I agree to pay all applicable co‐payments, co‐insurance and deductibles, which arise during the course of treatment for the patient. The responsible party also agrees to pay for treatment rendered to the patient, which is not considered to be a covered service by my insurer and/or a third party insurer or other payor. I understand that Foo Medical provides charges on a sliding fee; based on family size and household annual income, and that services will not be refused due to inability to pay at the time of the visit.',
        type: 'boolean',
        required: true,
      },
      {
        linkId: 'agreement-to-pay-for-treatment-date',
        text: 'Date',
        type: 'date',
      },
    ],
  },
  {
    linkId: 'notice-of-privacy-practices',
    text: 'Notice of Privacy Practices',
    type: 'group',
    item: [
      {
        linkId: 'notice-of-privacy-practices-help',
        text: 'Foo Medical Notice of Privacy Practices gives information about how Foo Medical may use and release protected health information (PHI) about you. I understand that:\n- I have the right to receive a copy of Foo Medical’s Notice of Privacy Practices.\n- I may request a copy at any time.\n- Foo Medical‘s Notice of Privacy Practices may be revised.',
        type: 'display',
      },
      {
        linkId: 'notice-of-privacy-practices-signature',
        text: 'I acknowledge the above and that I have received a copy of Foo Medical’s Notice of Privacy Practices.',
        type: 'boolean',
        required: true,
      },
      {
        linkId: 'notice-of-privacy-practices-date',
        text: 'Date',
        type: 'date',
      },
    ],
  },
  {
    linkId: 'acknowledgement-for-advance-directives',
    text: 'Acknowledgement for Advance Directives',
    type: 'group',
    item: [
      {
        linkId: 'acknowledgement-for-advance-directives-help',
        text: 'An Advance Medical Directive is a document by which a person makes provision for health care decisions in the event that, in the future, he/she becomes unable to make those decisions.',
        type: 'display',
      },
      {
        linkId: 'acknowledgement-for-advance-directives-signature',
        text: 'I acknowledge I have received information about Advance Directives.',
        type: 'boolean',
        required: true,
      },
      {
        linkId: 'acknowledgement-for-advance-directives-date',
        text: 'Date',
        type: 'date',
      },
    ],
  },
];

export const CONSENT_QUESTIONNAIRE: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  url: 'https://medplum.com/Questionnaire/preauth-demo-consent',
  name: 'patient-consent-forms',
  subjectType: ['Patient'],
  extension: [
    {
      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-signatureRequired',
      valueCodeableConcept: {
        coding: [
          {
            system: 'urn:iso-astm:E1762-95:2013',
            code: '1.2.840.10065.1.12.1.1',
            display: "Author's Signature",
          },
        ],
      },
    },
  ],
  item: [...consentItems, { linkId: 'printed-name', text: 'Print your full name', type: 'string', required: true }],
};
