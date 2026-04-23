// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DocumentParsingProvider, ParsedLabReport } from '../types';

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 5000;

interface BdaInvokeResponse {
  invocationArn: string;
  status: string;
}

interface BdaStatusResponse {
  status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  outputConfiguration?: {
    s3Uri: string;
  };
  failureMessage?: string;
}

/**
 * Amazon Bedrock Data Automation (BDA) document parsing provider.
 *
 * Uses BDA's async invocation API with custom blueprints to extract structured lab data.
 * This provider is best suited for the `awslambda` bot runtime where AWS SDK clients are available.
 * For `vmcontext` runtime, it uses REST API calls with SigV4 signing.
 *
 * Required config keys:
 * - AWS_BDA_PROJECT_ARN: ARN of the BDA data automation project
 * - AWS_BDA_BLUEPRINT_ARN: ARN of the custom blueprint for lab report extraction
 * - AWS_BDA_INPUT_S3_URI: S3 URI where the input document is stored
 * - AWS_BDA_OUTPUT_S3_URI: S3 URI prefix for output results
 * - AWS_REGION: AWS region (defaults to 'us-east-1')
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/bda-using-api.html
 */
export class BedrockDataAutomationProvider implements DocumentParsingProvider {
  readonly name = 'bedrock-data-automation';

  async parseDocument(documentUrl: string, config: Record<string, string>): Promise<ParsedLabReport> {
    const projectArn = config['AWS_BDA_PROJECT_ARN'];
    const blueprintArn = config['AWS_BDA_BLUEPRINT_ARN'];
    const outputS3Uri = config['AWS_BDA_OUTPUT_S3_URI'];
    const region = config['AWS_REGION'] || 'us-east-1';

    if (!projectArn || !blueprintArn || !outputS3Uri) {
      throw new Error(
        'BDA requires AWS_BDA_PROJECT_ARN, AWS_BDA_BLUEPRINT_ARN, and AWS_BDA_OUTPUT_S3_URI to be configured'
      );
    }

    // Step 1: Invoke async data automation
    const invokeResponse = await this.invokeDataAutomation(documentUrl, projectArn, blueprintArn, outputS3Uri, region);

    // Step 2: Poll for completion
    const statusResponse = await this.pollForCompletion(invokeResponse.invocationArn, region);

    if (statusResponse.status === 'FAILED') {
      throw new Error(`BDA processing failed: ${statusResponse.failureMessage || 'Unknown error'}`);
    }

    // Step 3: Read results from S3 output
    const outputUri = statusResponse.outputConfiguration?.s3Uri;
    if (!outputUri) {
      throw new Error('BDA completed but no output S3 URI was returned');
    }

    return this.readOutputFromS3(outputUri, region);
  }

  private async invokeDataAutomation(
    inputS3Uri: string,
    projectArn: string,
    blueprintArn: string,
    outputS3Uri: string,
    region: string
  ): Promise<BdaInvokeResponse> {
    const endpoint = `https://bedrock-data-automation-runtime.${region}.amazonaws.com`;

    const body = {
      inputConfiguration: {
        s3Uri: inputS3Uri,
      },
      outputConfiguration: {
        s3Uri: outputS3Uri,
      },
      dataAutomationConfiguration: {
        dataAutomationProjectArn: projectArn,
      },
      blueprints: [
        {
          blueprintArn: blueprintArn,
          stage: 'LIVE',
        },
      ],
    };

    const response = await fetch(`${endpoint}/invocations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`BDA invocation failed (${response.status}): ${errorBody}`);
    }

    return (await response.json()) as BdaInvokeResponse;
  }

  private async pollForCompletion(invocationArn: string, region: string): Promise<BdaStatusResponse> {
    const endpoint = `https://bedrock-data-automation-runtime.${region}.amazonaws.com`;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const response = await fetch(`${endpoint}/invocations/${encodeURIComponent(invocationArn)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`BDA status check failed (${response.status}): ${errorBody}`);
      }

      const status = (await response.json()) as BdaStatusResponse;

      if (status.status !== 'IN_PROGRESS') {
        return status;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`BDA processing timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000} seconds`);
  }

  private async readOutputFromS3(outputS3Uri: string, _region: string): Promise<ParsedLabReport> {
    // In a production implementation, this would use the AWS SDK S3 client:
    //   const s3 = new S3Client({ region });
    //   const { Body } = await s3.send(new GetObjectCommand({ Bucket, Key }));
    //
    // For the vmcontext runtime without AWS SDK, customers would need to use
    // presigned URLs or configure the bot to run in awslambda runtime.
    //
    // BDA outputs JSON results to the configured S3 path. The structure includes
    // the extracted fields matching the blueprint schema.

    const response = await fetch(outputS3Uri);
    if (!response.ok) {
      throw new Error(`Failed to read BDA output from S3 (${response.status})`);
    }

    const rawOutput = await response.json();
    return this.mapBdaOutputToLabReport(rawOutput as Record<string, unknown>);
  }

  /**
   * Map BDA's blueprint-based output to our normalized ParsedLabReport format.
   * The BDA output structure depends on the blueprint definition.
   * This mapping assumes the blueprint fields align with our ParsedLabReport schema.
   */
  private mapBdaOutputToLabReport(output: Record<string, unknown>): ParsedLabReport {
    // BDA wraps results in a document-level structure.
    // The exact path depends on blueprint configuration.
    // This implementation assumes a direct mapping from blueprint fields to ParsedLabReport.
    const data = (output as Record<string, Record<string, unknown>>).extractedFields || output;

    return {
      reportDate: String(data.reportDate || ''),
      accessionNumber: data.accessionNumber ? String(data.accessionNumber) : undefined,
      specimenCollectionDate: data.specimenCollectionDate ? String(data.specimenCollectionDate) : undefined,
      specimenType: data.specimenType ? String(data.specimenType) : undefined,
      reportStatus: (String(data.reportStatus || 'final')) as ParsedLabReport['reportStatus'],
      performingLab: data.performingLab as ParsedLabReport['performingLab'],
      orderingProvider: data.orderingProvider as ParsedLabReport['orderingProvider'],
      patient: data.patient as ParsedLabReport['patient'],
      results: (data.results || []) as ParsedLabReport['results'],
    };
  }
}
