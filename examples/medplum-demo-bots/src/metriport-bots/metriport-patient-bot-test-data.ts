import { Patient } from '@medplum/fhirtypes';

export const JaneSmithMedplumPatient: Patient = {
  resourceType: 'Patient',
  name: [{ given: ['Jane'], family: 'Smith' }],
  birthDate: '1996-02-10',
  gender: 'female',
  address: [
    {
      line: ['123 Arsenal St'],
      city: 'Phoenix',
      state: 'AZ',
      postalCode: '85300',
    },
  ],
  telecom: [
    { system: 'phone', value: '555-555-5555' },
    { system: 'email', value: 'jane.smith@example.com' },
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
