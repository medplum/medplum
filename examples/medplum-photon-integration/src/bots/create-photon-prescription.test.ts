import { createReference, getCodeBySystem } from '@medplum/core';
import { Bot, CodeableConcept, MedicationKnowledge, MedicationRequest, Patient, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_PATIENTS, NEUTRON_HEALTH_TREATMENTS } from './constants';
import { createAndValidateVariables, getPhotonIdByCoding, getPhotonTreatmentId } from './create-photon-prescription';
import { handler } from './create-photon-prescription';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = 'application/json';
const secrets = {
  PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'client-id' },
  PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'client-secret' },
};

describe('Create photon prescription', async () => {
  vi.mock('./utils.ts', async () => {
    const actualModule = await vi.importActual('./utils.ts');
    return {
      ...actualModule,
      handlePhotonAuth: vi.fn().mockImplementation(() => 'example-auth-token'),
      photonGraphqlFetch: vi.fn(),
    };
  });

  test.skip('Create prescription and update MedicationRequest', async () => {
    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH_PATIENTS, value: 'photon-patient-id' }],
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const medicationRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'draft',
      intent: 'filler-order',
      subject: createReference(patient),
      dispenseRequest: {
        quantity: {
          value: 3,
          unit: 'mg',
          system: 'http://unitsofmeasure.org',
          code: 'mg',
        },
      },
      dosageInstruction: [{ patientInstruction: '20 units SC three times daily' }],
      requester: { reference: 'Practitioner/example', display: 'Dr. John Houseman' },
      medicationCodeableConcept: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '310430',
            display: 'gabapentin 100 MG Oral Capsule',
          },
        ],
      },
    });

    await medplum.createResource({
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '310430',
            display: 'gabapentin 100 MG Oral Capsule',
          },
          {
            system: NEUTRON_HEALTH_TREATMENTS,
            code: 'photon-treatment-id',
          },
        ],
      },
    });

    const result = await handler(medplum, {
      bot,
      contentType,
      secrets,
      input: medicationRequest,
    });

    const photonPrescriptionId = result.identifier?.find((id) => id.system === NEUTRON_HEALTH);
    expect(photonPrescriptionId).toBeDefined();
  }, 10000);

  test('Throw error if no medication code', async () => {
    const medplum = new MockClient();
    const medicationRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'filler-order',
      subject: { reference: 'Patient/123' },
    });
    await expect(() => handler(medplum, { bot, contentType, secrets, input: medicationRequest })).rejects.toThrow(
      'Medication must have a code'
    );
  });
});

describe('Validate variables', () => {
  test.skip('Create and validate variables', () => {
    const result = createAndValidateVariables('patient-id', 'treatment-id', 30, 'tablets', 'Take one daily');
    expect(result).toEqual({
      patientId: 'patient-id',
      treatmentId: 'treatment-id',
      dispenseQuantity: 30,
      dispenseUnit: 'tablets',
      instructions: 'Take one daily',
    });
  });

  test.skip('Error if missing variables', () => {
    expect(() => createAndValidateVariables('patient-id', 'treatment-id', 30, 'tablets', undefined)).toThrow(
      'The following required fields are missing: instructions'
    );
  });
});

describe('getPhotonTreatmentId', () => {
  const mockAuthToken = 'mock-auth-token';

  test('Get treatment ID from MedicationKnowledge', async () => {
    const medplum = new MockClient();
    const mockMedicationCode: CodeableConcept = {
      coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '123456', display: 'Test Medication' }],
    };

    await medplum.createResource({
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          { system: NEUTRON_HEALTH_TREATMENTS, code: 'photon-treatment-id' },
          { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '123456' },
        ],
      },
    });

    const result = await getPhotonTreatmentId(mockAuthToken, medplum, mockMedicationCode);
    expect(result).toBe('photon-treatment-id');
  });

  test.skip('Queries Photon if no MedicationKnowledge', async () => {
    const medplum = new MockClient();
    const mockMedicationCode: CodeableConcept = {
      coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '123456', display: 'Test Medication' }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { treatmentOptions: [{ medicationId: 'photon-treatment-id' }] } }),
    });

    const result = await getPhotonTreatmentId(mockAuthToken, medplum, mockMedicationCode);
    expect(result).toBe('photon-treatment-id');
  });

  test.skip('No medication code provided', async () => {
    const medplum = new MockClient();
    await expect(getPhotonTreatmentId(mockAuthToken, medplum, undefined)).rejects.toThrow(
      'Medication must have a code'
    );
  });

  test.skip('No RxNorm or NDC code', async () => {
    const medplum = new MockClient();
    const mockMedicationCode: CodeableConcept = {
      coding: [{ system: 'http://example.com/unknown-system', display: 'Unknown Medication' }],
    };

    await expect(getPhotonTreatmentId(mockAuthToken, medplum, mockMedicationCode)).rejects.toThrow(
      'Could not find medication in Photon'
    );
  });
});

describe('getPhotonIdByCoding', () => {
  test('Get Photon ID from MedicationKnowledge', async () => {
    const medplum = new MockClient();
    const mockMedicationCode: CodeableConcept = {
      coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '123456', display: 'Test Medication' }],
    };

    const medicationKnowledge = await medplum.createResource({
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [
          { system: NEUTRON_HEALTH_TREATMENTS, code: 'photon-treatment-id' },
          { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '123456', display: 'Test Medication' },
        ],
      },
    });

    const result = await getPhotonIdByCoding(medplum, mockMedicationCode);
    expect(result).toBe('photon-treatment-id');
  });

  test.skip('Returns undefined when cannot find MedicationKnowledge', async () => {
    const medplum = new MockClient();
    const mockMedicationCode: CodeableConcept = {
      coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '123456', display: 'Test Medication' }],
    };

    await medplum.createResource({
      resourceType: 'MedicationKnowledge',
      code: {
        coding: [{ system: NEUTRON_HEALTH_TREATMENTS, code: 'photon-treatment-id' }],
      },
    });

    const result = await getPhotonIdByCoding(medplum, mockMedicationCode);
    expect(result).toBeUndefined();
  });
});
