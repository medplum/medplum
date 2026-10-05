// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OBSERVATION_INTERPRETATION } from '@medplum/core';
import type { BotEvent } from '@medplum/core';
import type { DocumentReference, Observation, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './parse-diagnostic-report';

const contentType = 'application/fhir+json';

const documentReference: DocumentReference = {
  resourceType: 'DocumentReference',
  status: 'current',
  subject: { reference: 'Patient/123' },
  content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/abc', title: 'cbc.pdf' } }],
};

function buildEvent(input: DocumentReference = documentReference): BotEvent<DocumentReference> {
  return { bot: { reference: 'Bot/123' }, contentType, input, secrets: {} };
}

// Wraps a raw `$ai` content string in the Parameters response shape.
function aiContent(content: string): Parameters {
  return { resourceType: 'Parameters', parameter: [{ name: 'content', valueString: content }] };
}

function isAiCall(path: unknown): boolean {
  const s = String(path);
  return s.includes('$ai') || s.includes('%24ai');
}

// Stubs medplum.download (the PDF bytes) and intercepts only the `$ai` post, returning `content` as
// the AI output. All other posts (e.g. createResource) delegate to the real MockClient.
function stubDownloadAndAi(medplum: MockClient, content: string): ReturnType<typeof vi.spyOn> {
  vi.spyOn(medplum, 'download').mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]));
  const original = medplum.post.bind(medplum);
  return vi.spyOn(medplum, 'post').mockImplementation(async (path: any, ...rest: any[]) => {
    return isAiCall(path) ? aiContent(content) : original(path, ...rest);
  }) as ReturnType<typeof vi.spyOn>;
}

test('Parses a lab report PDF into a draft DiagnosticReport with contained Observations', async () => {
  const medplum = new MockClient();
  stubDownloadAndAi(
    medplum,
    JSON.stringify({
      loincCode: '58410-2',
      display: 'Complete blood count panel',
      category: 'LAB',
      performerDisplay: 'Quest Diagnostics',
      effectiveDateTime: '2026-07-01T09:30:00Z',
      results: [
        {
          display: 'Hemoglobin',
          loincCode: '718-7',
          value: 11.2,
          unit: 'g/dL',
          interpretationCode: 'L',
          referenceRange: { low: 13.5, high: 17.5 },
        },
      ],
    })
  );

  const report = await handler(medplum, buildEvent());

  expect(report.resourceType).toBe('DiagnosticReport');
  expect(report.status).toBe('preliminary');
  expect(report.id).toBeDefined(); // persisted via createResource
  expect(report.performer).toStrictEqual([{ display: 'Quest Diagnostics' }]);
  expect(report.subject).toStrictEqual({ reference: 'Patient/123' });
  expect(report.result).toStrictEqual([{ reference: '#obs-1', display: 'Hemoglobin' }]);

  const obs = report.contained?.[0] as Observation;
  expect(obs.status).toBe('preliminary');
  expect(obs.valueQuantity?.value).toBe(11.2);
  expect(obs.interpretation?.[0].coding?.[0]).toStrictEqual({ system: OBSERVATION_INTERPRETATION, code: 'L' });
});

test('Sends the PDF to $ai as a base64 file part', async () => {
  const medplum = new MockClient();
  const postSpy = stubDownloadAndAi(
    medplum,
    JSON.stringify({ results: [{ display: 'Glucose', value: 90, unit: 'mg/dL' }] })
  );

  await handler(medplum, buildEvent());

  const aiParams = postSpy.mock.calls[0][1] as Parameters;
  const messages = JSON.parse(aiParams.parameter?.find((p) => p.name === 'messages')?.valueString as string);
  const filePart = messages[1].content.find((c: any) => c.type === 'file');
  expect(filePart.file.filename).toBe('cbc.pdf');
  expect(filePart.file.file_data).toMatch(/^data:application\/pdf;base64,/);
  expect(aiParams.parameter?.find((p) => p.name === 'temperature')?.valueDecimal).toBe(0);
});

test('Strips markdown code fences from the model output', async () => {
  const medplum = new MockClient();
  stubDownloadAndAi(medplum, '```json\n{"results":[{"display":"Sodium","value":140,"unit":"mmol/L"}]}\n```');

  const report = await handler(medplum, buildEvent());
  expect((report.contained?.[0] as Observation).code.text).toBe('Sodium');
});

test('Throws when the DocumentReference has no PDF attachment', async () => {
  const medplum = new MockClient();
  const noPdf: DocumentReference = {
    resourceType: 'DocumentReference',
    status: 'current',
    content: [{ attachment: { contentType: 'image/png', url: 'Binary/xyz' } }],
  };
  await expect(handler(medplum, buildEvent(noPdf))).rejects.toThrow('no application/pdf attachment');
});
