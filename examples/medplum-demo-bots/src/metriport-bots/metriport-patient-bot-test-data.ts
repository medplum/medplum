import { QuestionnaireResponse } from '@medplum/fhirtypes';

export const existingPatientQuestionnaireResponse: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  item: [
    {
      linkId: 'firstName',
      text: 'First Name',
      answer: [{ valueString: 'Jane' }],
    },
    {
      linkId: 'lastName',
      text: 'Last Name',
      answer: [{ valueString: 'Smith' }],
    },
    {
      linkId: 'dob',
      text: 'Date of Birth',
      answer: [{ valueDate: '1996-02-10' }],
    },
    {
      linkId: 'genderAtBirth',
      text: 'Gender at Birth',
      answer: [
        {
          valueCoding: {
            system: 'http://hl7.org/fhir/administrative-gender',
            code: 'female',
            display: 'Female',
          },
        },
      ],
    },
    {
      linkId: 'addressLine1',
      text: 'Address Line 1',
      answer: [{ valueString: '123 Arsenal St' }],
    },
    {
      linkId: 'city',
      text: 'City',
      answer: [{ valueString: 'Phoenix' }],
    },
    {
      linkId: 'state',
      text: 'State',
      answer: [{ valueCoding: { system: 'https://www.usps.com/', code: 'AZ', display: 'Arizona' } }],
    },
    {
      linkId: 'zip',
      text: 'Zip',
      answer: [{ valueString: '85300' }],
    },
    {
      linkId: 'ssn',
      text: 'SSN',
      answer: [{ valueString: '123456789' }],
    },
    {
      linkId: 'phone',
      text: 'Phone',
      answer: [{ valueString: '555-555-5555' }],
    },
    {
      linkId: 'email',
      text: 'Email',
      answer: [{ valueString: 'jane.smith@example.com' }],
    },
  ],
};
