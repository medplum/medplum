import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bot, Bundle, MedicationRequest, Organization, Patient, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { PhotonWebhook } from '../photon-types';
import { checkForStatusUpdate, getStatus, handler } from './handle-order-event';
import { NEUTRON_HEALTH, NEUTRON_HEALTH_WEBHOOKS } from './system-strings';
import {
  canceledWebhook,
  completedWebhook,
  createdWebhook,
  errorWebhook,
  placedWebhook,
} from './test-data/order-event-test-data';

describe('Order webhook handler', async () => {
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

  test.skip('Returns existing request on dupe', async () => {
    const medplum = new MockClient();
    const existingRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/123' },
      identifier: [
        { system: NEUTRON_HEALTH, value: 'ord_01J5RHM42NS4WA666RJVP02N45' },
        { system: NEUTRON_HEALTH_WEBHOOKS, value: '01J5RHM4DVKA7YGE0AR3J4MS31' },
      ],
    });

    const result = await handler(medplum, {
      bot,
      contentType,
      input: createdWebhook,
      secrets: {
        PHOTON_CLIENT_ID: { name: 'client id', valueString: 'client-id' },
        PHOTON_CLIENT_SECRET: { name: 'client secret', valueString: 'client-secret' },
      },
    });
    expect(result).toEqual(existingRequest);
  });

  test.skip('Update existing request with order placed webhook', async () => {
    const medplum = new MockClient();
    const mockPatient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH, value: 'pat_ieUv67viS0lG18JN' }],
    });
    const existingRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: getReferenceString(mockPatient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'ord_01G8AHAFDJ7FV2Y77FVWA19009' }],
    });

    // Updating an order from a placed webhook does not provide any new data. However, it will still be updated with a new identifier, so the versionId should be updated.
    const updatedOrder = await handler(medplum, { bot, contentType, input: placedWebhook, secrets: {} });
    expect(updatedOrder?.id).toEqual(existingRequest.id);
    expect(updatedOrder?.status).toEqual(existingRequest.status);
    expect(updatedOrder?.meta?.versionId).not.toEqual(existingRequest.meta?.versionId);
  });

  test.skip('Update existing request with order error webhook', async () => {
    const medplum = new MockClient();
    const mockPatient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH, value: 'pat_ieUv67viS0lG18JN' }],
    });
    const existingRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: getReferenceString(mockPatient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'ord_01G8AHAFDJ7FV2Y77FVWA19009' }],
    });

    const updatedOrder = await handler(medplum, { bot, contentType, input: errorWebhook, secrets: {} });

    expect(updatedOrder?.status).toEqual('cancelled');
    expect(updatedOrder?.id).toEqual(existingRequest.id);
    expect(updatedOrder?.statusReason?.coding?.[0].code).toEqual('EXAMPLE REASON');
    expect(updatedOrder?.meta?.versionId).not.toEqual(existingRequest.meta?.versionId);
  });

  test.skip('Update existing request with canceled webhook', async () => {
    const medplum = new MockClient();
    const mockPatient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH, value: 'pat_ieUv67viS0lG18JN' }],
    });
    const existingRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: getReferenceString(mockPatient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'ord_01G8AHAFDJ7FV2Y77FVWA19009' }],
    });

    const updatedOrder = await handler(medplum, { bot, contentType, input: canceledWebhook, secrets: {} });
    // Only the status and version ID should change
    expect(updatedOrder?.status).toEqual('cancelled');
    expect(updatedOrder?.id).toEqual(existingRequest.id);
    expect(updatedOrder?.meta?.versionId).not.toEqual(existingRequest.meta?.versionId);
  });

  test.skip('Update existing request with completed webhook', async () => {
    const medplum = new MockClient();
    const mockPatient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH, value: 'pat_ieUv67viS0lG18JN' }],
    });
    const existingRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: getReferenceString(mockPatient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'ord_01G8AHAFDJ7FV2Y77FVWA19009' }],
    });

    const updatedOrder = await handler(medplum, { bot, contentType, input: completedWebhook, secrets: {} });
    // Only the status and version ID should change
    expect(updatedOrder?.status).toEqual('completed');
    expect(updatedOrder?.id).toEqual(existingRequest.id);
    expect(updatedOrder?.meta?.versionId).not.toEqual(existingRequest.meta?.versionId);
  });

  test.skip('Update existing request with created webhook', async () => {
    const medplum = new MockClient();
    const mockPatient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH, value: 'pat_01J5RHGXB2ZJFQ7B694CQGSGT5' }],
    });
    const existingRequest: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: getReferenceString(mockPatient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'ord_01J5RHM42NS4WA666RJVP02N45' }],
    });
    // Create a prescription that the order is linked to
    await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: getReferenceString(mockPatient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'rx_01J5RHKZZQXWAHMXKPT9CF1S6N' }],
    });

    const testWebhook = { ...createdWebhook };
    testWebhook.body.data.patient.externalId = mockPatient.id;

    const updatedOrder = await handler(medplum, {
      bot,
      contentType,
      input: testWebhook,
      secrets: {
        PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'client-id' },
        PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'client-secret' },
      },
    });
    // Only the status and version ID should change
    expect(updatedOrder?.status).toEqual('active');
    expect(updatedOrder?.id).toEqual(existingRequest.id);
    expect(updatedOrder?.meta?.versionId).not.toEqual(existingRequest.meta?.versionId);
  }, 10000);

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

    await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'proposal',
      subject: { reference: getReferenceString(patient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'rx_01J5RHKZZQXWAHMXKPT9CF1S6N' }],
    });

    const pharmacy: Organization = await medplum.createResource({
      resourceType: 'Organization',
      identifier: [{ system: NEUTRON_HEALTH, value: 'phr_01GA9HPXNXTFEQV4146CZ4BN6M' }],
    });

    const createdWebhook: PhotonWebhook = {
      ...orderCreatedWebhook,
    };

    createdWebhook.body.data.patient.externalId = patient.id;

    const createdOrder = await handler(medplum, {
      bot,
      contentType,
      input: createdWebhook,
      secrets: {
        PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'client-id' },
        PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'client-secret' },
      },
    });

    const dispense = await medplum.searchOne('MedicationDispense');

    expect(createdOrder).toBeDefined();
    expect(createdOrder?.subject.reference).toBe(getReferenceString(patient));
    expect(createdOrder?.dispenseRequest?.performer?.reference).toBe(getReferenceString(pharmacy));
    expect(dispense).toBeDefined();
  }, 10000);

  test.skip('Idempotency test', async () => {
    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH, value: 'pat_ieUv67viS0lG18JN' }],
    });

    await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: getReferenceString(patient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'rx_01J5RHKZZQXWAHMXKPT9CF1S6N' }],
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
        PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'client-id' },
        PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'client-secret' },
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
        PHOTON_CLIENT_ID: { name: 'Photon Client ID', valueString: 'client-id' },
        PHOTON_CLIENT_SECRET: { name: 'Photon Client Secret', valueString: 'client-secret' },
        PHOTON_ORDER_WEBHOOK_SECRET: { name: 'Photon Webhook Secret', valueString: 'EXAMPLE_ORDER_WEBHOOK_SECRET' },
      },
    });

    expect(updateResourceSpy).not.toHaveBeenCalled();
    expect(createResourceSpy).not.toHaveBeenCalled();
    expect(patchResourceSpy).not.toHaveBeenCalled();
  });

  test('getStatus', () => {
    expect(getStatus('photon:order:canceled')).toBe('cancelled');
    expect(getStatus('photon:order:completed')).toBe('completed');
    expect(getStatus('photon:order:error')).toBe('cancelled');
    expect(getStatus('photon:order:created')).toBe('active');
  });

  test('Status should be updated', () => {
    expect(checkForStatusUpdate('photon:order:completed', 'active')).toBe(true);
    expect(checkForStatusUpdate('photon:order:canceled', 'active')).toBe(true);
    expect(checkForStatusUpdate('photon:order:error', 'active')).toBe(true);
  });

  test('Status should not be updated', () => {
    expect(checkForStatusUpdate('photon:order:created', 'active')).toBe(false);
    expect(checkForStatusUpdate('photon:order:completed', 'completed')).toBe(false);
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
