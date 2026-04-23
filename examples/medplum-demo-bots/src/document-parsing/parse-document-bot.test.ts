// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import type { Bundle, DocumentReference, Observation, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { NEEDS_CODE_ASSIGNMENT_TAG, SUGGESTED_CODING_EXTENSION_URL } from './code-mapping';
import { handler } from './parse-document-bot';
import type { ParsedLabReport } from './types';

// Mock fetch for Reducto API calls
const mockParsedReport: ParsedLabReport = {
  reportDate: '2024-01-15T00:00:00Z',
  accessionNumber: 'ACC-12345',
  reportStatus: 'final',
  performingLab: {
    name: 'Acme Clinical Labs',
    cliaNumber: '11D0265516',
    npi: '1234567890',
  },
  orderingProvider: {
    name: 'Dr. Jane Smith',
    npi: '9876543210',
  },
  patient: {
    name: 'John Doe',
    dateOfBirth: '1980-05-15',
    mrn: 'MRN-001',
  },
  results: [
    {
      testName: 'Glucose',
      testCode: '2345-7',
      value: '95',
      numericValue: 95,
      unit: 'mg/dL',
      referenceRangeLow: 70,
      referenceRangeHigh: 100,
      referenceRangeText: '70-100',
      interpretation: 'N',
    },
    {
      testName: 'Hemoglobin A1c',
      value: '5.7',
      numericValue: 5.7,
      unit: '%',
      referenceRangeLow: 4.0,
      referenceRangeHigh: 5.6,
      referenceRangeText: '4.0-5.6',
      interpretation: 'H',
    },
    {
      testName: 'TSH',
      value: '<0.01',
      unit: 'mIU/L',
      referenceRangeText: '0.5-4.5',
      interpretation: 'LL',
    },
  ],
};

const originalFetch = globalThis.fetch;

describe('Parse Document Bot', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('Successfully parses document with Reducto and creates preliminary report', async () => {
    const medplum = new MockClient();

    // Mock the Reducto API response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        job_id: 'test-job-123',
        result: [mockParsedReport],
        usage: { credits: 10, pages: 1 },
      }),
    }) as unknown as typeof fetch;

    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    });

    const docRef: DocumentReference = await medplum.createResource({
      resourceType: 'DocumentReference',
      status: 'current',
      subject: { reference: `Patient/${patient.id}` },
      content: [
        {
          attachment: {
            url: 'https://example.com/lab-report.pdf',
            contentType: 'application/pdf',
          },
        },
      ],
    });

    const result = await handler(medplum, {
      bot: { reference: 'Bot/parse-bot' },
      input: docRef,
      contentType: 'application/fhir+json',
      secrets: {
        PARSING_PROVIDER: { valueString: 'reducto' },
        REDUCTO_API_KEY: { valueString: 'test-api-key' },
        AUTO_APPROVE: { valueString: 'false' },
      },
    });

    // Verify DiagnosticReport was created with preliminary status
    expect(result.resourceType).toBe('DiagnosticReport');
    expect(result.status).toBe('preliminary');
    expect(result.subject?.reference).toBe(`Patient/${patient.id}`);

    // Verify contained Observations
    expect(result.contained).toHaveLength(3);
    expect(result.contained![0].resourceType).toBe('Observation');

    // Verify result references point to contained resources
    expect(result.result).toHaveLength(3);
    expect(result.result![0].reference).toBe('#obs-0');
    expect(result.result![1].reference).toBe('#obs-1');
    expect(result.result![2].reference).toBe('#obs-2');

    // Verify presentedForm has the original PDF
    expect(result.presentedForm).toHaveLength(1);
    expect(result.presentedForm![0].contentType).toBe('application/pdf');

    // Verify Provenance was created
    const provenances = await medplum.searchResources('Provenance', {
      target: `DiagnosticReport/${result.id}`,
    });
    expect(provenances.length).toBeGreaterThan(0);
    expect(provenances[0].agent?.[0].who?.reference).toBe('Bot/parse-bot');
    expect(provenances[0].entity?.[0].role).toBe('source');
  });

  test('Auto-approve creates final report', async () => {
    const medplum = new MockClient();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        job_id: 'test-job-456',
        result: [mockParsedReport],
        usage: { credits: 10, pages: 1 },
      }),
    }) as unknown as typeof fetch;

    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    });

    const docRef: DocumentReference = await medplum.createResource({
      resourceType: 'DocumentReference',
      status: 'current',
      subject: { reference: `Patient/${patient.id}` },
      content: [
        {
          attachment: {
            url: 'https://example.com/lab-report.pdf',
            contentType: 'application/pdf',
          },
        },
      ],
    });

    const result = await handler(medplum, {
      bot: { reference: 'Bot/parse-bot' },
      input: docRef,
      contentType: 'application/fhir+json',
      secrets: {
        PARSING_PROVIDER: { valueString: 'reducto' },
        REDUCTO_API_KEY: { valueString: 'test-api-key' },
        AUTO_APPROVE: { valueString: 'true' },
      },
    });

    expect(result.status).toBe('final');
  });

  test('LLM testCode is stored as extension, never applied to code.coding', async () => {
    const medplum = new MockClient();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        job_id: 'test-job-789',
        result: [mockParsedReport],
        usage: { credits: 10, pages: 1 },
      }),
    }) as unknown as typeof fetch;

    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    });

    const docRef: DocumentReference = await medplum.createResource({
      resourceType: 'DocumentReference',
      status: 'current',
      subject: { reference: `Patient/${patient.id}` },
      content: [
        {
          attachment: {
            url: 'https://example.com/lab-report.pdf',
            contentType: 'application/pdf',
          },
        },
      ],
    });

    const result = await handler(medplum, {
      bot: { reference: 'Bot/parse-bot' },
      input: docRef,
      contentType: 'application/fhir+json',
      secrets: {
        PARSING_PROVIDER: { valueString: 'reducto' },
        REDUCTO_API_KEY: { valueString: 'test-api-key' },
        AUTO_APPROVE: { valueString: 'false' },
      },
    });

    // Glucose has testCode='2345-7' from the LLM; it should be stored in the extension,
    // not in code.coding. The code.coding should come from the built-in mapping.
    const glucoseObs = result.contained?.find((r) => (r as Observation).code?.text === 'Glucose') as
      | Observation
      | undefined;
    expect(glucoseObs).toBeDefined();
    const suggestedExt = glucoseObs!.extension?.find((e) => e.url === SUGGESTED_CODING_EXTENSION_URL);
    expect(suggestedExt?.valueCoding?.code).toBe('2345-7');
    // The code.coding should still resolve via built-in mapping
    expect(glucoseObs!.code?.coding?.[0]?.code).toBe('2345-7');
    expect(glucoseObs!.code?.coding?.[0]?.system).toBe('http://loinc.org');

    // No needs-code-assignment tag because glucose is in built-in mapping
    const hasTag = glucoseObs!.meta?.tag?.some(
      (t) => t.system === NEEDS_CODE_ASSIGNMENT_TAG.system && t.code === NEEDS_CODE_ASSIGNMENT_TAG.code
    );
    expect(hasTag).toBeFalsy();
  });

  test('Unmapped tests are tagged needs-code-assignment and override auto-approve', async () => {
    const medplum = new MockClient();

    const reportWithUnmapped: ParsedLabReport = {
      ...mockParsedReport,
      results: [
        {
          testName: 'Glucose',
          value: '95',
          numericValue: 95,
          unit: 'mg/dL',
        },
        {
          testName: 'Some Custom Assay XYZ',
          testCode: '99999-0',
          value: '42',
          numericValue: 42,
          unit: 'ng/mL',
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        job_id: 'test-job-unmapped',
        result: [reportWithUnmapped],
        usage: { credits: 10, pages: 1 },
      }),
    }) as unknown as typeof fetch;

    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    });

    const docRef: DocumentReference = await medplum.createResource({
      resourceType: 'DocumentReference',
      status: 'current',
      subject: { reference: `Patient/${patient.id}` },
      content: [
        {
          attachment: {
            url: 'https://example.com/lab-report.pdf',
            contentType: 'application/pdf',
          },
        },
      ],
    });

    // Even though AUTO_APPROVE=true, the unmapped test should force review mode
    const result = await handler(medplum, {
      bot: { reference: 'Bot/parse-bot' },
      input: docRef,
      contentType: 'application/fhir+json',
      secrets: {
        PARSING_PROVIDER: { valueString: 'reducto' },
        REDUCTO_API_KEY: { valueString: 'test-api-key' },
        AUTO_APPROVE: { valueString: 'true' },
      },
    });

    // Auto-approve overridden because an unmapped test exists
    expect(result.status).toBe('preliminary');

    const customObs = result.contained?.find(
      (r) => (r as Observation).code?.text === 'Some Custom Assay XYZ'
    ) as Observation | undefined;
    expect(customObs).toBeDefined();

    // Unmapped: no coding on code, only text
    expect(customObs!.code?.coding).toBeUndefined();
    expect(customObs!.code?.text).toBe('Some Custom Assay XYZ');

    // Tagged for human code assignment
    const hasTag = customObs!.meta?.tag?.some(
      (t) => t.system === NEEDS_CODE_ASSIGNMENT_TAG.system && t.code === NEEDS_CODE_ASSIGNMENT_TAG.code
    );
    expect(hasTag).toBe(true);

    // LLM's testCode is preserved as extension for reviewer reference
    const suggestedExt = customObs!.extension?.find((e) => e.url === SUGGESTED_CODING_EXTENSION_URL);
    expect(suggestedExt?.valueCoding?.code).toBe('99999-0');

    // Glucose remains mapped via built-in
    const glucoseObs = result.contained?.find((r) => (r as Observation).code?.text === 'Glucose') as
      | Observation
      | undefined;
    expect(glucoseObs?.code?.coding?.[0]?.code).toBe('2345-7');
    const glucoseHasTag = glucoseObs?.meta?.tag?.some(
      (t) => t.system === NEEDS_CODE_ASSIGNMENT_TAG.system && t.code === NEEDS_CODE_ASSIGNMENT_TAG.code
    );
    expect(glucoseHasTag).toBeFalsy();
  });

  test('Throws on missing content attachment', async () => {
    const medplum = new MockClient();

    const docRef: DocumentReference = await medplum.createResource({
      resourceType: 'DocumentReference',
      status: 'current',
      content: [],
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/parse-bot' },
        input: docRef,
        contentType: 'application/fhir+json',
        secrets: {
          PARSING_PROVIDER: { valueString: 'reducto' },
          REDUCTO_API_KEY: { valueString: 'test-api-key' },
        },
      })
    ).rejects.toThrow('DocumentReference has no content attachment URL');
  });

  test('Throws on missing PARSING_PROVIDER secret', async () => {
    const medplum = new MockClient();

    const docRef: DocumentReference = await medplum.createResource({
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { url: 'https://example.com/test.pdf', contentType: 'application/pdf' } }],
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/parse-bot' },
        input: docRef,
        contentType: 'application/fhir+json',
        secrets: {},
      })
    ).rejects.toThrow('PARSING_PROVIDER secret is required');
  });

  test('Throws on unknown provider', async () => {
    const medplum = new MockClient();

    const docRef: DocumentReference = await medplum.createResource({
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { url: 'https://example.com/test.pdf', contentType: 'application/pdf' } }],
    });

    await expect(
      handler(medplum, {
        bot: { reference: 'Bot/parse-bot' },
        input: docRef,
        contentType: 'application/fhir+json',
        secrets: {
          PARSING_PROVIDER: { valueString: 'unknown-provider' },
        },
      })
    ).rejects.toThrow('Unknown parsing provider: unknown-provider');
  });
});
