// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block async-imports
import { ContentType, isOk, isOperationOutcome, MedplumClient, OperationOutcomeError } from '@medplum/core';
import type { AsyncJob, Parameters } from '@medplum/fhirtypes';
// end-block async-imports

const medplum = new MedplumClient();

export async function executeById(id: string): Promise<void> {
  // start-block execute-by-id
  const result = await medplum.executeBot(id, { input: { foo: 'bar' } }, ContentType.JSON);
  console.log(result);
  // end-block execute-by-id

  // start-block execute-by-id-get
  const getResult = await medplum.get(medplum.fhirUrl('Bot', id, '$execute').toString() + '?foo=bar');
  console.log(getResult);
  // end-block execute-by-id-get
}

export async function executeByIdentifier(): Promise<void> {
  // start-block execute-by-identifier
  const result = await medplum.executeBot(
    {
      system: 'https://example.com/bots',
      value: '1234',
    },
    {
      foo: 'bar',
    }
  );
  console.log(result);
  // end-block execute-by-identifier
  // start-block execute-by-identifier-get
  const getResult = await medplum.get(
    medplum.fhirUrl('Bot', '$execute').toString() + '?identifier=https://example.com/bots|1234&foo=bar'
  );
  console.log(getResult);
  // end-block execute-by-identifier-get
}

export async function executeAsync(): Promise<void> {
  // start-block execute-async
  const response = await medplum.executeBot('your-bot-id', { foo: 'bar' }, ContentType.JSON, {
    headers: {
      Prefer: 'respond-async',
    },
  });
  // end-block execute-async

  console.log(response);
}

export async function executeAsyncWithPolling(): Promise<void> {
  // start-block execute-async-with-polling
  const job: AsyncJob = await medplum.executeBot('your-bot-id', { foo: 'bar' }, ContentType.JSON, {
    headers: {
      Prefer: 'respond-async',
    },
    pollStatusOnAccepted: true, // Returns the terminal AsyncJob, not the Bot result
    pollStatusPeriod: 2000, // Poll every 2 seconds
  });
  const output = getCompletedBotOutput(job); // Defined below
  // Apply your Bot's result contract to output before declaring business success.
  // end-block execute-async-with-polling

  console.log(output);
}

export async function checkJobStatusExample(): Promise<void> {
  // start-block check-job-status-manual
  // Example: Get the status URL from the Content-Location header
  const accessToken = 'your-access-token';
  const response = await fetch('https://api.medplum.com/fhir/R4/Bot/bot-id/$execute', {
    method: 'POST',
    headers: {
      Prefer: 'respond-async',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ foo: 'bar' }),
  });

  if (response.status !== 202) {
    throw new Error(`Expected asynchronous acceptance; received HTTP ${response.status}`);
  }
  const statusUrl = response.headers.get('Content-Location');
  if (!statusUrl) {
    throw new Error('No Content-Location header found');
  }

  // Retain statusUrl so a caller can resume polling after a disconnect or timeout.
  const pollingClient = new MedplumClient({ baseUrl: 'https://api.medplum.com/', accessToken });
  const output = await waitForBotJob(pollingClient, statusUrl);
  // end-block check-job-status-manual
  console.log(output);
}

// start-block inspect-job-output
export function getCompletedBotOutput(job: AsyncJob): Parameters {
  // A completed wrapper can still contain a Bot error OperationOutcome.
  for (const parameter of job.output?.parameter ?? []) {
    if (isOperationOutcome(parameter.resource) && !isOk(parameter.resource)) {
      throw new OperationOutcomeError(parameter.resource);
    }
  }
  if (job.status !== 'completed') {
    throw new Error(`Bot job is ${job.status}; inspect its output before retrying`);
  }
  if (!job.output) {
    throw new Error('Bot job has no output; reconcile its result before retrying');
  }
  // Preserve the Parameters, including false/zero values. The caller must also
  // interpret any custom success/failure representation returned by its Bot.
  return job.output;
}
// end-block inspect-job-output

// start-block wait-for-job
export async function waitForBotJob(
  client: MedplumClient,
  statusUrl: string,
  maxAttempts = 30,
  pollInterval = 2000
): Promise<Parameters> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const job = await client.get<AsyncJob>(statusUrl, { cache: 'no-cache', pollStatusOnAccepted: false });
    if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
      return getCompletedBotOutput(job);
    }
    if (attempt + 1 < maxAttempts) {
      await new Promise((resolve) => {
        setTimeout(resolve, pollInterval);
      });
    }
  }
  throw new Error(`Polling limit reached; retain ${statusUrl} and reconcile before resubmitting`);
}
// end-block wait-for-job

export async function exampleResponses(): Promise<void> {
  const _successResponse =
    // start-block example-success-response
    {
      resourceType: 'AsyncJob',
      id: 'job-id',
      status: 'completed',
      request: 'https://api.medplum.com/fhir/R4/Bot/:bot-id/$execute',
      requestTime: '2023-01-01T00:00:00.000Z',
      transactionTime: '2023-01-01T00:00:05.000Z',
      output: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'responseBody',
            valueString: 'Bot execution result',
          },
        ],
      },
    };
  // end-block example-success-response
  console.log(_successResponse);

  const _errorResponse =
    // start-block example-error-response
    {
      resourceType: 'AsyncJob',
      id: 'job-id',
      status: 'error',
      request: 'https://api.medplum.com/fhir/R4/Bot/:bot-id/$execute',
      requestTime: '2023-01-01T00:00:00.000Z',
      transactionTime: '2023-01-01T00:00:05.000Z',
      output: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'outcome',
            resource: {
              resourceType: 'OperationOutcome',
              issue: [
                {
                  severity: 'error',
                  code: 'processing',
                  details: {
                    text: 'Bot execution failed',
                  },
                },
              ],
            },
          },
        ],
      },
    };
  // end-block example-error-response
  console.log(_errorResponse);
}
