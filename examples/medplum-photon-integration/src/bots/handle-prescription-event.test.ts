import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, MedicationRequest, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { PrescriptionCreatedEvent, PrescriptionData, PrescriptionDepletedEvent } from '../photon-types';
import {
  getExistingPrescription,
  handleCreatePrescription,
  handleUpdatePrescription,
} from './handle-prescription-event';

describe('Prescription webhooks', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
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

    const existingRequest = await getExistingPrescription(prescriptionData, medplum);
    expect(existingRequest).toBeDefined();
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

  test('Update Prescription', async () => {
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
