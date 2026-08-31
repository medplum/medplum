// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, ExtractedLabReport, MedplumClient } from '@medplum/core';
import { buildDiagnosticReport } from '@medplum/core';
import type { DiagnosticReport, DocumentReference, Parameters } from '@medplum/fhirtypes';

const DEFAULT_MODEL = 'gpt-5.4-nano';

const SYSTEM_PROMPT = `You are a clinical data extraction assistant. You are given a PDF of a laboratory report.
Extract its contents into a JSON object matching this exact shape:

{
  "loincCode": string | null,        // LOINC code for the overall panel, if you can identify one
  "display": string | null,          // name of the panel/report, e.g. "Complete blood count panel"
  "category": "LAB" | "PATH" | "RAD" | null,
  "performerDisplay": string | null, // performing lab or clinician name as printed
  "effectiveDateTime": string | null,// ISO 8601, specimen collection or report date
  "issued": string | null,           // ISO 8601, when the report was issued
  "conclusion": string | null,       // free-text narrative/conclusion, if any
  "results": [
    {
      "display": string,             // analyte name, e.g. "Hemoglobin" (REQUIRED)
      "loincCode": string | null,    // LOINC code for this analyte if you can infer one
      "value": number | null,        // numeric result
      "unit": string | null,         // UCUM unit for value, e.g. "g/dL"
      "valueString": string | null,  // non-numeric result, e.g. "Positive" (use instead of value)
      "interpretationCode": string | null, // H, L, HH, LL, N, A, etc. (HL7 v3 ObservationInterpretation)
      "referenceRange": { "low": number | null, "high": number | null, "unit": string | null, "text": string | null } | null
    }
  ]
}

Rules:
- Infer LOINC codes only when you are confident; otherwise use null and rely on the display name.
- Map result flags to interpretation codes: high -> "H", low -> "L", critical high -> "HH", critical low -> "LL", normal -> "N", abnormal -> "A".
- Use UCUM units (e.g. "g/dL", "10*3/uL", "mmol/L").
- Return ONLY the JSON object. Do NOT wrap it in markdown code fences. Do NOT include commentary.`;

/**
 * Parses a PDF lab report referenced by the input DocumentReference into a draft DiagnosticReport.
 *
 * Flow: download the PDF Binary -> send it to the project's configured LLM via the `$ai` operation
 * as a base64 file part -> map the returned JSON through `buildDiagnosticReport` -> create the
 * resulting draft DiagnosticReport (with contained draft Observations).
 *
 * Requires the project to have the `ai` feature enabled and `OPENAI_API_KEY` (and optionally
 * `LLM_BASE_URL`) set in project secrets, pointing at a model that accepts PDF/file input.
 *
 * @param medplum - The Medplum client.
 * @param event - Bot event whose input is a DocumentReference pointing at a PDF Binary.
 * @returns The created draft DiagnosticReport.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<DocumentReference>): Promise<DiagnosticReport> {
  const doc = event.input;
  const attachment = doc.content?.find((c) => c.attachment?.contentType === 'application/pdf')?.attachment;
  if (!attachment?.url) {
    throw new Error('DocumentReference has no application/pdf attachment with a url');
  }

  // Download the PDF and encode it for the LLM.
  const blob = await medplum.download(attachment.url);
  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
  const model = event.secrets['DIAGNOSTIC_REPORT_MODEL']?.valueString ?? DEFAULT_MODEL;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract the lab report from the attached PDF.' },
        {
          type: 'file',
          file: {
            filename: attachment.title ?? 'report.pdf',
            file_data: `data:application/pdf;base64,${base64}`,
          },
        },
      ],
    },
  ];

  const aiParameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(messages) },
      { name: 'model', valueString: model },
      { name: 'temperature', valueDecimal: 0 },
    ],
  };

  const response = await medplum.post<Parameters>(medplum.fhirUrl('$ai'), aiParameters);
  const content = response.parameter?.find((p) => p.name === 'content')?.valueString;
  if (!content) {
    throw new Error('AI response did not contain content');
  }

  const extracted = parseExtractedReport(content);
  const report = buildDiagnosticReport(extracted);

  // Carry over the subject if the DocumentReference has one; keep it a display-only feature otherwise.
  if (doc.subject) {
    report.subject = doc.subject;
  }

  return medplum.createResource(report);
}

/**
 * Parses the LLM's JSON response into an ExtractedLabReport, tolerating markdown code fences and
 * normalizing nulls to undefined so the values flow cleanly into buildDiagnosticReport.
 * @param content - The raw text content returned by the `$ai` operation.
 * @returns The normalized extracted lab report.
 */
function parseExtractedReport(content: string): ExtractedLabReport {
  let text = content.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');
  }
  const raw = JSON.parse(text) as Record<string, any>;
  if (!Array.isArray(raw.results)) {
    throw new Error('AI response did not contain a results array');
  }
  return {
    loincCode: raw.loincCode ?? undefined,
    display: raw.display ?? undefined,
    category: raw.category ?? undefined,
    performerDisplay: raw.performerDisplay ?? undefined,
    effectiveDateTime: raw.effectiveDateTime ?? undefined,
    issued: raw.issued ?? undefined,
    conclusion: raw.conclusion ?? undefined,
    results: raw.results.map((r: Record<string, any>) => ({
      display: r.display,
      loincCode: r.loincCode ?? undefined,
      value: typeof r.value === 'number' ? r.value : undefined,
      unit: r.unit ?? undefined,
      valueString: r.valueString ?? undefined,
      interpretationCode: r.interpretationCode ?? undefined,
      referenceRange: r.referenceRange
        ? {
            low: typeof r.referenceRange.low === 'number' ? r.referenceRange.low : undefined,
            high: typeof r.referenceRange.high === 'number' ? r.referenceRange.high : undefined,
            unit: r.referenceRange.unit ?? undefined,
            text: r.referenceRange.text ?? undefined,
          }
        : undefined,
    })),
  };
}
