import { Patient } from '@medplum/fhirtypes';
import { addProfileToResource } from './utils';
import { MockClient } from '@medplum/mock';

const medplum = new MockClient();

describe('addProfileToResource', () => {
  test('add profile URL to resource w/o any profiles', async () => {
    const profileUrl = 'http://example.com/patient-profile';
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Given'], family: 'Family' }],
    });
    addProfileToResource(patient, profileUrl);
    expect(patient.meta?.profile?.length ?? -1).toEqual(1);
    expect(patient.meta?.profile).toEqual(expect.arrayContaining([profileUrl]));
  });

  test('add profile URL to resource with empty profile array', async () => {
    const profileUrl = 'http://example.com/patient-profile';
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      meta: { profile: [] },
      name: [{ given: ['Given'], family: 'Family' }],
    });
    addProfileToResource(patient, profileUrl);
    expect(patient.meta?.profile?.length ?? -1).toEqual(1);
    expect(patient.meta?.profile).toEqual(expect.arrayContaining([profileUrl]));
  });

  test('add profile URL to resource with populated profile array', async () => {
    const existingProfileUrl = 'http://example.com/existing-patient-profile';
    const profileUrl = 'http://example.com/patient-profile';
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      meta: { profile: [existingProfileUrl] },
      name: [{ given: ['Given'], family: 'Family' }],
    });
    addProfileToResource(patient, profileUrl);
    expect(patient.meta?.profile?.length ?? -1).toEqual(2);
    expect(patient.meta?.profile).toEqual(expect.arrayContaining([profileUrl, existingProfileUrl]));
  });
});
