// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization, Practitioner, ServiceRequest, Specimen } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test } from 'vitest';
import { getLabOrderDraftDefaults } from './labOrderDraft';

describe('getLabOrderDraftDefaults', () => {
  let medplum: MockClient;
  let requester: Practitioner;
  let lab: Organization;
  let specimen: Specimen;
  let order: ServiceRequest;

  beforeEach(async () => {
    medplum = new MockClient();
    requester = await medplum.createResource<Practitioner>({ resourceType: 'Practitioner', name: [{ family: 'Who' }] });
    lab = await medplum.createResource<Organization>({ resourceType: 'Organization', name: 'Test Lab' });
    specimen = await medplum.createResource<Specimen>({
      resourceType: 'Specimen',
      collection: { collectedDateTime: '2024-03-01T10:00:00.000Z' },
    });
    order = await medplum.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'draft',
      intent: 'order',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requester: { reference: `Practitioner/${requester.id}` },
      performer: [{ reference: `Organization/${lab.id}` }],
      specimen: [{ reference: `Specimen/${specimen.id}` }],
      code: {
        coding: [
          { code: 'CBC', display: 'Complete Blood Count' },
          { code: 'BMP', display: 'Basic Metabolic' },
        ],
      },
      reasonCode: [
        { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9', display: 'Diabetes' }] },
        { text: 'No coding, should be dropped' },
      ],
      extension: [
        { url: 'billTo', valueString: 'insurance' },
        { url: 'performingLabAccountNumber', valueString: 'ACCT-1' },
      ],
      note: [{ text: 'Fasting' }],
    });
    await medplum.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'draft',
      intent: 'order',
      basedOn: [{ reference: `ServiceRequest/${order.id}` }],
      subject: { reference: `Patient/${HomerSimpson.id}` },
      code: { coding: [{ code: 'CBC' }] },
      priority: 'stat',
      note: [{ text: 'Run first' }],
    });
  });

  test('rehydrates every form value from the draft and its referenced resources', async () => {
    const defaults = await getLabOrderDraftDefaults(medplum, order);

    expect(defaults.patient?.id).toBe(HomerSimpson.id);
    expect(defaults.requester?.id).toBe(requester.id);
    expect(defaults.performingLab?.id).toBe(lab.id);
    expect(defaults.performingLabAccountNumber).toBe('ACCT-1');
    expect(defaults.tests.map((t) => t.code)).toEqual(['CBC', 'BMP']);
    expect(defaults.testMetadata).toEqual({ CBC: { priority: 'stat', notes: 'Run first' } });
    expect(defaults.diagnoses).toEqual([
      { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9', display: 'Diabetes' }] },
    ]);
    expect(defaults.billTo).toBe('insurance');
    expect(defaults.orderNotes).toBe('Fasting');
    expect(defaults.specimenCollectedDateTime?.toISOString()).toBe('2024-03-01T10:00:00.000Z');
  });

  test('tolerates a minimal draft with no references or extensions', async () => {
    const defaults = await getLabOrderDraftDefaults(medplum, {
      resourceType: 'ServiceRequest',
      status: 'draft',
      intent: 'order',
      subject: { display: 'Unknown' },
      code: { coding: [{ display: 'no code' }] },
    });

    expect(defaults).toEqual({
      patient: undefined,
      requester: undefined,
      performingLab: undefined,
      performingLabAccountNumber: undefined,
      tests: [],
      testMetadata: {},
      diagnoses: [],
      billTo: undefined,
      orderNotes: undefined,
      specimenCollectedDateTime: undefined,
    });
  });
});
