// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockClient } from '@medplum/mock';
import type { Bundle, DocumentReference } from '@medplum/fhirtypes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './ai-textract';

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { chat: { completions: { create: mockCreate } } };
  }),
}));

const MOCK_CONTENT_LOCATION = 'https://api.medplum.com/fhir/R4/job/textract-job-1/status';

const MOCK_COMPREHEND_MEDIA_REF = 'Media/comprehend-media-1';

/**
 * Returns a fetch mock that simulates a successful async textract call.
 * @param textractResponse - Textract response payload to return from the mocked AsyncJob.
 * @returns Mocked fetch implementation.
 */
function makeTextractFetch(textractResponse = SAMPLE_TEXTRACT_RESPONSE): ReturnType<typeof vi.fn> {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 202,
      headers: { get: (h: string) => (h === 'content-location' ? MOCK_CONTENT_LOCATION : null) },
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        resourceType: 'AsyncJob',
        status: 'completed',
        output: {
          parameter: [
            { name: 'responseBody', valueString: JSON.stringify(textractResponse) },
            { name: 'comprehendMediaRef', valueString: MOCK_COMPREHEND_MEDIA_REF },
          ],
        },
      }),
    });
}

const SAMPLE_TEXTRACT_RESPONSE = {
  Blocks: [
    { BlockType: 'LINE', Text: 'Frodo Baggins' },
    { BlockType: 'LINE', Text: 'DOB: 1990-01-01' },
    { BlockType: 'LINE', Text: 'Hemoglobin: 14.2 g/dL' },
    { BlockType: 'LINE', Text: 'WBC: 6.5 K/uL' },
    { BlockType: 'LINE', Text: 'Result Date: 2026-01-14' },
    { BlockType: 'LINE', Text: 'Ordering Physician: Jay W Marks, MD' },
    { BlockType: 'LINE', Text: 'Lab: HGDX LabCorp' },
  ],
};

const KNOWN_GOOD_EXTRACTED_TEXT = `Frodo Baggins
DOB: 1990-01-01
Hemoglobin: 14.2 g/dL
WBC: 6.5 K/uL
Result Date: 2026-01-14
Ordering Physician: Jay W Marks, MD
Lab: HGDX LabCorp`;

const KNOWN_GOOD_FINAL_BUNDLE: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: 'patient-abc',
        name: [{ family: 'Baggins', given: ['Frodo'] }],
        birthDate: '1990-01-01',
        gender: 'unknown',
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        id: 'obs-hemoglobin',
        status: 'final',
        code: { text: 'Hemoglobin' },
        subject: { reference: 'Patient/patient-abc', display: 'Frodo Baggins' },
        effectiveDateTime: '2026-01-14T00:00:00Z',
        valueQuantity: { value: 14.2, unit: 'g/dL', system: 'http://unitsofmeasure.org', code: 'g/dL' },
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        id: 'obs-wbc',
        status: 'final',
        code: { text: 'WBC' },
        subject: { reference: 'Patient/patient-abc', display: 'Frodo Baggins' },
        effectiveDateTime: '2026-01-14T00:00:00Z',
        valueQuantity: { value: 6.5, unit: 'K/uL', system: 'http://unitsofmeasure.org', code: '10*3/uL' },
      },
    },
    {
      resource: {
        resourceType: 'Organization',
        id: 'org-labcorp',
        name: 'HGDX LabCorp',
      },
    },
    {
      resource: {
        resourceType: 'DiagnosticReport',
        id: 'dr-cbc',
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] }],
        code: {
          coding: [{ system: 'http://loinc.org', code: '11502-2', display: 'Laboratory report' }],
          text: 'HGDX LabCorp',
        },
        subject: { reference: 'Patient/patient-abc', display: 'Frodo Baggins' },
        performer: [{ reference: 'Organization/org-labcorp', display: 'HGDX LabCorp' }],
        effectiveDateTime: '2026-01-14T00:00:00Z',
        issued: '2026-01-14T00:00:00Z',
        result: [
          { reference: 'Observation/obs-hemoglobin', display: 'Hemoglobin' },
          { reference: 'Observation/obs-wbc', display: 'WBC' },
        ],
        presentedForm: [{ contentType: 'application/pdf', url: 'Binary/bin1', title: 'sample-lab-report.pdf' }],
      },
    },
  ],
};

const SAMPLE_DOC_REF_TYPE = { coding: [{ system: 'http://loinc.org', code: '11502-2', display: 'Laboratory report' }] };
const SAMPLE_DOC_REF_CATEGORY = [
  {
    coding: [
      {
        system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category',
        code: 'clinical-note',
        display: 'Clinical Note',
      },
    ],
  },
];

const SAMPLE_BUNDLE: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:patient-1',
      resource: {
        resourceType: 'Patient',
        meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
        identifier: [{ system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/Patient/0' }],
        name: [{ family: 'Baggins', given: ['Frodo'] }],
        birthDate: '1990-01-01',
        gender: 'unknown',
      },
      request: {
        method: 'PUT',
        url: 'Patient?identifier=urn:medplum:document-import|DocumentReference/doc1/Patient/0',
      },
    },
    {
      fullUrl: 'urn:uuid:obs-1',
      resource: {
        resourceType: 'Observation',
        meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab'] },
        identifier: [{ system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/Observation/0' }],
        status: 'final',
        category: [
          {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }],
          },
        ],
        code: { text: 'Hemoglobin' },
        subject: { reference: 'urn:uuid:patient-1' },
        effectiveDateTime: '2026-01-14',
        valueQuantity: { value: 14.2, unit: 'g/dL', system: 'http://unitsofmeasure.org', code: 'g/dL' },
      },
      request: {
        method: 'PUT',
        url: 'Observation?identifier=urn:medplum:document-import|DocumentReference/doc1/Observation/0',
      },
    },
    {
      fullUrl: 'urn:uuid:docref-1',
      resource: {
        resourceType: 'DocumentReference',
        meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference'] },
        status: 'current',
        type: SAMPLE_DOC_REF_TYPE,
        category: SAMPLE_DOC_REF_CATEGORY,
        subject: { reference: 'urn:uuid:patient-1' },
        identifier: [{ system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/DocumentReference/0' }],
        content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/bin1' } }],
      },
      request: {
        method: 'PUT',
        url: 'DocumentReference?identifier=urn:medplum:document-import|DocumentReference/doc1/DocumentReference/0',
      },
    },
  ],
};

const SUBMIT_BUNDLE_RESPONSE = {
  choices: [
    {
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call1',
            type: 'function',
            function: { name: 'submit_bundle', arguments: JSON.stringify({ bundle: SAMPLE_BUNDLE }) },
          },
        ],
      },
    },
  ],
};

describe('ai-textract handler', () => {
  let medplum: MockClient;
  let mockDocRef: DocumentReference;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    medplum = new MockClient();
    mockDocRef = {
      resourceType: 'DocumentReference',
      id: 'doc1',
      status: 'current',
      content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/bin1' } }],
    };

    vi.stubGlobal('fetch', makeTextractFetch());
    vi.spyOn(medplum, 'post').mockResolvedValue({}); // for $refresh-reference-display
    vi.spyOn(medplum, 'createBinary').mockResolvedValue({
      resourceType: 'Binary',
      id: 'bin-text-1',
      contentType: 'text/plain',
    } as any);
    vi.spyOn(medplum, 'download').mockResolvedValue(new Blob(['cached extracted text'], { type: 'text/plain' }));
    vi.spyOn(medplum, 'patchResource').mockResolvedValue({
      resourceType: 'DocumentReference',
      id: 'doc1',
      status: 'current',
      content: [],
    });
    vi.spyOn(medplum, 'createResource').mockImplementation((async (resource: any) => ({
      ...resource,
      id: resource.resourceType === 'Organization' ? 'org-created-abc' : 'resource-created-abc',
    })) as any);
    vi.spyOn(medplum, 'executeBatch').mockImplementation(async (bundle: Bundle) => {
      const locationByType: Record<string, string> = {
        Patient: 'Patient/patient-abc/_history/1',
        Observation: 'Observation/obs-abc/_history/1',
        DocumentReference: 'DocumentReference/docref-abc/_history/1',
        DiagnosticReport: 'DiagnosticReport/dr-abc/_history/1',
        Coverage: 'Coverage/coverage-abc/_history/1',
        Organization: 'Organization/org-abc/_history/1',
      };
      return {
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: (bundle.entry ?? []).map((entry) => ({
          response: {
            status: '201',
            location:
              locationByType[entry.resource?.resourceType ?? ''] ?? `${entry.resource?.resourceType}/test/_history/1`,
          },
        })),
      };
    });
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeEvent(secrets: Record<string, any> = {}): any {
    return { input: mockDocRef, secrets, contentType: 'application/fhir+json' } as any;
  }

  function getSubmittedBundle(callIndex = -1): Bundle {
    const calls = (medplum.executeBatch as ReturnType<typeof vi.fn>).mock.calls;
    const index = callIndex < 0 ? calls.length + callIndex : callIndex;
    return calls[index][0] as Bundle;
  }

  it('includes known-good sample text and final reference structure stubs', () => {
    expect(KNOWN_GOOD_EXTRACTED_TEXT).toContain('Hemoglobin: 14.2 g/dL');
    expect(KNOWN_GOOD_EXTRACTED_TEXT).toContain('Ordering Physician: Jay W Marks, MD');

    const resources = KNOWN_GOOD_FINAL_BUNDLE.entry?.map((entry) => entry.resource as any) ?? [];
    const patient = resources.find((resource) => resource.resourceType === 'Patient');
    const organization = resources.find((resource) => resource.resourceType === 'Organization');
    const observations = resources.filter((resource) => resource.resourceType === 'Observation');
    const report = resources.find((resource) => resource.resourceType === 'DiagnosticReport');
    const observationRefs = new Set(observations.map((observation) => `Observation/${observation.id}`));

    expect(patient?.id).toBe('patient-abc');
    expect(organization?.id).toBe('org-labcorp');
    for (const observation of observations) {
      expect(observation.subject).toEqual({ reference: 'Patient/patient-abc', display: 'Frodo Baggins' });
    }
    expect(report?.subject).toEqual({ reference: 'Patient/patient-abc', display: 'Frodo Baggins' });
    expect(report?.performer).toEqual([{ reference: 'Organization/org-labcorp', display: 'HGDX LabCorp' }]);
    expect(report?.result).toEqual([
      { reference: 'Observation/obs-hemoglobin', display: 'Hemoglobin' },
      { reference: 'Observation/obs-wbc', display: 'WBC' },
    ]);
    for (const result of report?.result ?? []) {
      expect(observationRefs.has(result.reference)).toBe(true);
    }
    expect(JSON.stringify(KNOWN_GOOD_FINAL_BUNDLE)).not.toContain('urn:uuid:');
  });

  // ── Error guard tests ──────────────────────────────────────────────────────

  it('throws if OPENAI_API_KEY secret is missing', async () => {
    await expect(handler(medplum, makeEvent({}))).rejects.toThrow('Missing secret: OPENAI_API_KEY');
  });

  it('throws if input has no id', async () => {
    const { id: _, ...docRefWithoutId } = mockDocRef;
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await expect(
      handler(medplum, {
        input: docRefWithoutId,
        secrets: { OPENAI_API_KEY: { valueString: 'test-key' } },
        contentType: 'application/fhir+json',
      } as any)
    ).rejects.toThrow('Input must be a Media or DocumentReference resource with an id');
  });

  it('throws if no text is extracted from the document', async () => {
    vi.stubGlobal('fetch', makeTextractFetch({ Blocks: [] }));
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await expect(handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }))).rejects.toThrow(
      'No text extracted from document'
    );
  });

  it('throws if AI does not call submit_bundle', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'done', tool_calls: undefined } }],
    });
    await expect(handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }))).rejects.toThrow(
      'AI did not submit a FHIR bundle'
    );
  });

  // ── Async textract polling tests ───────────────────────────────────────────

  it('calls $aws-textract with Prefer: respond-async header', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const fetchMock = vi.mocked(global.fetch as ReturnType<typeof vi.fn>);
    const [, initOptions] = fetchMock.mock.calls[0];
    expect((initOptions as RequestInit).headers).toMatchObject({ Prefer: 'respond-async' });
  });

  it('reuses existing extracted text instead of running Textract again', async () => {
    mockDocRef.content?.push({
      attachment: {
        contentType: 'text/plain',
        url: 'Binary/extracted-text',
        title: 'Extracted Text (Textract)',
      },
    });
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    expect(medplum.download).toHaveBeenCalledWith('Binary/extracted-text');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(medplum.executeBatch).toHaveBeenCalledTimes(2);
  });

  it('uses OPENAI_MODEL secret when provided', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(
      medplum,
      makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' }, OPENAI_MODEL: { valueString: 'gpt-4.1' } })
    );
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4.1' }));
  });

  it('polls the content-location URL to retrieve the textract result', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const fetchMock = vi.mocked(global.fetch as ReturnType<typeof vi.fn>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(MOCK_CONTENT_LOCATION);
  });

  it('throws when $aws-textract AsyncJob reports an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 202,
          headers: { get: (h: string) => (h === 'content-location' ? MOCK_CONTENT_LOCATION : null) },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ resourceType: 'AsyncJob', status: 'error', output: {} }),
        })
    );
    await expect(handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }))).rejects.toThrow(
      '$aws-textract AsyncJob failed'
    );
  });

  // ── Happy-path and output tests ────────────────────────────────────────────

  it('returns a Bundle when AI submits one', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    const result = await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    expect(result.resourceType).toBe('Bundle');
    expect(medplum.executeBatch).toHaveBeenCalledTimes(2);
  });

  it('bundle entries include US Core profile URLs', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const patientBundle = getSubmittedBundle(0);
    const mainBundle = getSubmittedBundle();
    const patient = patientBundle.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource;
    const obs = mainBundle.entry?.find((e) => e.resource?.resourceType === 'Observation')?.resource;
    expect(patient?.meta?.profile).toContain('http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient');
    expect(obs?.meta?.profile).toContain('http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab');
  });

  it('uses conditional PUT for all bundle entries', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    for (const [bundle] of (medplum.executeBatch as ReturnType<typeof vi.fn>).mock.calls as [Bundle][]) {
      for (const entry of bundle.entry ?? []) {
        expect(entry.request?.method).toBe('PUT');
        expect(entry.request?.url).toMatch(/\?identifier=/);
      }
    }
  });

  it('links the source DocumentReference to the extracted Patient via subject', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const calls = (medplum.patchResource as ReturnType<typeof vi.fn>).mock.calls;
    const subjectCall = calls.find(([, , ops]: any[]) => (ops as any[]).some((op) => op.path === '/subject'));
    expect(subjectCall).toBeDefined();
    if (!subjectCall) {
      throw new Error('Expected subject patch call');
    }
    expect(subjectCall[2]).toContainEqual(
      expect.objectContaining({
        op: 'add',
        path: '/subject',
        value: expect.objectContaining({ reference: 'Patient/patient-abc' }),
      })
    );
  });

  it('removes dangling DiagnosticReport.result references that have no matching bundle fullUrl', async () => {
    const bundleWithDanglingRef = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: {
                  name: 'submit_bundle',
                  arguments: JSON.stringify({
                    bundle: {
                      resourceType: 'Bundle',
                      type: 'transaction',
                      entry: [
                        {
                          fullUrl: 'urn:uuid:patient-1',
                          resource: {
                            resourceType: 'Patient',
                            meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
                            identifier: [{ system: 'urn:medplum:document-import:patient', value: 'doe.john.unknown' }],
                            name: [{ family: 'Doe', given: ['John'] }],
                            gender: 'unknown',
                          },
                          request: {
                            method: 'PUT',
                            url: 'Patient?identifier=urn:medplum:document-import:patient|doe.john.unknown',
                          },
                        },
                        {
                          fullUrl: 'urn:uuid:obs-hemoglobin',
                          resource: {
                            resourceType: 'Observation',
                            meta: {
                              profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab'],
                            },
                            identifier: [
                              { system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/Observation/0' },
                            ],
                            status: 'final',
                            code: { text: 'Hemoglobin' },
                            subject: { reference: 'urn:uuid:patient-1' },
                          },
                          request: {
                            method: 'PUT',
                            url: 'Observation?identifier=urn:medplum:document-import|DocumentReference/doc1/Observation/0',
                          },
                        },
                        {
                          fullUrl: 'urn:uuid:dr-1',
                          resource: {
                            resourceType: 'DiagnosticReport',
                            meta: {
                              profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab'],
                            },
                            identifier: [
                              {
                                system: 'urn:medplum:document-import',
                                value: 'DocumentReference/doc1/DiagnosticReport/0',
                              },
                            ],
                            status: 'final',
                            code: { text: 'CBC' },
                            subject: { reference: 'urn:uuid:patient-1' },
                            result: [
                              { reference: 'urn:uuid:obs-hemoglobin', display: 'Hemoglobin' }, // valid — fullUrl exists
                              { reference: 'urn:uuid:observation-wbc', display: 'WBC' }, // dangling — no matching fullUrl
                            ],
                          },
                          request: {
                            method: 'PUT',
                            url: 'DiagnosticReport?identifier=urn:medplum:document-import|DocumentReference/doc1/DiagnosticReport/0',
                          },
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    };
    mockCreate.mockResolvedValue(bundleWithDanglingRef);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const submittedBundle = getSubmittedBundle();
    const dr = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport')?.resource as any;
    expect(dr?.result).toBeUndefined();
    const reportPatch = (medplum.patchResource as ReturnType<typeof vi.fn>).mock.calls.find(
      ([resourceType, id]: any[]) => resourceType === 'DiagnosticReport' && id === 'dr-abc'
    );
    expect(reportPatch?.[2]).toContainEqual(
      expect.objectContaining({
        op: 'add',
        path: '/result',
        value: [{ reference: 'Observation/obs-abc', display: 'Hemoglobin' }],
      })
    );
  });

  it('patches type and category from AI DocumentReference onto the source DocumentReference', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const calls = (medplum.patchResource as ReturnType<typeof vi.fn>).mock.calls;
    const typeCall = calls.find(([, , ops]: any[]) => (ops as any[]).some((op) => op.path === '/type'));
    expect(typeCall).toBeDefined();
    if (!typeCall) {
      throw new Error('Expected type patch call');
    }
    expect(typeCall[2]).toContainEqual(
      expect.objectContaining({ op: 'add', path: '/type', value: SAMPLE_DOC_REF_TYPE })
    );
    expect(typeCall[2]).toContainEqual(
      expect.objectContaining({ op: 'add', path: '/category', value: SAMPLE_DOC_REF_CATEGORY })
    );
  });

  it('normalizes live DiagnosticReport and Observation values before submission', async () => {
    const bundle = structuredClone(SAMPLE_BUNDLE) as Bundle;
    const observation = bundle.entry?.find((e) => e.resource?.resourceType === 'Observation')?.resource as any;
    observation.valueQuantity.unit = null;
    observation.valueQuantity.system = null;
    observation.valueQuantity.code = null;
    bundle.entry?.push({
      fullUrl: 'urn:uuid:organization-1',
      resource: {
        resourceType: 'Organization',
        active: true,
        name: 'HGDX LabCorp',
      },
      request: {
        method: 'PUT',
        url: 'Organization?identifier=urn:medplum:document-import|DocumentReference/doc1/Organization/0',
      },
    });
    bundle.entry?.push({
      fullUrl: 'urn:uuid:dr-1',
      resource: {
        resourceType: 'DiagnosticReport',
        meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab'] },
        identifier: [{ system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/DiagnosticReport/0' }],
        status: 'final',
        code: { text: 'Lab report' },
        subject: { reference: 'urn:uuid:patient-1' },
        issued: '2018-07-05',
        performer: [{ reference: 'urn:uuid:organization-1', display: 'HGDX LabCorp' }],
        result: [{ reference: 'urn:uuid:obs-1', display: 'Hemoglobin' }],
      },
      request: {
        method: 'PUT',
        url: 'DiagnosticReport?identifier=urn:medplum:document-import|DocumentReference/doc1/DiagnosticReport/0',
      },
    });
    mockCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: { name: 'submit_bundle', arguments: JSON.stringify({ bundle }) },
              },
            ],
          },
        },
      ],
    });

    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));

    const submittedBundle = getSubmittedBundle();
    const submittedObservation = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'Observation')
      ?.resource as any;
    expect(submittedObservation.valueQuantity).toEqual({ value: 14.2 });
    const submittedReport = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport')
      ?.resource as any;
    expect(submittedReport.issued).toBe('2018-07-05T00:00:00Z');
    expect(submittedReport.performer).toBeUndefined();
    const performerPatch = (medplum.patchResource as ReturnType<typeof vi.fn>).mock.calls.find(
      ([resourceType, id, ops]: any[]) =>
        resourceType === 'DiagnosticReport' && id === 'dr-abc' && (ops as any[]).some((op) => op.path === '/performer')
    );
    expect(performerPatch?.[2]).toContainEqual(
      expect.objectContaining({
        op: 'add',
        path: '/performer',
        value: [{ reference: 'Organization/org-abc', display: 'HGDX LabCorp' }],
      })
    );
  });

  it('resolves slug Organization performers and stable Binary presentedForm URLs before submission', async () => {
    const bundle = structuredClone(SAMPLE_BUNDLE) as Bundle;
    bundle.entry = bundle.entry?.filter((entry) => entry.resource?.resourceType !== 'DocumentReference');
    bundle.entry?.push({
      fullUrl: 'urn:uuid:dr-1',
      resource: {
        resourceType: 'DiagnosticReport',
        meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab'] },
        identifier: [{ system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/DiagnosticReport/0' }],
        status: 'final',
        code: { text: 'Lab report' },
        subject: { reference: 'urn:uuid:patient-1' },
        issued: '2018-07-05T11:00:00Z',
        performer: [{ reference: 'Organization/HGDX-LabCorp', display: 'HGDX LabCorp' }],
        presentedForm: [
          {
            contentType: 'application/pdf',
            url: 'https://storage.medplum.com/binary/6f2e0107-b116-42b4-ac01-bee0d5fa6f0e/7194809b-2753-4afc-8a88-46c5d46e7c40?Expires=1779666254',
            title: 'Clinical PDF Report.pdf',
          },
        ],
        result: [{ reference: 'urn:uuid:obs-1', display: 'Hemoglobin' }],
      },
      request: {
        method: 'PUT',
        url: 'DiagnosticReport?identifier=urn:medplum:document-import|DocumentReference/doc1/DiagnosticReport/0',
      },
    });
    vi.spyOn(medplum, 'searchResources').mockImplementation((async (resourceType: string, params: any) => {
      if (resourceType === 'Organization' && String(params).includes('HGDX+LabCorp')) {
        return [{ resourceType: 'Organization', id: 'org-existing-abc', name: 'HGDX LabCorp' }];
      }
      return [];
    }) as any);
    mockCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: { name: 'submit_bundle', arguments: JSON.stringify({ bundle }) },
              },
            ],
          },
        },
      ],
    });

    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));

    const submittedBundle = getSubmittedBundle();
    const submittedReport = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport')
      ?.resource as any;
    expect(submittedReport.performer).toEqual([
      { reference: 'Organization/org-existing-abc', display: 'HGDX LabCorp' },
    ]);
    expect(submittedReport.presentedForm?.[0]?.url).toBe('Binary/6f2e0107-b116-42b4-ac01-bee0d5fa6f0e');
  });

  it('injects gender: unknown on Patient resources missing gender before submission', async () => {
    const bundleNoGender = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: {
                  name: 'submit_bundle',
                  arguments: JSON.stringify({
                    bundle: {
                      resourceType: 'Bundle',
                      type: 'transaction',
                      entry: [
                        {
                          fullUrl: 'urn:uuid:patient-1',
                          resource: {
                            resourceType: 'Patient',
                            identifier: [
                              { system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/Patient/0' },
                            ],
                            name: [{ family: 'Doe', given: ['Jane'] }],
                            birthDate: '1980-05-01',
                            // gender intentionally omitted
                          },
                          request: {
                            method: 'PUT',
                            url: 'Patient?identifier=urn:medplum:document-import|DocumentReference/doc1/Patient/0',
                          },
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    };
    mockCreate.mockResolvedValue(bundleNoGender);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const submittedBundle = getSubmittedBundle(0);
    const patient = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource as any;
    expect(patient?.gender).toBe('unknown');
  });

  it('links the Comprehend Media resource to the DocumentReference as a content entry', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    expect(medplum.patchResource).toHaveBeenCalledWith(
      'DocumentReference',
      'doc1',
      expect.arrayContaining([
        expect.objectContaining({
          op: 'add',
          path: '/content/-',
          value: expect.objectContaining({
            attachment: expect.objectContaining({ contentType: 'application/json', url: MOCK_COMPREHEND_MEDIA_REF }),
          }),
        }),
      ])
    );
  });

  it('stores extracted text as a plain-text content entry on the DocumentReference', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    expect(medplum.patchResource).toHaveBeenCalledWith(
      'DocumentReference',
      'doc1',
      expect.arrayContaining([
        expect.objectContaining({
          op: 'add',
          path: '/content/-',
          value: expect.objectContaining({
            attachment: expect.objectContaining({ contentType: 'text/plain' }),
          }),
        }),
      ])
    );
  });

  it('does not add comprehend content entry when AsyncJob has no comprehendMediaRef', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 202,
          headers: { get: (h: string) => (h === 'content-location' ? MOCK_CONTENT_LOCATION : null) },
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            resourceType: 'AsyncJob',
            status: 'completed',
            // comprehendMediaRef intentionally absent
            output: { parameter: [{ name: 'responseBody', valueString: JSON.stringify(SAMPLE_TEXTRACT_RESPONSE) }] },
          }),
        })
    );
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const contentPatchCall = (medplum.patchResource as ReturnType<typeof vi.fn>).mock.calls.find(([, , ops]: any[]) =>
      (ops as any[]).some((op) => op.path === '/content/-')
    );
    expect(contentPatchCall).toBeDefined();
    if (!contentPatchCall) {
      throw new Error('Expected content patch call');
    }
    const ops = contentPatchCall[2] as any[];
    const comprehendOp = ops.find((op) => op.value?.attachment?.contentType === 'application/json');
    expect(comprehendOp).toBeUndefined();
  });

  it('falls back to synchronous textract response when server returns 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => SAMPLE_TEXTRACT_RESPONSE,
      })
    );
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    const result = await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    expect(result.resourceType).toBe('Bundle');
    expect(medplum.executeBatch).toHaveBeenCalledTimes(2);
  });

  it('skips bundle entries that fail $validate and does not include them in executeBatch', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    // Make $validate return an error for Observation entries, success for everything else
    vi.spyOn(medplum, 'post').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('Observation/$validate')) {
        return {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', details: { text: 'Observation.code is required' } }],
        };
      }
      return {}; // success for all other posts ($validate and $refresh-reference-display)
    });
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const submittedBundle = getSubmittedBundle();
    const hasObservation = submittedBundle.entry?.some((e) => e.resource?.resourceType === 'Observation');
    expect(hasObservation).toBe(false);
    // Patient is resolved in a separate preflight transaction; generated DocumentReferences are not submitted.
    expect(getSubmittedBundle(0).entry?.some((e) => e.resource?.resourceType === 'Patient')).toBe(true);
    expect(submittedBundle.entry?.some((e) => e.resource?.resourceType === 'DocumentReference')).toBe(false);
  });

  it('removes DiagnosticReport.result refs to entries removed by validation', async () => {
    // Bundle with a DiagnosticReport that references an Observation that will fail validation
    const drBundle = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: {
                  name: 'submit_bundle',
                  arguments: JSON.stringify({
                    bundle: {
                      resourceType: 'Bundle',
                      type: 'transaction',
                      entry: [
                        {
                          fullUrl: 'urn:uuid:patient-1',
                          resource: {
                            resourceType: 'Patient',
                            meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
                            identifier: [{ system: 'urn:medplum:document-import:patient', value: 'doe.john.unknown' }],
                            name: [{ family: 'Doe', given: ['John'] }],
                            gender: 'unknown',
                          },
                          request: {
                            method: 'PUT',
                            url: 'Patient?identifier=urn:medplum:document-import:patient|doe.john.unknown',
                          },
                        },
                        {
                          fullUrl: 'urn:uuid:obs-bad',
                          resource: {
                            resourceType: 'Observation',
                            // intentionally invalid — no status, no code
                            identifier: [{ system: 'urn:medplum:document-import', value: 'doc1/Observation/0' }],
                          },
                          request: {
                            method: 'PUT',
                            url: 'Observation?identifier=urn:medplum:document-import|doc1/Observation/0',
                          },
                        },
                        {
                          fullUrl: 'urn:uuid:dr-1',
                          resource: {
                            resourceType: 'DiagnosticReport',
                            meta: {
                              profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab'],
                            },
                            identifier: [{ system: 'urn:medplum:document-import', value: 'doc1/DiagnosticReport/0' }],
                            status: 'final',
                            code: { text: 'CBC' },
                            subject: { reference: 'urn:uuid:patient-1' },
                            result: [{ reference: 'urn:uuid:obs-bad', display: 'Bad Observation' }],
                          },
                          request: {
                            method: 'PUT',
                            url: 'DiagnosticReport?identifier=urn:medplum:document-import|doc1/DiagnosticReport/0',
                          },
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    };
    mockCreate.mockResolvedValue(drBundle);
    vi.spyOn(medplum, 'post').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('Observation/$validate')) {
        return {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', details: { text: 'Observation.status required' } }],
        };
      }
      return {};
    });
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const submittedBundle = getSubmittedBundle();
    const dr = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport')?.resource as any;
    // The bad Observation was removed, so DiagnosticReport.result should be empty
    expect(dr?.result ?? []).toHaveLength(0);
  });

  it('normalizes Coverage identifier from object to array before submission', async () => {
    const coverageBundle = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: {
                  name: 'submit_bundle',
                  arguments: JSON.stringify({
                    bundle: {
                      resourceType: 'Bundle',
                      type: 'transaction',
                      entry: [
                        {
                          fullUrl: 'urn:uuid:patient-1',
                          resource: {
                            resourceType: 'Patient',
                            meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
                            identifier: [{ system: 'urn:medplum:document-import:patient', value: 'doe.john.unknown' }],
                            name: [{ family: 'Doe', given: ['John'] }],
                            gender: 'unknown',
                          },
                          request: {
                            method: 'PUT',
                            url: 'Patient?identifier=urn:medplum:document-import:patient|doe.john.unknown',
                          },
                        },
                        {
                          fullUrl: 'urn:uuid:coverage-1',
                          resource: {
                            resourceType: 'Coverage',
                            // identifier as object (not array) — AI output bug
                            identifier: {
                              system: 'urn:medplum:document-import',
                              value: 'DocumentReference/doc1/Coverage/0',
                            },
                            status: 'active',
                            payor: [{ display: 'Blue Cross Blue Shield' }],
                            beneficiary: { reference: 'urn:uuid:patient-1', display: 'John Doe' },
                          },
                          request: {
                            method: 'PUT',
                            url: 'Coverage?identifier=urn:medplum:document-import|DocumentReference/doc1/Coverage/0',
                          },
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    };
    mockCreate.mockResolvedValue(coverageBundle);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const submittedBundle = getSubmittedBundle();
    const coverage = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'Coverage')?.resource as any;
    expect(Array.isArray(coverage.identifier)).toBe(true);
    expect(coverage.identifier[0]).toMatchObject({
      system: 'urn:medplum:document-import',
      value: 'DocumentReference/doc1/Coverage/0',
    });
  });

  it('strips urn:uuid beneficiary and subscriber from Coverage before submission', async () => {
    const coverageBundle = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: {
                  name: 'submit_bundle',
                  arguments: JSON.stringify({
                    bundle: {
                      resourceType: 'Bundle',
                      type: 'transaction',
                      entry: [
                        {
                          fullUrl: 'urn:uuid:patient-1',
                          resource: {
                            resourceType: 'Patient',
                            meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
                            identifier: [{ system: 'urn:medplum:document-import:patient', value: 'doe.john.unknown' }],
                            name: [{ family: 'Doe', given: ['John'] }],
                            gender: 'unknown',
                          },
                          request: {
                            method: 'PUT',
                            url: 'Patient?identifier=urn:medplum:document-import:patient|doe.john.unknown',
                          },
                        },
                        {
                          fullUrl: 'urn:uuid:coverage-1',
                          resource: {
                            resourceType: 'Coverage',
                            identifier: [
                              { system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/Coverage/0' },
                            ],
                            status: 'active',
                            payor: [{ display: 'Blue Cross Blue Shield' }],
                            beneficiary: { reference: 'urn:uuid:patient-1', display: 'John Doe' },
                            subscriber: { reference: 'urn:uuid:patient-1', display: 'John Doe' },
                          },
                          request: {
                            method: 'PUT',
                            url: 'Coverage?identifier=urn:medplum:document-import|DocumentReference/doc1/Coverage/0',
                          },
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    };
    mockCreate.mockResolvedValue(coverageBundle);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const submittedBundle = getSubmittedBundle();
    const coverage = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'Coverage')?.resource as any;
    expect(coverage.beneficiary).toBeUndefined();
    expect(coverage.subscriber).toBeUndefined();
  });

  it('patches Coverage beneficiary and subscriber with resolved Patient reference after batch', async () => {
    const coverageBundle = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: {
                  name: 'submit_bundle',
                  arguments: JSON.stringify({
                    bundle: {
                      resourceType: 'Bundle',
                      type: 'transaction',
                      entry: [
                        {
                          fullUrl: 'urn:uuid:patient-1',
                          resource: {
                            resourceType: 'Patient',
                            meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
                            identifier: [{ system: 'urn:medplum:document-import:patient', value: 'doe.john.unknown' }],
                            name: [{ family: 'Doe', given: ['John'] }],
                            gender: 'unknown',
                          },
                          request: {
                            method: 'PUT',
                            url: 'Patient?identifier=urn:medplum:document-import:patient|doe.john.unknown',
                          },
                        },
                        {
                          fullUrl: 'urn:uuid:coverage-1',
                          resource: {
                            resourceType: 'Coverage',
                            identifier: [
                              { system: 'urn:medplum:document-import', value: 'DocumentReference/doc1/Coverage/0' },
                            ],
                            status: 'active',
                            payor: [{ display: 'Blue Cross Blue Shield' }],
                            beneficiary: { reference: 'urn:uuid:patient-1', display: 'John Doe' },
                            subscriber: { reference: 'urn:uuid:patient-1', display: 'John Doe' },
                          },
                          request: {
                            method: 'PUT',
                            url: 'Coverage?identifier=urn:medplum:document-import|DocumentReference/doc1/Coverage/0',
                          },
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    };
    mockCreate.mockResolvedValue(coverageBundle);
    vi.spyOn(medplum, 'executeBatch').mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201', location: 'Patient/patient-abc/_history/1' } },
        { response: { status: '201', location: 'Coverage/coverage-abc/_history/1' } },
      ],
    });
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const calls = (medplum.patchResource as ReturnType<typeof vi.fn>).mock.calls;
    const coveragePatch = calls.find(
      ([resourceType, id]: any[]) => resourceType === 'Coverage' && id === 'coverage-abc'
    );
    expect(coveragePatch).toBeDefined();
    if (!coveragePatch) {
      throw new Error('Expected coverage patch call');
    }
    expect(coveragePatch[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: 'add',
          path: '/beneficiary',
          value: expect.objectContaining({ reference: 'Patient/patient-abc' }),
        }),
        expect.objectContaining({
          op: 'add',
          path: '/subscriber',
          value: expect.objectContaining({ reference: 'Patient/patient-abc' }),
        }),
      ])
    );
  });

  it('uses AI-generated DocumentReference only to patch the source DocumentReference', async () => {
    const docRefSubjectBundle = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: {
                  name: 'submit_bundle',
                  arguments: JSON.stringify({
                    bundle: {
                      resourceType: 'Bundle',
                      type: 'transaction',
                      entry: [
                        {
                          fullUrl: 'urn:uuid:patient-1',
                          resource: {
                            resourceType: 'Patient',
                            meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
                            identifier: [
                              { system: 'urn:medplum:document-import:patient', value: 'baggins.frodo.1990-01-01' },
                            ],
                            name: [{ family: 'Baggins', given: ['Frodo'] }],
                            birthDate: '1990-01-01',
                            gender: 'unknown',
                          },
                          request: {
                            method: 'PUT',
                            url: 'Patient?identifier=urn:medplum:document-import:patient|baggins.frodo.1990-01-01',
                          },
                        },
                        {
                          fullUrl: 'urn:uuid:docref-ai-1',
                          resource: {
                            resourceType: 'DocumentReference',
                            meta: {
                              profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference'],
                            },
                            status: 'current',
                            type: SAMPLE_DOC_REF_TYPE,
                            category: SAMPLE_DOC_REF_CATEGORY,
                            subject: { reference: 'urn:uuid:patient-1', display: 'Frodo Baggins' },
                            identifier: [
                              {
                                system: 'urn:medplum:document-import',
                                value: 'DocumentReference/doc1/DocumentReference/0',
                              },
                            ],
                            content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/bin1' } }],
                          },
                          request: {
                            method: 'PUT',
                            url: 'DocumentReference?identifier=urn:medplum:document-import|DocumentReference/doc1/DocumentReference/0',
                          },
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    };
    mockCreate.mockResolvedValue(docRefSubjectBundle);
    vi.spyOn(medplum, 'executeBatch').mockResolvedValueOnce({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201', location: 'Patient/patient-abc/_history/1' } },
        { response: { status: '201', location: 'DocumentReference/docref-ai-abc/_history/1' } },
      ],
    });
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));

    const submittedBundle = getSubmittedBundle();
    expect(submittedBundle.entry?.some((e) => e.resource?.resourceType === 'DocumentReference')).toBe(false);
    const sourceDocPatch = (medplum.patchResource as ReturnType<typeof vi.fn>).mock.calls.find(
      ([resourceType, id, ops]: any[]) =>
        resourceType === 'DocumentReference' && id === 'doc1' && (ops as any[]).some((op) => op.path === '/type')
    );
    expect(sourceDocPatch?.[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/subject',
          value: { reference: 'Patient/patient-abc', display: 'Frodo Baggins' },
        }),
        expect.objectContaining({ path: '/type', value: SAMPLE_DOC_REF_TYPE }),
        expect.objectContaining({ path: '/category', value: SAMPLE_DOC_REF_CATEGORY }),
      ])
    );
  });

  it('stable patient identifier passes through to executeBatch unchanged', async () => {
    const stableIdentifierBundle = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: {
                  name: 'submit_bundle',
                  arguments: JSON.stringify({
                    bundle: {
                      resourceType: 'Bundle',
                      type: 'transaction',
                      entry: [
                        {
                          fullUrl: 'urn:uuid:patient-1',
                          resource: {
                            resourceType: 'Patient',
                            meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
                            identifier: [
                              { system: 'urn:medplum:document-import:patient', value: 'baggins.frodo.1990-01-01' },
                            ],
                            name: [{ family: 'Baggins', given: ['Frodo'] }],
                            birthDate: '1990-01-01',
                            gender: 'unknown',
                          },
                          request: {
                            method: 'PUT',
                            url: 'Patient?identifier=urn:medplum:document-import:patient|baggins.frodo.1990-01-01',
                          },
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          },
        },
      ],
    };
    mockCreate.mockResolvedValue(stableIdentifierBundle);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));
    const submittedBundle = getSubmittedBundle(0);
    const patient = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'Patient');
    const patientResource = patient?.resource as any;
    expect(patientResource?.identifier?.[0]).toMatchObject({
      system: 'urn:medplum:document-import:patient',
      value: 'baggins.frodo.1990-01-01',
    });
    expect(patient?.request?.url).toBe(
      'Patient?identifier=urn:medplum:document-import:patient|baggins.frodo.1990-01-01'
    );
  });

  it('uses an existing Patient match instead of creating a duplicate Patient', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    vi.spyOn(medplum, 'searchResources').mockImplementation((async (_resourceType: string, params: any) => {
      if (String(params).includes('identifier=DocumentReference%2Fdoc1%2FPatient%2F0')) {
        return [
          {
            resourceType: 'Patient',
            id: 'existing-patient',
            name: [{ family: 'Baggins', given: ['Frodo'] }],
          },
        ];
      }
      return [];
    }) as any);

    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));

    expect(medplum.executeBatch).toHaveBeenCalledOnce();
    const submittedBundle = getSubmittedBundle();
    expect(submittedBundle.entry?.some((e) => e.resource?.resourceType === 'Patient')).toBe(false);
    const obs = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'Observation')?.resource as any;
    expect(obs.subject).toMatchObject({ reference: 'Patient/existing-patient', display: 'Frodo Baggins' });
  });

  it('replaces local Patient urn references before submitting dependent resources', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));

    const submittedBundle = getSubmittedBundle();
    expect(submittedBundle.entry?.some((e) => e.resource?.resourceType === 'Patient')).toBe(false);
    const serialized = JSON.stringify(submittedBundle);
    expect(serialized).not.toContain('urn:uuid:patient-1');
    expect(serialized).toContain('Patient/patient-abc');
  });

  it('replaces unresolved patient urn references before submission', async () => {
    const bundle = structuredClone(SAMPLE_BUNDLE) as Bundle;
    const observation = bundle.entry?.find((e) => e.resource?.resourceType === 'Observation')?.resource as any;
    observation.subject = { reference: 'urn:uuid:patient-ishmael', display: 'Samuel Test' };
    mockCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: { name: 'submit_bundle', arguments: JSON.stringify({ bundle }) },
              },
            ],
          },
        },
      ],
    });

    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));

    const submittedBundle = getSubmittedBundle();
    const serialized = JSON.stringify(submittedBundle);
    expect(serialized).not.toContain('urn:uuid:patient-ishmael');
    const submittedObservation = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'Observation')
      ?.resource as any;
    expect(submittedObservation.subject).toMatchObject({
      reference: 'Patient/patient-abc',
      display: 'Frodo Baggins',
    });
  });

  it('adds display to Patient references that already use the resolved Patient id', async () => {
    const bundle = structuredClone(SAMPLE_BUNDLE) as Bundle;
    const observation = bundle.entry?.find((e) => e.resource?.resourceType === 'Observation')?.resource as any;
    observation.subject = { reference: 'Patient/patient-abc' };
    const docRef = bundle.entry?.find((e) => e.resource?.resourceType === 'DocumentReference')?.resource as any;
    docRef.subject = { reference: 'Patient/patient-abc' };

    mockCreate.mockResolvedValue({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call1',
                type: 'function',
                function: { name: 'submit_bundle', arguments: JSON.stringify({ bundle }) },
              },
            ],
          },
        },
      ],
    });

    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));

    const submittedBundle = getSubmittedBundle();
    const submittedObservation = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'Observation')
      ?.resource as any;
    expect(submittedObservation.subject).toMatchObject({
      reference: 'Patient/patient-abc',
      display: 'Frodo Baggins',
    });
    expect(submittedBundle.entry?.some((e) => e.resource?.resourceType === 'DocumentReference')).toBe(false);
  });

  it('creates a DiagnosticReport for observation bundles that omitted one', async () => {
    mockCreate.mockResolvedValue(SUBMIT_BUNDLE_RESPONSE);
    await handler(medplum, makeEvent({ OPENAI_API_KEY: { valueString: 'test-key' } }));

    const submittedBundle = getSubmittedBundle();
    const report = submittedBundle.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport')?.resource as any;
    expect(report).toBeDefined();
    expect(report.subject).toMatchObject({ reference: 'Patient/patient-abc', display: 'Frodo Baggins' });
    expect(report.issued).toBe('2026-01-14T00:00:00Z');
    expect(report.basedOn).toBeUndefined();
    expect(report.presentedForm).toContainEqual(
      expect.objectContaining({ contentType: 'application/pdf', url: 'Binary/bin1' })
    );
    expect(report.result).toBeUndefined();
    const reportPatch = (medplum.patchResource as ReturnType<typeof vi.fn>).mock.calls.find(
      ([resourceType, id]: any[]) => resourceType === 'DiagnosticReport' && id === 'dr-abc'
    );
    expect(reportPatch?.[2]).toContainEqual(
      expect.objectContaining({
        op: 'add',
        path: '/result',
        value: [{ reference: 'Observation/obs-abc', display: 'Hemoglobin' }],
      })
    );
  });
});
