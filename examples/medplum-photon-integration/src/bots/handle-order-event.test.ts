import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bot, Bundle, MedicationRequest, Organization, Patient, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { OrderEvent, PhotonWebhook } from '../photon-types';
import { createMedicationRequest, handler, updateMedicationRequest } from './handle-order-event';

describe('Order webhooks', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  vi.mock('./utils.ts', async () => {
    const actualModule = vi.importActual('./utils.ts');
    return {
      ...actualModule,
      verifyEvent: vi.fn().mockImplementation(() => true),
    };
  });

  const bot: Reference<Bot> = { reference: 'Bot/123' };
  const contentType = 'application/json';

  test.skip('Handle order created event with no existing request', async () => {
    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['Kevin'] }],
      telecom: [
        { system: 'phone', value: '6095559203' },
        { system: 'email', value: 'kevinsmith9413-medplum@aol.com' },
      ],
      address: [{ line: ['702 10th Street'], city: 'Easton', state: 'PA', postalCode: '18042' }],
    });

    const pharmacy: Organization = await medplum.createResource({
      resourceType: 'Organization',
      identifier: [{ system: 'https://neutron.health', value: 'phr_01GA9HPXNXTFEQV4146CZ4BN6M' }],
    });

    const createdWebhook: PhotonWebhook = {
      ...orderCreatedWebhook,
    };

    createdWebhook.body.data.patient.externalId = patient.id;

    const createdOrder = await handler(medplum, {
      bot,
      contentType,
      input: createdWebhook,
      secrets: {},
    });

    expect(createdOrder).toBeDefined();
    expect(createdOrder?.subject.reference).toBe(getReferenceString(patient));
    expect(createdOrder?.dispenseRequest?.performer?.reference).toBe(getReferenceString(pharmacy));
  }, 10000);

  test.skip('Create medication request from order created event', async () => {
    const medplum = new MockClient();
    const authToken = 'example-token';
    const patientData: Patient = {
      resourceType: 'Patient',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    };

    const patient = await medplum.createResource(patientData);

    const medicationRequest = await createMedicationRequest(
      orderCreatedWebhook.body as OrderEvent,
      medplum,
      authToken,
      patient
    );
    console.log(medicationRequest);
    expect(medicationRequest).toBeDefined();
  });

  test.skip('Update medication request from order created event', async () => {
    const medplum = new MockClient();
    const body = orderCreatedWebhook.body as OrderEvent;
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
      };
    });

    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: 'https://neutron.health', value: 'pat_ieUv67viS0lG18JN' }],
    });

    const idempotencyTestWebhook = {
      ...orderCreatedWebhook,
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
        PHOTON_ORDER_WEBHOOK_SECRET: { name: 'Photon Webhook Secret', valueString: 'EXAMPLE_ORDER_WEBHOOK_SECRET' },
      },
    });

    expect(updateResourceSpy).not.toHaveBeenCalled();
    expect(createResourceSpy).not.toHaveBeenCalled();
    expect(patchResourceSpy).not.toHaveBeenCalled();
  });
});

const orderCreatedWebhook: PhotonWebhook = {
  method: 'POST',
  path: '/',
  query: {},
  client_ip: '54.225.12.79',
  url: 'https://eo40vrrlskxy2fd.m.pipedream.net/',
  headers: {
    host: 'eo40vrrlskxy2fd.m.pipedream.net',
    'content-length': '570',
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/cloudevents-batch+json',
    'x-photon-signature': '554de2d9b96473228593835f033be183bc632eb12bd4e0df61a8c6a5192f567d',
    'x-photon-timestamp': '1724179433658',
    'user-agent': 'axios/1.7.2',
    'accept-encoding': 'gzip, compress, deflate, br',
    'x-datadog-trace-id': '8330054363468631196',
    'x-datadog-parent-id': '6375191779022861325',
    'x-datadog-sampling-priority': '1',
    'x-datadog-tags': '_dd.p.tid=66c4e3e900000000,_dd.p.dm=-0',
    traceparent: '00-66c4e3e900000000739a4c4f1e3d8c9c-58793b2553a5f40d-01',
    tracestate: 'dd=t.dm:-0;t.tid:66c4e3e900000000;s:1',
  },
  body: {
    id: '01J5RHM4DVKA7YGE0AR3J4MS31',
    type: 'photon:order:created',
    specversion: 1.0,
    datacontenttype: 'application/json',
    time: '2024-08-20T18:43:39.579Z',
    subject: 'ord_01J5RHM42NS4WA666RJVP02N45',
    source: 'org:org_q5l4IPPdSR95k8Lc',
    data: {
      createdAt: '2024-08-22T17:16:45.444Z',
      id: 'ord_01J5RHM42NS4WA666RJVP02N45',
      patient: { id: 'pat_01J5RHGXB2ZJFQ7B694CQGSGT5', externalId: 'ec3bb2b3-474f-4d40-804d-9fdb6149b492' },
      pharmacyId: 'phr_01GA9HPXNXTFEQV4146CZ4BN6M',
      fills: [
        {
          id: 'fil_01J5RHM4BZNZSAW36X8T9B0DQR',
          prescription: { id: 'rx_01J5RHKZZQXWAHMXKPT9CF1S6N' },
        },
      ],
    },
  },
};
