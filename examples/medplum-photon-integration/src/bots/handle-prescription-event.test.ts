import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bot, Bundle, MedicationRequest, Patient, Practitioner, Reference, SearchParameter } from '@medplum/fhirtypes';
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

  test.skip('Receive a prescription created event', async () => {
    const medplum = new MockClient();
    await medplum.createResource({
      resourceType: 'Practitioner',
      identifier: [{ system: 'https://neutron.health', value: 'usr_wUofzqEvcA2JCwJ4' }],
      name: [{ given: ['Alice'], family: 'Smith' }],
    });

    await medplum.createResource({
      resourceType: 'Medication',
      identifier: [{ system: 'https://neutron.health', value: 'med_01G7T2NB6' }],
      code: {
        coding: [
          { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '203133', display: 'penicillin G potassium' },
        ],
      },
    });

    const createdPrescription = await handler(medplum, {
      bot,
      contentType,
      secrets: {},
      input: prescriptionCreatedWebhook,
    });

    expect(createdPrescription).toBeDefined();
    expect(createdPrescription.status).toBe('active');
  });

  test.skip('Receive a prescription depleted event', async () => {
    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Simpson', given: ['Homer'] }],
    });
    const existingPrescription: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      identifier: [{ system: 'https://neutron.health', value: 'rx_01G8AGBC91W1042CDRB19545EC' }],
      status: 'active',
      intent: 'order',
      subject: { reference: `Patient/${patient.id}` },
    });

    const depletedWebhook = {
      ...prescriptionDepletedWebhook,
    };
    depletedWebhook.body.data.externalId = existingPrescription.id;

    const depletedPrescription = await handler(medplum, {
      bot,
      contentType,
      secrets: {},
      input: depletedWebhook,
    });

    expect(depletedPrescription).toBeDefined();
    expect(depletedPrescription.status).toBe('completed');
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
    const invalidEvent = { ...invalidWebhook };
    invalidEvent.body.type = 'photon:prescription:canceled' as PhotonEvent['type'];
    invalidEvent.body.data.externalId = existingPrescription.id;

    await expect(() => handler(medplum, { bot, contentType, secrets: {}, input: invalidEvent })).rejects.toThrow(
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
  });

  test.skip('Updating a prescription that does not exist', async () => {
    const medplum = new MockClient();
    await expect(() =>
      handler(medplum, {
        input: prescriptionDepletedWebhook,
        secrets: {},
        bot,
        contentType,
      })
    ).rejects.toThrow('Prescription does not exist');
  });

  test.skip('Receive a non-prescription event', async () => {
    const medplum = new MockClient();
    await expect(() => handler(medplum, { input: orderEvent, secrets: {}, bot, contentType })).rejects.toThrow(
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

    const idempotencyTestWebhook = {
      ...idempotencyWebhook,
    };

    idempotencyTestWebhook.body.data.patient.externalId = prescriber.id;

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: idempotencyTestWebhook,
      contentType: 'application/json',
      secrets: {
        PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'EXAMPLE_CLIENT_ID' },
        PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'EXAMPLE_CLIENT_SECRET' },
        PHOTON_WEBHOOK_SECRET: { name: 'Photon Webhook Secret', valueString: 'EXAMPLE_WEBHOOK_SECRET' },
      },
    });

    const updateResourceSpy = vi.spyOn(medplum, 'updateResource');
    const createResourceSpy = vi.spyOn(medplum, 'createResource');
    const patchResourceSpy = vi.spyOn(medplum, 'patchResource');

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: idempotencyTestWebhook,
      contentType: 'application/json',
      secrets: {
        PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'EXAMPLE_CLIENT_ID' },
        PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'EXAMPLE_CLIENT_SECRET' },
        PHOTON_ORDER_WEBHOOK_SECRET: { name: 'Photon Webhook Secret', valueString: 'EXAMPLE_ORDER_WEBHOOK_SECRET' },
      },
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
      specversion: 1.0,
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
        medicationId: 'example-med',
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
      specversion: 1.0,
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

const exampleHeaders: PhotonWebhook['headers'] = {
  'Content-Type': 'application/json',
  'x-photon-signature': 'idempotency-test',
  Authorization: 'Bearer EXAMPLE_TOKEN',
};
const prescriptionDepletedWebhook: PhotonWebhook = {
  headers: exampleHeaders,
  body: {
    id: '01G8AHJBT081QQWM89X3SVV31F',
    type: 'photon:prescription:depleted',
    specversion: 1.0,
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
  },
};

const orderEvent: PhotonWebhook = {
  headers: {
    'Content-Type': 'application/json',
  },
  body: {
    id: '01G7Z7TNFH0YEGVZ719TQZQBER',
    type: 'photon:order:placed',
    specversion: 1.0,
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
  },
};

const prescriptionCreatedBody: PhotonWebhook['body'] = {
  id: '01G8C1TNGH2F03021F23C95261',
  type: 'photon:prescription:created',
  specversion: 1.0,
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
    medicationId: 'med_01G7T2NB6',
    patient: {
      id: 'pat_ieUv67viS0lG18JN',
      externalId: '1234',
    },
  },
};

const idempotencyWebhook: PhotonWebhook = {
  headers: exampleHeaders,
  body: prescriptionCreatedBody,
};

const prescriptionCreatedWebhook: PhotonWebhook = {
  headers: exampleHeaders,
  body: prescriptionCreatedBody,
};

const invalidWebhook: PhotonWebhook = {
  headers: exampleHeaders,
  body: {
    id: '01G8C1TNGH2F03021F23C95261',
    type: 'photon:prescription:created',
    specversion: 1.0,
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
      medicationId: 'med_01G7T2NB6',
      patient: {
        id: 'pat_ieUv67viS0lG18JN',
        externalId: '1234',
      },
    },
  },
};
