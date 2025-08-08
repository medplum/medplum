// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bot, Bundle, MedicationRequest, Patient, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { Fill, OrderCreatedData } from '../photon-types';
import { NEUTRON_HEALTH } from './constants';
import { getFillStatus, getPatient, handler } from './handle-order-event';
import { createdWebhook, noPrescriptionId, placedWebhook } from './test-data/order-event-test-data';

describe('Order event handler', async () => {
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
    PHOTON_CLIENT_ID: { name: 'client id', valueString: 'client-id' },
    PHOTON_CLIENT_SECRET: { name: 'client secret', valueString: 'client-secret' },
  };

  test.skip('Returns undefined if it is not an order created event', async () => {
    const medplum = new MockClient();
    const result = await handler(medplum, { bot, contentType, secrets: {}, input: placedWebhook.body });
    expect(result).toBeUndefined();
  });

  test.skip('Patient is not in Medplum', async () => {
    const medplum = new MockClient();
    await expect(() => handler(medplum, { bot, contentType, secrets, input: createdWebhook.body })).rejects.toThrow(
      'No linked patient'
    );
  });

  test.skip('Order with only one fill', async () => {
    const medplum = new MockClient();
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH, value: 'pat_01J5RHGXB2ZJFQ7B694CQGSGT5' }],
    });

    const authorizingPrescription: MedicationRequest = await medplum.createResource({
      resourceType: 'MedicationRequest',
      status: 'draft',
      intent: 'filler-order',
      subject: { reference: getReferenceString(patient) },
      identifier: [{ system: NEUTRON_HEALTH, value: 'rx_01J5RHKZZQXWAHMXKPT9CF1S6N' }],
    });

    const prescriptionId = authorizingPrescription.id as string;

    const dispenses = await handler(medplum, { bot, contentType, secrets, input: createdWebhook.body });
    const updatedPrescription = await medplum.readResource('MedicationRequest', prescriptionId);
    expect(dispenses?.length).toBe(1);
    expect(dispenses?.[0].status).toBe('in-progress');
    expect(updatedPrescription.status).toBe('active');
  }, 10000);

  test.skip('Fill with no authorizing prescription', async () => {
    const medplum = new MockClient();

    await medplum.createResource({
      resourceType: 'Patient',
      identifier: [{ system: NEUTRON_HEALTH, value: 'pat_01J5RHGXB2ZJFQ7B694CQGSGT5' }],
    });

    await expect(() => handler(medplum, { bot, contentType, secrets, input: noPrescriptionId.body })).rejects.toThrow(
      'Medication could not be dispensed as there is no authorizing prescription'
    );
  });

  test.skip('No patient to get', async () => {
    const medplum = new MockClient();

    const orderPatientData: OrderCreatedData['patient'] = { id: 'pat_01J5RHGXB2ZJFQ7B694CQGSGT5' };

    const result = await getPatient(orderPatientData, medplum);
    expect(result).toBeUndefined();
  });

  test.skip('Get patient by Medplum ID', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
    });

    const orderPatientData: OrderCreatedData['patient'] = {
      id: 'pat_01J5RHGXB2ZJFQ7B694CQGSGT5',
      externalId: patient.id,
    };

    const result = await getPatient(orderPatientData, medplum);
    expect(result).toStrictEqual(patient);
  });

  test.skip('Get fill status', async () => {
    expect(getFillStatus('NEW')).toBe('in-progress');
    expect(getFillStatus('SCHEDULED')).toBe('preparation');
    expect(getFillStatus('SENT')).toBe('in-progress');
    expect(getFillStatus('CANCELED')).toBe('cancelled');
    expect(() => getFillStatus('cancelled' as Fill['state'])).toThrow('Invalid Fill state');
  });
});
