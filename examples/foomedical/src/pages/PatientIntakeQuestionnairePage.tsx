// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm } from '@medplum/react';
import { JSX, useState } from 'react';

export function PatientIntakeQuestionnairePage(): JSX.Element {
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleQuestionnaireSubmit(_formData: QuestionnaireResponse): Promise<void> {
    setIsSubmitted(true);
    window.scrollTo(0, 0);
  }

  return (
    <Document width={800}>
      {isSubmitted ? (
        <div>Thank you for submitting your form</div>
      ) : (
        <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleQuestionnaireSubmit} />
      )}
    </Document>
  );
}

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Patient Intake Questionnaire',
  name: 'patient-intake',
  item: [
    {
      linkId: 'patient-demographics',
      text: 'Demographics',
      type: 'group',
      item: [
        {
          linkId: 'first-name',
          text: 'First Name',
          type: 'string',
          required: true,
        },
        {
          linkId: 'middle-name',
          text: 'Middle Name',
          type: 'string',
        },
        {
          linkId: 'last-name',
          text: 'Last Name',
          type: 'string',
          required: true,
        },
        {
          linkId: 'dob',
          text: 'Date of Birth',
          type: 'date',
        },
        {
          linkId: 'street',
          text: 'Street',
          type: 'string',
        },
        {
          linkId: 'city',
          text: 'City',
          type: 'string',
        },
        {
          linkId: 'state',
          text: 'State',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/us/core/ValueSet/us-core-usps-state',
        },
        {
          linkId: 'zip',
          text: 'Zip',
          type: 'string',
        },
        {
          linkId: 'phone',
          text: 'Phone',
          type: 'string',
        },
        {
          linkId: 'ssn',
          text: 'Social Security Number',
          type: 'string',
          required: true,
        },
        {
          linkId: 'race',
          text: 'Race',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/us/core/ValueSet/omb-race-category',
        },
        {
          linkId: 'ethnicity',
          text: 'Ethnicity',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/us/core/ValueSet/omb-ethnicity-category',
        },
        {
          linkId: 'gender-identity',
          text: 'Gender Identity',
          type: 'choice',
          answerValueSet: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.32',
        },
        {
          linkId: 'sexual-orientation',
          text: 'Sexual Orientation',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/us/core/ValueSet/us-core-sexual-orientation',
        },
      ],
    },
    {
      linkId: 'emergency-contact',
      text: 'Emergency Contact',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'emergency-contact-first-name',
          text: 'First Name',
          type: 'string',
        },
        {
          linkId: 'emergency-contact-middle-name',
          text: 'Middle Name',
          type: 'string',
        },
        {
          linkId: 'emergency-contact-last-name',
          text: 'Last Name',
          type: 'string',
        },
        {
          linkId: 'emergency-contact-phone',
          text: 'Phone',
          type: 'string',
        },
      ],
    },
    {
      linkId: 'allergies',
      text: 'Allergies',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'allergy-substance',
          text: 'Substance',
          type: 'choice',
          answerValueSet: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1186.8',
        },
        {
          linkId: 'allergy-reaction',
          text: 'Reaction',
          type: 'string',
        },
        {
          linkId: 'allergy-onset',
          text: 'Onset',
          type: 'dateTime',
        },
      ],
    },
    {
      linkId: 'medications',
      text: 'Current medications',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'medication-code',
          text: 'Medication Name',
          type: 'choice',
          answerValueSet: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1010.4',
        },
        {
          linkId: 'medication-note',
          text: 'Note',
          type: 'string',
        },
      ],
    },
    {
      linkId: 'medical-history',
      text: 'Medical History',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'medical-history-problem',
          text: 'Problem',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/us/core/ValueSet/us-core-condition-code',
        },
        {
          linkId: 'medical-history-clinical-status',
          text: 'Status',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/condition-clinical',
        },
        {
          linkId: 'medical-history-onset',
          text: 'Onset',
          type: 'dateTime',
        },
      ],
    },
    {
      linkId: 'family-member-history',
      text: 'Family Member History',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'family-member-history-problem',
          text: 'Problem',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/us/core/ValueSet/us-core-condition-code',
        },
        {
          linkId: 'family-member-history-relationship',
          text: 'Relationship',
          type: 'choice',
          answerValueSet: 'http://terminology.hl7.org/ValueSet/v3-FamilyMember',
        },
        {
          linkId: 'family-member-history-deceased',
          text: 'Deceased',
          type: 'boolean',
        },
      ],
    },
    {
      linkId: 'vaccination-history',
      text: 'Vaccination History',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'immunization-vaccine',
          text: 'Vaccine',
          type: 'choice',
          answerValueSet: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1010.6',
        },
        {
          linkId: 'immunization-date',
          text: 'Administration Date',
          type: 'dateTime',
        },
      ],
    },
    {
      linkId: 'preferred-pharmacy',
      text: 'Preferred Pharmacy',
      type: 'group',
      item: [
        {
          linkId: 'preferred-pharmacy-reference',
          text: 'Pharmacy',
          type: 'reference',
          extension: [
            {
              id: 'reference-pharmacy',
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/fhir-types',
                    display: 'Organizations',
                    code: 'Organization',
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      linkId: 'coverage-information',
      text: 'Coverage Information',
      type: 'group',
      repeats: true,
      item: [
        {
          linkId: 'insurance-provider',
          text: 'Insurance Provider',
          type: 'reference',
          required: true,
          extension: [
            {
              id: 'reference-insurance',
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/fhir-types',
                    display: 'Organizations',
                    code: 'Organization',
                  },
                ],
              },
            },
          ],
        },
        {
          linkId: 'subscriber-id',
          text: 'Subscriber ID',
          type: 'string',
          required: true,
        },
        {
          linkId: 'relationship-to-subscriber',
          text: 'Relationship to Subscriber',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/subscriber-relationship',
          required: true,
        },
        {
          linkId: 'related-person',
          text: 'Subscriber Information',
          type: 'group',
          enableBehavior: 'all',
          enableWhen: [
            {
              question: 'relationship-to-subscriber',
              operator: '!=',
              answerCoding: {
                system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
                code: 'other',
                display: 'Other',
              },
            },
            {
              question: 'relationship-to-subscriber',
              operator: '!=',
              answerCoding: {
                system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
                code: 'self',
                display: 'Self',
              },
            },
            {
              question: 'relationship-to-subscriber',
              operator: '!=',
              answerCoding: {
                system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
                code: 'injured',
                display: 'Injured Party',
              },
            },
          ],
          item: [
            {
              linkId: 'related-person-first-name',
              text: 'First Name',
              type: 'string',
            },
            {
              linkId: 'related-person-middle-name',
              text: 'Middle Name',
              type: 'string',
            },
            {
              linkId: 'related-person-last-name',
              text: 'Last Name',
              type: 'string',
            },
            {
              linkId: 'related-person-dob',
              text: 'Date of Birth',
              type: 'date',
            },
            {
              linkId: 'related-person-gender-identity',
              text: 'Gender Identity',
              type: 'choice',
              answerValueSet: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.32',
            },
          ],
        },
      ],
    },
    {
      linkId: 'social-determinants-of-health',
      text: 'Social Determinants of Health',
      type: 'group',
      item: [
        {
          linkId: 'housing-status',
          text: 'Housing Status',
          type: 'choice',
          answerValueSet: 'http://terminology.hl7.org/ValueSet/v3-LivingArrangement',
        },
        {
          linkId: 'education-level',
          text: 'Education Level',
          type: 'choice',
          answerValueSet: 'http://terminology.hl7.org/ValueSet/v3-EducationLevel',
        },
        {
          linkId: 'smoking-status',
          text: 'Smoking Status',
          type: 'choice',
          answerValueSet: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.11.20.9.38',
        },
        {
          linkId: 'veteran-status',
          text: 'Veteran Status',
          type: 'boolean',
        },
        {
          linkId: 'pregnancy-status',
          text: 'Pregnancy Status',
          type: 'choice',
          code: [
            {
              code: '82810-3',
              display: 'Pregnancy status',
              system: 'http://loinc.org',
            },
          ],
          answerValueSet: 'http://example.com/pregnancy-status',
        },
        {
          linkId: 'estimated-delivery-date',
          text: 'Estimated Delivery Date',
          type: 'date',
          code: [
            {
              code: '11778-8',
              display: 'Estimated date of delivery',
              system: 'http://loinc.org',
            },
          ],
          enableWhen: [
            {
              question: 'pregnancy-status',
              operator: '=',
              answerCoding: {
                system: 'http://snomed.info/sct',
                code: '77386006',
                display: 'Pregnancy',
              },
            },
          ],
        },
      ],
    },
    {
      linkId: 'languages-spoken',
      text: 'Languages Spoken',
      type: 'choice',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/languages',
      repeats: true,
    },
    {
      linkId: 'preferred-language',
      text: 'Preferred Language',
      type: 'choice',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/languages',
    },
    {
      linkId: 'consent-for-treatment',
      text: 'Consent for Treatment',
      type: 'group',
      item: [
        {
          linkId: 'consent-for-treatment-signature',
          text: 'I the undersigned patient (or authorized representative, or parent/guardian), consent to and authorize the performance of any treatments, examinations, medical services, surgical or diagnostic procedures, including lab and radiographic studies, as ordered by this office and it’s healthcare providers.',
          type: 'boolean',
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
          text: 'I, the responsible party, hereby agree to pay all the charges submitted by this office during the course of treatment for the patient. If the patient has insurance coverage with a managed care organization, with which this office has a contractual agreement, I agree to pay all applicable co‐payments, co‐insurance and deductibles, which arise during the course of treatment for the patient. The responsible party also agrees to pay for treatment rendered to the patient, which is not considered to be a covered service by my insurer and/or a third party insurer or other payor. I understand that Sample Hospital provides charges on a sliding fee; based on family size and household annual income, and that services will not be refused due to inability to pay at the time of the visit.',
          type: 'boolean',
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
          text: 'Sample Hospital Notice of Privacy Practices gives information about how Sample Hospital may use and release protected health information (PHI) about you. I understand that:\n- I have the right to receive a copy of Sample Hospital’s Notice of Privacy Practices.\n- I may request a copy at any time.\n- Sample Hospital‘s Notice of Privacy Practices may be revised.',
          type: 'display',
        },
        {
          linkId: 'notice-of-privacy-practices-signature',
          text: 'I acknowledge the above and that I have received a copy of Sample Hospital’s Notice of Privacy Practices.',
          type: 'boolean',
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
        },
        {
          linkId: 'acknowledgement-for-advance-directives-date',
          text: 'Date',
          type: 'date',
        },
      ],
    },
  ],
};
