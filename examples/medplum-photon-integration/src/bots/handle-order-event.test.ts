import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, MedicationRequest, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { OrderCreatedEvent, PhotonWebhook } from '../photon-types';
import { createMedicationRequest, handler, updateMedicationRequest } from './handle-order-event';

describe('Order webhooks', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test.skip('Create medication request from order created event', async () => {
    const medplum = new MockClient();
    const authToken = 'example-token';
    const patientData: Patient = {
      resourceType: 'Patient',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    };

    const patient = await medplum.createResource(patientData);

    const medicationRequest = await createMedicationRequest(orderCreatedEvent, medplum, authToken, patient);
    console.log(medicationRequest);
    expect(medicationRequest).toBeDefined();
  });

  test.skip('Update medication request from order created event', async () => {
    const medplum = new MockClient();
    const body = orderCreatedEvent;
    const authToken = 'example-auth-token';
    const existingRequestData: MedicationRequest = {
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
    };
    const exisitingRequest = await medplum.createResource(existingRequestData);

    const updatedRequest = await updateMedicationRequest(body, medplum, authToken, exisitingRequest);

    expect(updatedRequest).toBeDefined();
    expect(updatedRequest.status).toBe('active');
  });

  test.skip('Idempotency test', async () => {
    vi.mock('./utils.ts', async () => {
      const actualModule = await vi.importActual('./utils.ts');
      return {
        ...actualModule,
        verifyEvent: vi.fn().mockImplementation(() => true),
        handlePhotonAuth: vi.fn().mockImplementation(() => 'example-auth-token'),
      };
    });

    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: 'https://neutron.health', value: 'pat_ieUv67viS0lG18JN' }],
    });

    const idempotencyTestWebhook = {
      ...testWebhook,
    };

    idempotencyTestWebhook.body.data.patient.externalId = patient.id;

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
        PHOTON_WEBHOOK_SECRET: { name: 'Photon Webhook Secret', valueString: 'EXAMPLE_WEBHOOK_SECRET' },
      },
    });

    expect(updateResourceSpy).not.toHaveBeenCalled();
    expect(createResourceSpy).not.toHaveBeenCalled();
    expect(patchResourceSpy).not.toHaveBeenCalled();
  });
});

const exampleWebhookEvent: PhotonWebhook = {
  method: 'POST',
  query: {},
  path: '/',
  client_ip: 'example-ip',
  url: 'https://neutron.health',
  headers: {
    'Content-Type': 'application/json',
    'x-photon-signature': 'verification-test',
    Authorization: 'Bearer EXAMPLE_TOKEN',
  },
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
    },
    fills: [],
    createdAt: '2022-01-01T01:00:00.000Z',
  },
};

const testWebhook: PhotonWebhook = {
  headers: {
    'Content-Type': 'application/json',
    'x-photon-signature': 'idempotency-test',
    Authorization: 'Bearer EXAMPLE_TOKEN',
  },
  body: orderCreatedEvent,
};
