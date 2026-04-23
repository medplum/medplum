// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DocumentParsingProvider, ParsedLabReport } from '../types';
import { PARSED_LAB_REPORT_SCHEMA } from '../types';

const REDUCTO_EXTRACT_URL = 'https://api.reducto.ai/extract';

interface ReductoExtractResponse {
  job_id: string;
  result: ParsedLabReport[];
  usage: {
    credits: number;
    pages: number;
  };
}

/**
 * Reducto document parsing provider.
 *
 * Uses Reducto's Extract endpoint with a JSON Schema to pull structured lab data from PDFs.
 * Works in all bot runtimes since it only requires `fetch`.
 *
 * Required config keys:
 * - REDUCTO_API_KEY: API key for authentication
 *
 * @see https://docs.reducto.ai/api-reference/extract
 */
export class ReductoProvider implements DocumentParsingProvider {
  readonly name = 'reducto';

  async parseDocument(documentUrl: string, config: Record<string, string>): Promise<ParsedLabReport> {
    const apiKey = config['REDUCTO_API_KEY'];
    if (!apiKey) {
      throw new Error('REDUCTO_API_KEY is not configured');
    }

    const response = await fetch(REDUCTO_EXTRACT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        document_url: documentUrl,
        schema: PARSED_LAB_REPORT_SCHEMA,
        system_prompt:
          'Extract all lab test results from this clinical laboratory report. ' +
          'Include all individual test measurements with their values, units, reference ranges, and flags. ' +
          'Identify the performing laboratory, ordering provider, and patient information.',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Reducto API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as ReductoExtractResponse;

    if (!data.result || data.result.length === 0) {
      throw new Error('Reducto returned no extraction results');
    }

    // Reducto returns an array of results (one per document page/section).
    // Merge them into a single ParsedLabReport.
    return mergeResults(data.result);
  }
}

/**
 * Merge multiple extraction results into a single ParsedLabReport.
 * Reducto may return results per-page; we combine them into one report.
 */
function mergeResults(results: ParsedLabReport[]): ParsedLabReport {
  if (results.length === 1) {
    return results[0];
  }

  const merged: ParsedLabReport = {
    ...results[0],
    results: [],
  };

  for (const result of results) {
    if (result.results) {
      merged.results.push(...result.results);
    }
    // Merge citations if present
    if (result.citations) {
      if (!merged.citations) {
        merged.citations = [];
      }
      merged.citations.push(...result.citations);
    }
  }

  return merged;
}
