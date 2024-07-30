import { createReference, getReferenceString } from '@medplum/core';
import { Organization, Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import coreBundle from '../../../../data/core/patient-intake-questionnaire.json';

export const intakePatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-id',
  name: [
    {
      given: ['John', 'Doe'],
      family: 'Carvalho',
    },
  ],
};

export const payorOrganization1: Organization = {
  resourceType: 'Organization',
  id: 'org-id-1',
  name: 'First Insurance Provider',
};

export const payorOrganization2: Organization = {
  resourceType: 'Organization',
  id: 'org-id-2',
  name: 'Second Insurance Provider',
};

export const intakeQuestionnaire: Questionnaire = coreBundle.entry[1].resource as Questionnaire;
intakeQuestionnaire.id = 'intake-questionnaire-id';

export const intakeResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  questionnaire: getReferenceString(intakeQuestionnaire),
  status: 'completed',
  subject: createReference(intakePatient),
  item: [
    {
      id: 'id-35',
      linkId: 'patient-demographics',
      text: 'Patient Demographics',
      item: [
        {
          id: 'id-36',
          linkId: 'first-name',
          text: 'First Name',
          answer: [
            {
              valueString: 'FirstName',
            },
          ],
        },
        {
          id: 'id-37',
          linkId: 'middle-name',
          text: 'Middle Name',
          answer: [
            {
              valueString: 'MiddleName',
            },
          ],
        },
        {
          id: 'id-38',
          linkId: 'last-name',
          text: 'Last Name',
          answer: [
            {
              valueString: 'LastName',
            },
          ],
        },
        {
          id: 'id-39',
          linkId: 'dob',
          text: 'Date of Birth',
          answer: [
            {
              valueDate: '2000-01-01',
            },
          ],
        },
        {
          id: 'id-40',
          linkId: 'race',
          text: 'Race',
          answer: [
            {
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '2131-1',
                display: 'Other Race',
              },
            },
          ],
        },
        {
          id: 'id-41',
          linkId: 'ethnicity',
          text: 'Ethnicity',
          answer: [
            {
              valueCoding: {
                system: 'urn:oid:2.16.840.1.113883.6.238',
                code: '2135-2',
                display: 'Hispanic or Latino',
              },
            },
          ],
        },
        {
          id: 'id-42',
          linkId: 'gender-identity',
          text: 'Gender Identity',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '33791000087105',
                display: 'Identifies as nonbinary gender (finding)',
              },
            },
          ],
        },
        {
          id: 'id-43',
          linkId: 'sexual-orientation',
          text: 'Sexual Orientation',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '42035005',
                display: 'Bisexual (finding)',
              },
            },
          ],
        },
      ],
    },
    {
      id: 'id-44',
      linkId: 'coverage-information',
      text: 'Coverage Information',
      item: [
        {
          id: 'id-45',
          linkId: 'insurance-provider',
          text: 'Insurance Provider',
          answer: [
            {
              valueReference: {
                reference: getReferenceString(payorOrganization1),
              },
            },
          ],
        },
        {
          id: 'id-46',
          linkId: 'subscriber-id',
          text: 'Subscriber ID',
          answer: [
            {
              valueString: 'first-provider-id',
            },
          ],
        },
        {
          id: 'id-47',
          linkId: 'relationship-to-subscriber',
          text: 'Relationship to Subscriber',
          answer: [
            {
              valueCoding: {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
                code: 'BP',
                display: 'Billing contact person',
              },
            },
          ],
        },
        {
          id: 'id-45',
          linkId: 'insurance-provider',
          text: 'Insurance Provider',
          answer: [
            {
              valueReference: {
                reference: getReferenceString(payorOrganization2),
              },
            },
          ],
        },
        {
          id: 'id-46',
          linkId: 'subscriber-id',
          text: 'Subscriber ID',
          answer: [
            {
              valueString: 'second-provider-id',
            },
          ],
        },
        {
          id: 'id-47',
          linkId: 'relationship-to-subscriber',
          text: 'Relationship to Subscriber',
          answer: [
            {
              valueCoding: {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
                code: 'BP',
                display: 'Billing contact person',
              },
            },
          ],
        },
      ],
    },
    {
      id: 'id-48',
      linkId: 'social-determinants-of-health',
      text: 'Social Determinants of Health',
      item: [
        {
          id: 'id-49',
          linkId: 'housing-status',
          text: 'Housing Status',
          answer: [
            {
              valueCoding: {
                system: 'http://terminology.hl7.org/CodeSystem/v3-LivingArrangement',
                code: 'M',
                display: 'Nomadic',
              },
            },
          ],
        },
        {
          id: 'id-50',
          linkId: 'education-level',
          text: 'Education Level',
          answer: [
            {
              valueCoding: {
                system: 'http://terminology.hl7.org/CodeSystem/v3-EducationLevel',
                code: 'BD',
                display: 'College or baccalaureate degree complete',
              },
            },
          ],
        },
        {
          id: 'id-51',
          linkId: 'veteran-status',
          text: 'Veteran Status',
          answer: [
            {
              valueBoolean: true,
            },
          ],
        },
        {
          linkId: 'pregnancy-status',
          text: 'Pregnancy Status',
          answer: [
            {
              valueCoding: {
                system: 'http://snomed.info/sct',
                code: '77386006',
                display: 'Pregnancy (finding)',
              },
            },
          ],
        },
        {
          linkId: 'estimated-delivery-date',
          text: 'Estimated Delivery Date',
          answer: [
            {
              valueDate: '2025-04-01',
            },
          ],
        },
      ],
    },
    {
      id: 'id-52',
      linkId: 'languages-spoken',
      text: 'Languages Spoken',
      answer: [
        {
          valueCoding: {
            system: 'urn:ietf:bcp:47',
            code: 'pt',
            display: 'Portuguese',
          },
        },
      ],
    },
    {
      id: 'id-53',
      linkId: 'preferred-language',
      text: 'Preferred Language',
      answer: [
        {
          valueCoding: {
            system: 'urn:ietf:bcp:47',
            code: 'en',
            display: 'English',
          },
        },
      ],
    },
    {
      id: 'id-54',
      linkId: 'consent-for-treatment',
      text: 'Consent for Treatment',
      item: [
        {
          id: 'id-55',
          linkId: 'consent-for-treatment-signature',
          text: 'I the undersigned patient (or authorized representative, or parent/guardian), consent to and authorize the performance of any treatments, examinations, medical services, surgical or diagnostic procedures, including lab and radiographic studies, as ordered by this office and it’s healthcare providers.',
          answer: [
            {
              valueBoolean: true,
            },
          ],
        },
        {
          id: 'id-56',
          linkId: 'consent-for-treatment-date',
          text: 'Date',
          answer: [
            {
              valueDate: '2024-07-08',
            },
          ],
        },
      ],
    },
    {
      id: 'id-57',
      linkId: 'agreement-to-pay-for-treatment',
      text: 'Agreement to Pay for Treatment',
      item: [
        {
          id: 'id-58',
          linkId: 'agreement-to-pay-for-treatment-help',
          text: 'I, the responsible party, hereby agree to pay all the charges submitted by this office during the course of treatment for the patient. If the patient has insurance coverage with a managed care organization, with which this office has a contractual agreement, I agree to pay all applicable co‐payments, co‐insurance and deductibles, which arise during the course of treatment for the patient. The responsible party also agrees to pay for treatment rendered to the patient, which is not considered to be a covered service by my insurer and/or a third party insurer or other payor. I understand that Bay Area Community Health (BACH) provides charges on a sliding fee; based on family size and household annual income, and that services will not be refused due to inability to pay at the time of the visit.',
          answer: [
            {
              valueBoolean: true,
            },
          ],
        },
        {
          id: 'id-59',
          linkId: 'agreement-to-pay-for-treatment-date',
          text: 'Date',
          answer: [
            {
              valueDate: '2024-07-08',
            },
          ],
        },
      ],
    },
    {
      id: 'id-60',
      linkId: 'notice-of-privacy-practices',
      text: 'Notice of Privacy Practices',
      item: [
        {
          id: 'id-61',
          linkId: 'notice-of-privacy-practices-help',
          text: 'Bay Area Community Health (BACH) Notice of Privacy Practices gives information about how BACH may use and release protected health information (PHI) about you. I understand that:\n- I have the right to receive a copy of BACH’s Notice of Privacy Practices.\n- I may request a copy at any time.\n- BACH‘s Notice of Privacy Practices may be revised.',
        },
        {
          id: 'id-62',
          linkId: 'notice-of-privacy-practices-signature',
          text: 'I acknowledge the above and that I have received a copy of BACH’s Notice of Privacy Practices.',
          answer: [
            {
              valueBoolean: true,
            },
          ],
        },
        {
          id: 'id-63',
          linkId: 'notice-of-privacy-practices-date',
          text: 'Date',
          answer: [
            {
              valueDate: '2024-07-08',
            },
          ],
        },
      ],
    },
    {
      id: 'id-64',
      linkId: 'acknowledgement-for-advance-directives',
      text: 'Acknowledgement for Advance Directives',
      item: [
        {
          id: 'id-65',
          linkId: 'acknowledgement-for-advance-directives-signature',
          text: 'I acknowledge I have received information about Advance Directives.',
          answer: [
            {
              valueBoolean: true,
            },
          ],
        },
        {
          id: 'id-66',
          linkId: 'acknowledgement-for-advance-directives-date',
          text: 'Date',
          answer: [
            {
              valueDate: '2024-07-08',
            },
          ],
        },
      ],
    },
  ],
};
