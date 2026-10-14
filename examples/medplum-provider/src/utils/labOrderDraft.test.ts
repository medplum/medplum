// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type {
  Organization,
  Practitioner,
  QuestionnaireResponse,
  Reference,
  ServiceRequest,
  Specimen,
  Task,
} from '@medplum/fhirtypes';
import type { PartialLabOrderInputs } from '@medplum/health-gorilla-core';
import { LabOrderValidationError } from '@medplum/health-gorilla-core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getLabOrderDraftDefaults, saveLabOrderDraft } from './labOrderDraft';

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

describe('saveLabOrderDraft', () => {
  const cbc = { system: 'urn:uuid:f:lab', code: 'CBC', display: 'Complete Blood Count' };
  const bmp = { system: 'urn:uuid:f:lab', code: 'BMP', display: 'Basic Metabolic' };
  const tsh = { system: 'urn:uuid:f:lab', code: 'TSH', display: 'Thyroid Stimulating Hormone' };
  let medplum: MockClient;
  let inputs: PartialLabOrderInputs;

  function aoe(fasting: boolean): QuestionnaireResponse {
    return {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      item: [{ linkId: 'fasting', answer: [{ valueBoolean: fasting }] }],
    };
  }

  beforeEach(async () => {
    medplum = new MockClient();
    const lab = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Test Lab',
      identifier: [{ system: 'https://www.healthgorilla.com', value: 'f-lab' }],
    });
    inputs = {
      patient: HomerSimpson,
      requester: await medplum.createResource<Practitioner>({ resourceType: 'Practitioner' }),
      performingLab: lab,
      selectedTests: [cbc, bmp],
      testMetadata: {
        CBC: {
          priority: 'stat',
          notes: 'Run first',
          aoeResponses: aoe(true),
          // A required AOE answer that is still missing does not block saving a draft
          aoeQuestionnaire: {
            resourceType: 'Questionnaire',
            status: 'active',
            item: [{ linkId: 'volume', type: 'string', required: true }],
          },
        },
        BMP: { aoeResponses: aoe(false) },
      },
      diagnoses: [{ coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9', display: 'Diabetes' }] }],
      billingInformation: {},
      orderNotes: 'Fasting',
      specimenCollectedDateTime: new Date('2024-03-01T10:00:00.000Z'),
    };
  });

  test('creates a draft that resumes with the saved values', async () => {
    const saved = await saveLabOrderDraft(medplum, inputs);

    expect(saved.status).toBe('draft');
    const defaults = await getLabOrderDraftDefaults(medplum, saved);
    expect(defaults.tests).toEqual([cbc, bmp]);
    expect(defaults.testMetadata.CBC).toEqual({
      priority: 'stat',
      notes: 'Run first',
      aoeResponses: expect.objectContaining({ item: aoe(true).item }),
    });
    expect(defaults.diagnoses).toEqual(inputs.diagnoses);
    expect(defaults.billTo).toBeUndefined();
    expect(defaults.orderNotes).toBe('Fasting');
    expect(defaults.specimenCollectedDateTime).toEqual(inputs.specimenCollectedDateTime);
  });

  test('updates the draft and its per-test requests, AOE answers and specimen in place', async () => {
    const first = await saveLabOrderDraft(medplum, inputs);
    const draft = await medplum.updateResource({ ...first, encounter: { reference: 'Encounter/enc-1' } });
    const firstTests = await medplum.searchResources('ServiceRequest', { 'based-on': `ServiceRequest/${draft.id}` });
    const findTest = (tests: ServiceRequest[], code: string): ServiceRequest | undefined =>
      tests.find((test) => test.code?.coding?.[0]?.code === code);
    const cbcRequest = findTest(firstTests, 'CBC') as WithId<ServiceRequest>;
    const bmpRequest = findTest(firstTests, 'BMP') as WithId<ServiceRequest>;
    const specimenRef = draft.specimen?.[0] as Reference<Specimen>;

    const saved = await saveLabOrderDraft(
      medplum,
      {
        ...inputs,
        selectedTests: [tsh, cbc],
        testMetadata: { CBC: { priority: 'routine', aoeResponses: aoe(false) }, TSH: { notes: 'Morning' } },
        billingInformation: { billTo: 'patient' },
        orderNotes: 'Not fasting',
        specimenCollectedDateTime: undefined,
      },
      draft
    );

    expect(saved.id).toBe(draft.id);
    // Fields the form does not edit are kept
    expect(saved.encounter).toEqual({ reference: 'Encounter/enc-1' });
    const tests = await medplum.searchResources('ServiceRequest', { 'based-on': `ServiceRequest/${draft.id}` });
    expect(tests.map((test) => test.code?.coding?.[0]?.code).sort()).toEqual(['CBC', 'TSH']);
    expect(findTest(tests, 'CBC')?.id).toBe(cbcRequest.id);
    expect(findTest(tests, 'CBC')?.supportingInfo).toEqual(cbcRequest.supportingInfo);
    // The removed test, its AOE answers and the cleared specimen are deleted
    await expect(medplum.readResource('ServiceRequest', bmpRequest.id)).rejects.toThrow();
    await expect(medplum.readReference(bmpRequest.supportingInfo?.[0] as Reference)).rejects.toThrow();
    await expect(medplum.readReference(specimenRef)).rejects.toThrow();

    const defaults = await getLabOrderDraftDefaults(medplum, saved);
    expect(defaults.tests).toEqual([tsh, cbc]);
    expect(defaults.testMetadata).toEqual({
      CBC: { priority: 'routine', notes: undefined, aoeResponses: expect.objectContaining({ item: aoe(false).item }) },
      TSH: { priority: 'routine', notes: 'Morning', aoeResponses: undefined },
    });
    expect(defaults.billTo).toBe('patient');
    expect(defaults.orderNotes).toBe('Not fasting');
    expect(defaults.specimenCollectedDateTime).toBeUndefined();
  });

  test('requires a test to save a draft', async () => {
    const promise = saveLabOrderDraft(medplum, { ...inputs, selectedTests: [] });

    await expect(promise).rejects.toThrow(LabOrderValidationError);
    await expect(promise).rejects.toMatchObject({ errors: { selectedTests: expect.anything() } });
  });
});
