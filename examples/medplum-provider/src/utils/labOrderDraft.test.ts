// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Organization,
  Practitioner,
  QuestionnaireResponse,
  ServiceRequest,
  Specimen,
  Task,
} from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getLabOrderDraftDefaults } from './labOrderDraft';

describe('getLabOrderDraftDefaults', () => {
  let medplum: MockClient;
  let requester: Practitioner;
  let lab: Organization;
  let specimen: Specimen;
  let aoeResponse: QuestionnaireResponse;
  let task: Task;
  let order: ServiceRequest;

  beforeEach(async () => {
    medplum = new MockClient();
    requester = await medplum.createResource<Practitioner>({ resourceType: 'Practitioner', name: [{ family: 'Who' }] });
    lab = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Test Lab',
      identifier: [{ system: 'https://www.healthgorilla.com', value: 'f-lab' }],
    });
    specimen = await medplum.createResource<Specimen>({
      resourceType: 'Specimen',
      collection: { collectedDateTime: '2024-03-01T10:00:00.000Z' },
    });
    aoeResponse = await medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [{ linkId: 'fasting', answer: [{ valueBoolean: true }] }],
    });
    order = await medplum.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'draft',
      intent: 'order',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      requester: { reference: `Practitioner/${requester.id}` },
      encounter: { reference: 'Encounter/enc-1' },
      performer: [{ reference: `Organization/${lab.id}` }],
      specimen: [{ reference: `Specimen/${specimen.id}` }],
      code: {
        coding: [
          { system: 'http://snomed.info/sct', code: '108252007', display: 'Laboratory procedure (procedure)' },
          { system: 'urn:uuid:f:lab', code: 'CBC', display: 'Complete Blood Count' },
          { system: 'urn:uuid:f:lab', code: 'BMP', display: 'Basic Metabolic' },
        ],
      },
      reasonCode: [
        { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9', display: 'Diabetes' }] },
        { text: 'No coding, should be dropped' },
      ],
      extension: [
        { url: 'billTo', valueString: 'insurance' },
        { url: 'performingLabAccountNumber', valueString: 'ACCT-1' },
        { url: 'performingLabPhysicianAccountNumber', valueString: 'PHY-1' },
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
      supportingInfo: [{ reference: `QuestionnaireResponse/${aoeResponse.id}` }],
    });
    task = await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      focus: { reference: `ServiceRequest/${order.id}` },
    });
  });

  test('rehydrates every form value from the draft and its referenced resources', async () => {
    const defaults = await getLabOrderDraftDefaults(medplum, order);

    expect(defaults.patient?.id).toBe(HomerSimpson.id);
    expect(defaults.requester?.id).toBe(requester.id);
    expect(defaults.performingLab?.id).toBe(lab.id);
    expect(defaults.encounter).toEqual({ reference: 'Encounter/enc-1' });
    expect(defaults.task?.id).toBe(task.id);
    expect(defaults.performingLabAccountNumber).toBe('ACCT-1');
    expect(defaults.performingLabPhysicianAccountNumber).toBe('PHY-1');
    // The SNOMED "Laboratory procedure" marker coding is not a test
    expect(defaults.tests.map((t) => t.code)).toEqual(['CBC', 'BMP']);
    expect(defaults.unresolvedTests).toEqual([]);
    expect(defaults.testMetadata).toEqual({
      CBC: { priority: 'stat', notes: 'Run first', aoeResponses: expect.objectContaining({ id: aoeResponse.id }) },
    });
    expect(defaults.diagnoses).toEqual([
      { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9', display: 'Diabetes' }] },
    ]);
    expect(defaults.billTo).toBe('insurance');
    expect(defaults.orderNotes).toBe('Fasting');
    expect(defaults.specimenCollectedDateTime?.toISOString()).toBe('2024-03-01T10:00:00.000Z');
  });

  test('resolves terminology-coded tests from a care plan draft against the lab compendium', async () => {
    const compendiumCoding = { system: 'urn:uuid:f:lab', code: '303756', display: 'Lipid Panel' };
    const executeBot = vi.spyOn(medplum, 'executeBot').mockImplementation(async (_bot, params) => {
      const { query } = params as { query: string };
      // Only the name search finds it, and the first hit is a different test with a similar name
      const result = query === 'Lipid panel' ? [{ ...compendiumCoding, code: '303757' }, compendiumCoding] : [];
      return { type: 'test', result };
    });
    order.code = {
      coding: [
        { system: 'http://snomed.info/sct', code: '303756', display: 'Lipid panel (procedure)' },
        { system: 'http://loinc.org', code: '24323-8', display: 'Comprehensive metabolic 2000 panel' },
        { system: 'urn:uuid:f:lab', code: 'CBC', display: 'Complete Blood Count' },
      ],
    };

    const defaults = await getLabOrderDraftDefaults(medplum, order);

    expect(defaults.tests).toEqual([
      compendiumCoding,
      { system: 'urn:uuid:f:lab', code: 'CBC', display: 'Complete Blood Count' },
    ]);
    expect(defaults.unresolvedTests).toEqual([
      { system: 'http://loinc.org', code: '24323-8', display: 'Comprehensive metabolic 2000 panel' },
    ]);
    expect(executeBot).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'health-gorilla-labs/autocomplete' }),
      { type: 'test', query: '303756', labId: 'f-lab' },
      expect.anything()
    );
    // Compendium-coded tests are not looked up
    expect(executeBot).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ query: 'CBC' }),
      expect.anything()
    );
  });

  test('treats a failed compendium lookup as an unresolved test', async () => {
    vi.spyOn(medplum, 'executeBot').mockRejectedValue(new Error('Health Gorilla timeout'));
    order.code = {
      coding: [
        { system: 'http://snomed.info/sct', code: '303756', display: 'Lipid panel' },
        { system: 'urn:uuid:f:lab', code: 'CBC', display: 'Complete Blood Count' },
      ],
    };

    const defaults = await getLabOrderDraftDefaults(medplum, order);

    expect(defaults.tests.map((t) => t.code)).toEqual(['CBC']);
    expect(defaults.unresolvedTests.map((t) => t.code)).toEqual(['303756']);
  });

  test('does not pass terminology-coded tests through when the lab has no Health Gorilla id', async () => {
    const executeBot = vi.spyOn(medplum, 'executeBot');
    order.performer = undefined;
    order.code = {
      coding: [
        { system: 'http://loinc.org', code: '24323-8', display: 'Metabolic panel' },
        { system: 'urn:uuid:f:lab', code: 'CBC', display: 'Complete Blood Count' },
      ],
    };

    const defaults = await getLabOrderDraftDefaults(medplum, order);

    expect(defaults.tests.map((t) => t.code)).toEqual(['CBC']);
    expect(defaults.unresolvedTests.map((t) => t.code)).toEqual(['24323-8']);
    expect(executeBot).not.toHaveBeenCalled();
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
      encounter: undefined,
      task: undefined,
      performingLab: undefined,
      performingLabAccountNumber: undefined,
      performingLabPhysicianAccountNumber: undefined,
      tests: [],
      unresolvedTests: [],
      testMetadata: {},
      diagnoses: [],
      billTo: undefined,
      orderNotes: undefined,
      specimenCollectedDateTime: undefined,
    });
  });
});
