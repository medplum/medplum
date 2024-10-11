import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { NEUTRON_HEALTH_PATIENTS } from './constants';

describe('Create photon prescription', async () => {
  vi.mock('./utils.ts', async () => {
    const actualModule = await vi.importActual('./utils.ts');
    return {
      ...actualModule,
      handlePhotonAuth: vi.fn().mockImplementation(() => 'example-auth-token'),
      photonGraphqlFetch: vi.fn(),
    };
  });

  test('Create prescription and update MedicationRequest', async () => {
    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH_PATIENTS, value: 'example-patient' }],
    });
  });
});
