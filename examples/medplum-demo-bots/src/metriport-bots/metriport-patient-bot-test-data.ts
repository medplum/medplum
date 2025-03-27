import { QuestionnaireResponse } from '@medplum/fhirtypes';

export const JaneSmithQuestionnaireResponse: QuestionnaireResponse = {
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
      linkId: 'driverLicenseNumber',
      text: 'Driver License Number',
      answer: [{ valueString: 'A98765432' }],
    },
    {
      linkId: 'driverLicenseState',
      text: 'Driver License State',
      answer: [{ valueCoding: { system: 'http://hl7.org/fhir/v3/State', code: 'AZ', display: 'Arizona' } }],
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

export const JaneSmithMetriportPatient = {
  id: '0195d965-bfbc-7825-8a8a-b48baf403559',
  facilityIds: ['0195d964-d166-7226-8912-76934c23c140'],
  externalId: '',
  dateCreated: '2025-03-27T20:57:58.974Z',
  firstName: 'Jane',
  lastName: 'Smith',
  dob: '1996-02-10',
  genderAtBirth: 'F',
  personalIdentifiers: [],
  address: [
    {
      zip: '85300',
      city: 'Phoenix',
      state: 'AZ',
      country: 'USA',
      addressLine1: '123 Arsenal St',
    },
  ],
  contact: [],
};
