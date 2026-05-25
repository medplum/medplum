// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MedplumClient } from '@medplum/core';
import type { AsyncJob, Bundle, DiagnosticReport, DocumentReference } from '@medplum/fhirtypes';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://api.medplum.com';

/** PDF fixtures to run against the live bot. Paths relative to package root. */
const FIXTURES = [
  'fixtures/sample-lab-report.pdf',
  'fixtures/PRV_LG_0081_DE-IDENTIFIED.pdf',
  'fixtures/PRV_LG_0073_DE-IDENTIFIED.pdf',
  'fixtures/PRV_BSC_2116_906807965_DE-IDENTIFIED.pdf',
  'fixtures/PRV_LG_1039_DE-IDENTIFIED.pdf',
  'fixtures/PRV_LG_0148_DE-IDENTIFIED.pdf',
];

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#][^=]*)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
  } catch {
    // .env not found — fall through, test will skip
  }
  return env;
}

/**
 * Poll an AsyncJob until status is 'completed' or 'error'. Returns the final AsyncJob.
 * @param contentLocation - AsyncJob status endpoint from the content-location response header.
 * @param token - Medplum access token.
 * @param pollIntervalMs - Polling interval in milliseconds.
 * @returns The completed or errored AsyncJob.
 */
async function waitForAsyncJob(contentLocation: string, token: string, pollIntervalMs = 3000): Promise<AsyncJob> {
  while (true) {
    const res = await fetch(contentLocation, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`AsyncJob poll failed: ${res.status} ${await res.text()}`);
    }
    const job = (await res.json()) as AsyncJob;
    console.log(`AsyncJob status: ${job.status}`);
    if (job.status === 'completed' || job.status === 'error') {
      return job;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }
}

describe('ai-textract e2e', () => {
  it.each(FIXTURES)(
    'extracts FHIR bundle from %s',
    async (fixture) => {
      const env = loadEnv();
      const clientId = env['MEDPLUM_CLIENT_ID'];
      const clientSecret = env['MEDPLUM_CLIENT_SECRET'];
      const botId = env['MEDPLUM_BOT_ID'];

      if (!clientId || !clientSecret || !botId) {
        console.log('Skipping e2e test: MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET / MEDPLUM_BOT_ID not set');
        return;
      }

      // Authenticate
      const medplum = new MedplumClient({ baseUrl: `${BASE_URL}/` });
      await medplum.startClientLogin(clientId, clientSecret);
      const token = medplum.getAccessToken();
      console.log(`\n[${fixture}] Authenticated with Medplum`);

      // Upload PDF as Binary
      const pdfPath = join(__dirname, '..', fixture);
      const pdfData = readFileSync(pdfPath);
      const filename = fixture.split('/').pop();
      if (!filename) {
        throw new Error(`Invalid fixture path: ${fixture}`);
      }
      const binary = await medplum.createBinary(pdfData, filename, 'application/pdf');
      console.log(`[${fixture}] Uploaded Binary: ${binary.id}`);

      // Create DocumentReference pointing to the Binary
      const docRef = await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        content: [
          {
            attachment: {
              contentType: 'application/pdf',
              url: `Binary/${binary.id}`,
              title: filename,
            },
          },
        ],
      });
      console.log(`[${fixture}] Created DocumentReference: ${docRef.id}`);

      // Execute the bot asynchronously — avoids the 60s API gateway timeout
      console.log(`[${fixture}] Executing bot ${botId} (async)...`);
      const executeRes = await fetch(`${BASE_URL}/fhir/R4/Bot/${botId}/$execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json',
          Authorization: `Bearer ${token}`,
          Prefer: 'respond-async',
        },
        body: JSON.stringify(docRef),
      });

      expect(executeRes.status).toBe(202);
      const contentLocation = executeRes.headers.get('content-location');
      expect(contentLocation).toBeTruthy();
      console.log(`[${fixture}] AsyncJob polling: ${contentLocation}`);

      // Poll until done
      const job = await waitForAsyncJob(contentLocation as string, token as string);
      console.log(`[${fixture}] AsyncJob completed with status: ${job.status}`);

      if (job.status === 'error') {
        throw new Error(`Bot async job failed: ${JSON.stringify(job.output)}`);
      }

      // The bot returns a Bundle stored as JSON in output.parameter[name=responseBody].valueString
      const resultParam = job.output?.parameter?.find((p) => p.name === 'responseBody');
      expect(resultParam?.valueString).toBeTruthy();
      if (!resultParam?.valueString) {
        throw new Error('Missing bot responseBody');
      }
      const result = JSON.parse(resultParam.valueString) as Bundle;

      // Detect Lambda-level errors stored as JSON (e.g. { errorType, errorMessage })
      if ((result as any).errorMessage) {
        throw new Error(`Lambda error: ${(result as any).errorMessage}`);
      }

      console.log(`[${fixture}] Bot returned bundle with ${result.entry?.length ?? 0} entries`);
      console.log(JSON.stringify(result, null, 2));

      // Assertions
      expect(result.resourceType).toBe('Bundle');
      expect(result.entry?.length).toBeGreaterThan(0);

      const patient = result.entry?.find((e) => e.resource?.resourceType === 'Patient')?.resource;
      expect(patient).toBeDefined();
      console.log(`[${fixture}] Patient: ${JSON.stringify(patient)}`);

      const diagnosticReportEntry = result.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport');
      const observations = result.entry?.filter((e) => e.resource?.resourceType === 'Observation') ?? [];

      // Lab documents must have observations; insurance cards and other non-lab docs may not.
      if (diagnosticReportEntry) {
        expect(observations.length).toBeGreaterThan(0);
        // Every observation subject should have a display string
        for (const obs of observations) {
          const subject = (obs.resource as any)?.subject;
          expect(subject?.display).toBeTruthy();
        }
      }
      const diagnosticReport = diagnosticReportEntry?.resource as DiagnosticReport | undefined;
      if (diagnosticReport) {
        console.log(`[${fixture}] DiagnosticReport: ${JSON.stringify(diagnosticReport)}`);
        // Must have the US Core LaboratorySlice category (v2-0074/LAB)
        const hasLabSlice = diagnosticReport.category?.some((cat) =>
          cat.coding?.some((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v2-0074' && c.code === 'LAB')
        );
        expect(hasLabSlice).toBe(true);
      }
    },
    380_000 // 380s per fixture — async job can run up to Lambda max of 300s
  );
});
