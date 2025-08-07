// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bot, Bundle, MedicationRequest, Practitioner, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import {
  PhotonEvent,
  PhotonWebhook,
  PrescriptionCreatedEvent,
  PrescriptionData,
  PrescriptionDepletedEvent,
} from '../photon-types';
import { handleCreatePrescription, handler, handleUpdatePrescription } from './handle-prescription-event';
import { getExistingMedicationRequest } from './utils';

describe('Prescription webhooks', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  vi.mock('./utils.ts', async () => {
    const actualModule = await vi.importActual('./utils.ts');
    return {
      ...actualModule,
      verifyEvent: vi.fn().mockImplementation(() => true),
      handlePhotonAuth: vi.fn().mockImplementation(() => 'example-auth-token'),
    };
  });

  const bot: Reference<Bot> = { reference: 'Bot/123' };
  const contentType = 'application/json';
  const secrets = {
    PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'client-id' },
    PHOTON_CLIENT_SECRET: {
      name: 'Photon Client Secret',
      valueString: 'client-secret',
    },
  };

  test.skip('Handle a prescription created event', async () => {
    const medplum = new MockClient();

    await medplum.createResource({
      resourceType: 'Practitioner',
      identifier: [{ system: 'https://neutron.health', value: 'usr_01J21EPR81W9XRYTY69RQY3R9J' }],
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    await medplum.createResource({
      resourceType: 'Medication',
      identifier: [{ system: 'https://neutron.health', value: 'med_01GGT9ZK1327R6SGZDJADSSNKN' }],
      code: {
        coding: [
          { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '203133', display: 'penicillin G potassium' },
        ],
      },
    });

    const prescription = await handler(medplum, {
      bot,
      contentType,
      input: createdEvent,
      secrets,
    });

    expect(prescription).toBeDefined();
    expect(prescription.status).toBe('draft');
  }, 10000);

  test.skip('Handle a prescription created event and create a new medication', async () => {
    const medplum = new MockClient();

    await medplum.createResource({
      resourceType: 'Practitioner',
      identifier: [{ system: 'https://neutron.health', value: 'usr_01J21EPR81W9XRYTY69RQY3R9J' }],
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    const prescription = await handler(medplum, {
      bot,
      contentType,
      input: createdEvent,
      secrets,
    });

    expect(prescription).toBeDefined();

    const createdMedication = await medplum.searchOne('MedicationKnowledge', {
      code: '4053',
    });

    expect(createdMedication).toBeDefined();
  });

  test.skip('Handle prescription depleted event', async () => {
    const medplum = new MockClient();
    const existingRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
    });

    const prescriptionDepletedEvent: PhotonEvent = {
      ...depletedEvent,
    };

    prescriptionDepletedEvent.data.externalId = existingRequest.id as string;

    const updatedPrescription = await handler(medplum, {
      bot,
      contentType,
      input: prescriptionDepletedEvent,
      secrets,
    });

    expect(updatedPrescription.status).toBe('completed');
    expect(updatedPrescription.identifier?.find((id) => id.system === 'https://neutron.health/webhooks')?.value).toBe(
      '01J5RAYDBXKQR472N1FT9K5ER8'
    );
  });

  test.skip('Handle prescription expired event', async () => {
    const medplum = new MockClient();
    const existingRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
    });
    const prescriptionExpiredEvent: PhotonEvent = {
      ...expiredEvent,
    };

    prescriptionExpiredEvent.data.externalId = existingRequest.id as string;

    const updatedPrescription = await handler(medplum, {
      bot,
      contentType,
      input: prescriptionExpiredEvent,
      secrets,
    });

    expect(updatedPrescription.status).toBe('stopped');
  });

  test.skip('Receive an invalid prescription type', async () => {
    const medplum = new MockClient();
    const existingPrescription: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      identifier: [{ system: 'https://neutron.health', value: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH' }],
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
    });
    const invalidPhotonEvent: PhotonEvent = { ...invalidEvent };
    invalidEvent.type = 'photon:prescription:canceled' as PhotonEvent['type'];
    invalidEvent.data.externalId = existingPrescription.id;

    await expect(() => handler(medplum, { bot, contentType, secrets, input: invalidPhotonEvent })).rejects.toThrow(
      'Invalid prescription type'
    );
  });

  test.skip('Check for existing prescription', async () => {
    const medplum = new MockClient();
    await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
      identifier: [{ system: 'https://neutron.health', value: 'example-id' }],
    });

    const prescription = await medplum.searchOne('MedicationRequest', {
      identifier: 'https://neutron.health|example-id',
    });

    const prescriptionData: PrescriptionData = {
      id: 'example-id',
      externalId: prescription?.id ?? '',
      patient: {
        id: 'example',
        externalId: 'example',
      },
    };

    const existingRequest = await getExistingMedicationRequest(prescriptionData, medplum);
    expect(existingRequest).toBeDefined();
    expect(existingRequest?.id).toBe(prescription?.id);
  });

  test.skip('Updating a prescription that does not exist', async () => {
    const medplum = new MockClient();
    await expect(() =>
      handler(medplum, {
        input: prescriptionDepletedEvent,
        secrets,
        bot,
        contentType,
      })
    ).rejects.toThrow('Prescription does not exist');
  });

  test.skip('Receive a non-prescription event', async () => {
    const medplum = new MockClient();
    await expect(() => handler(medplum, { input: orderEvent, secrets, bot, contentType })).rejects.toThrow(
      'Not a prescription event'
    );
  });

  test.skip('Idempotency test', async () => {
    const medplum = new MockClient();
    const prescriber: Practitioner = await medplum.createResource({
      resourceType: 'Practitioner',
      identifier: [{ system: 'https://neutron.health', value: 'usr_wUofzqEvcA2JCwJ4' }],
    });

    await medplum.createResource({
      resourceType: 'Medication',
      identifier: [{ system: 'https://neutron.health', value: 'med_01G7T2NB6' }],
      code: {
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '723', display: 'Amoxicillin' }],
      },
    });

    const idempotencyTestEvent: PhotonEvent = {
      ...idempotencyEvent,
    };

    idempotencyTestEvent.data.patient.externalId = prescriber.id;

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: idempotencyTestEvent,
      contentType: 'application/json',
      secrets,
    });

    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');
    const createResourceSpy = vi.spyOn(medplum, 'createResource');
    const patchResourceSpy = vi.spyOn(medplum, 'patchResource');

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: idempotencyTestEvent,
      contentType: 'application/json',
      secrets,
    });

    expect(updateResourceSpy).not.toHaveBeenCalled();
    expect(createResourceSpy).not.toHaveBeenCalled();
    expect(patchResourceSpy).not.toHaveBeenCalled();
  });

  test.skip('Updating a prescription that does not exist', async () => {
    const medplum = new MockClient();
    await expect(() =>
      handler(medplum, {
        input: prescriptionDepletedEvent,
        secrets: {},
        bot,
        contentType,
      })
    ).rejects.toThrow('Prescription does not exist');
  });

  test.skip('Receive a non-prescription event', async () => {
    const medplum = new MockClient();
    await expect(() => handler(medplum, { input: orderEvent, secrets, bot, contentType })).rejects.toThrow(
      'Not a prescription event'
    );
  });

  test.skip('Idempotency test', async () => {
    const medplum = new MockClient();
    const prescriber: Practitioner = await medplum.createResource({
      resourceType: 'Practitioner',
      identifier: [{ system: 'https://neutron.health', value: 'usr_wUofzqEvcA2JCwJ4' }],
    });

    await medplum.createResource({
      resourceType: 'Medication',
      identifier: [{ system: 'https://neutron.health', value: 'med_01G7T2NB6' }],
      code: {
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '723', display: 'Amoxicillin' }],
      },
    });

    const idempotencyTestEvent: PhotonEvent = {
      ...idempotencyEvent,
    };

    idempotencyTestEvent.data.patient.externalId = prescriber.id;

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: idempotencyTestEvent,
      contentType: 'application/json',
      secrets,
    });

    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');
    const createResourceSpy = vi.spyOn(medplum, 'createResource');
    const patchResourceSpy = vi.spyOn(medplum, 'patchResource');

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: idempotencyTestEvent,
      contentType: 'application/json',
      secrets,
    });

    expect(updateResourceSpy).not.toHaveBeenCalled();
    expect(createResourceSpy).not.toHaveBeenCalled();
    expect(patchResourceSpy).not.toHaveBeenCalled();
  });

  test.skip('Create prescription', async () => {
    const medplum = new MockClient();

    await medplum.createResource({
      resourceType: 'Practitioner',
      identifier: [{ system: 'https://neutron.health', value: 'example-prescriber' }],
    });

    await medplum.createResource({
      resourceType: 'Medication',
      identifier: [{ system: 'https://neutron.health', value: 'example-med' }],
      code: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            value: '197365',
            display: 'amoxapine 25 MG Oral Tablet',
          },
        ],
      },
    });

    const event: PrescriptionCreatedEvent = {
      id: '01G8C1TNGH2F03021F23C95261',
      type: 'photon:prescription:created',
      specversion: '1.0',
      datacontenttype: 'application/json',
      time: '2022-01-01T01:00:00.000Z',
      subject: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH',
      source: 'org:org_KzSVZBQixLRkqj5d',
      data: {
        id: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH',
        externalId: '1234',
        dispenseQuantity: 30,
        dispenseAsWritten: true,
        dispenseUnit: 'EA',
        refillsAllowed: 12,
        daysSupply: 30,
        instructions: 'Take once daily',
        notes: 'Very good',
        effectiveDate: '2022-01-01',
        expirationDate: '2023-01-01',
        prescriberId: 'example-prescriber',
        treatmentId: 'example-med',
        patient: {
          id: 'pat_ieUv67viS0lG18JN',
          externalId: '1234',
        },
      },
    };

    const medicationRequest = await handleCreatePrescription(event, medplum, 'auth-token');
    expect(medicationRequest).toBeDefined();
  });

  test.skip('Update Prescription', async () => {
    const medplum = new MockClient();

    const existingPrescription = (await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
    })) as MedicationRequest;

    const depletedEvent: PrescriptionDepletedEvent = {
      id: '01G8AHJBT081QQWM89X3SVV31F',
      type: 'photon:prescription:depleted',
      specversion: '1.0',
      datacontenttype: 'application/json',
      time: '2022-01-01T01:00:00.000Z',
      subject: 'rx_01G8AGBC91W1042CDRB19545EC',
      source: 'org:org_KzSVZBQixLRkqj5d',
      data: {
        id: 'rx_01G8AGBC91W1042CDRB19545EC',
        externalId: existingPrescription.id as string,
        patient: {
          id: 'pat_ieUv67viS0lG18JN',
          externalId: '1234',
        },
      },
    };

    const result = await handleUpdatePrescription(depletedEvent, medplum, existingPrescription);
    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
  });
});

const prescriptionDepletedEvent: PhotonEvent = {
  id: '01G8AHJBT081QQWM89X3SVV31F',
  type: 'photon:prescription:depleted',
  specversion: '1.0',
  datacontenttype: 'application/json',
  time: '2022-01-01T01:00:00.000Z',
  subject: 'rx_01G8AGBC91W1042CDRB19545EC',
  source: 'org:org_KzSVZBQixLRkqj5d',
  data: {
    id: 'rx_01G8AGBC91W1042CDRB19545EC',
    externalId: '1234',
    patient: {
      id: 'pat_ieUv67viS0lG18JN',
      externalId: '1234',
    },
  },
};

const orderEvent: PhotonEvent = {
  id: '01G7Z7TNFH0YEGVZ719TQZQBER',
  type: 'photon:order:placed',
  specversion: '1.0',
  datacontenttype: 'application/json',
  time: '2022-01-01T01:00:00.000Z',
  subject: 'ord_01G8AHAFDJ7FV2Y77FVWA19009',
  source: 'org:org_KzSVZBQixLRkqj5d',
  data: {
    id: 'ord_01G8AHAFDJ7FV2Y77FVWA19009',
    externalId: '1234',
    patient: {
      id: 'pat_ieUv67viS0lG18JN',
      externalId: '1234',
    },
  },
};

const prescriptionCreatedBody: PhotonWebhook['body'] = {
  id: '01G8C1TNGH2F03021F23C95261',
  type: 'photon:prescription:created',
  specversion: '1.0',
  datacontenttype: 'application/json',
  time: '2022-01-01T01:00:00.000Z',
  subject: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH',
  source: 'org:org_KzSVZBQixLRkqj5d',
  data: {
    id: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH',
    externalId: '1234',
    dispenseQuantity: 30,
    dispenseAsWritten: true,
    dispenseUnit: 'EA',
    refillsAllowed: 12,
    daysSupply: 30,
    instructions: 'Take once daily',
    notes: '',
    effectiveDate: '2022-01-01',
    expirationDate: '2023-01-01',
    prescriberId: 'usr_wUofzqEvcA2JCwJ4',
    treatmentId: 'med_01G7T2NB6',
    patient: {
      id: 'pat_ieUv67viS0lG18JN',
      externalId: '1234',
    },
  },
};

const idempotencyEvent: PhotonEvent = {
  ...prescriptionCreatedBody,
};

const invalidEvent: PhotonEvent = {
  id: '01G8C1TNGH2F03021F23C95261',
  type: 'photon:prescription:created',
  specversion: '1.0',
  datacontenttype: 'application/json',
  time: '2022-01-01T01:00:00.000Z',
  subject: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH',
  source: 'org:org_KzSVZBQixLRkqj5d',
  data: {
    id: 'rx_01G8C1TNF8TZ5N9DAJN66H9KSH',
    externalId: '1234',
    dispenseQuantity: 30,
    dispenseAsWritten: true,
    dispenseUnit: 'EA',
    refillsAllowed: 12,
    daysSupply: 30,
    instructions: 'Take once daily',
    notes: '',
    effectiveDate: '2022-01-01',
    expirationDate: '2023-01-01',
    prescriberId: 'usr_wUofzqEvcA2JCwJ4',
    treatmentId: 'med_01G7T2NB6',
    patient: {
      id: 'pat_ieUv67viS0lG18JN',
      externalId: '1234',
    },
  },
};

const depletedEvent: PhotonEvent = {
  id: '01J5RAYDBXKQR472N1FT9K5ER8',
  type: 'photon:prescription:depleted',
  specversion: '1.0',
  datacontenttype: 'application/json',
  time: '2024-08-20T16:46:56.381Z',
  subject: 'rx_01J5RAY5E6JK8YEW5NCFKWNZ6R',
  source: 'org:org_q5l4IPPdSR95k8Lc',
  data: {
    id: 'rx_01J5RAY5E6JK8YEW5NCFKWNZ6R',
    patient: { id: 'pat_01J5RATDZ6QADK386Z25517ZHG', externalId: 'f8cdefd1-5bbd-4b62-971d-826b1c8e10fe' },
  },
};

const createdEvent: PhotonEvent = {
  id: '01J5RHM013398BX4570H7N6JN3',
  type: 'photon:prescription:created',
  specversion: '1.0',
  datacontenttype: 'application/json',
  time: '2024-08-20T18:43:35.075Z',
  subject: 'rx_01J5RHKZZQXWAHMXKPT9CF1S6N',
  source: 'org:org_q5l4IPPdSR95k8Lc',
  data: {
    id: 'rx_01J5RHKZZQXWAHMXKPT9CF1S6N',
    patient: { id: 'pat_01J5RHGXB2ZJFQ7B694CQGSGT5', externalId: 'ec3bb2b3-474f-4d40-804d-9fdb6149b492' },
    dispenseQuantity: 342.9,
    dispenseAsWritten: true,
    dispenseUnit: 'Milliliter',
    refillsAllowed: 0,
    daysSupply: 1,
    instructions: '342.9 mL ',
    notes: '',
    effectiveDate: '2024-08-20',
    expirationDate: '2025-08-20',
    prescriberId: 'usr_01J21EPR81W9XRYTY69RQY3R9J',
    treatmentId: 'med_01J5VK0D4534R7VMD1P95VZ1RY',
  },
};

const expiredEvent: PhotonEvent = {
  id: '01G8AHJBT081QQWM89X3SVV31F',
  type: 'photon:prescription:expired',
  specversion: '1.0',
  datacontenttype: 'application/json',
  time: '2022-01-01T01:00:00.000Z',
  subject: 'rx_01G8AGBC91W1042CDRB19545EC',
  source: 'org:org_KzSVZBQixLRkqj5d',
  data: {
    id: 'rx_01G8AGBC91W1042CDRB19545EC',
    externalId: '1234',
    patient: {
      id: 'pat_ieUv67viS0lG18JN',
      externalId: '1234',
    },
  },
};
