// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, MedplumClient } from '@medplum/core';

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
  const response = await medplum.executeBot('your-bot-id', { foo: 'bar' }, ContentType.JSON, {
    headers: {
      Prefer: 'respond-async',
    },
    pollStatusOnAccepted: true, // Poll the status until completion
    pollStatusPeriod: 2000, // Poll every 2 seconds
  });
  // end-block execute-async-with-polling

  console.log(response);
}

export async function checkJobStatusExample(): Promise<void> {
  // start-block check-job-status-manual
  // Example: Get the status URL from the Content-Location header
  const accessToken = 'your-access-token';
  const response = await fetch('https://api.medplum.com/fhir/R4/Bot/bot-id/$execute', {
    headers: {
      Prefer: 'respond-async',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Get the status URL from the Content-Location header
  const statusUrl = response.headers.get('Content-Location');
  if (!statusUrl) {
    throw new Error('No Content-Location header found');
  }

  // Poll the status until completion, using a for loop with max attempts
  let result: any = undefined;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const statusResponse = await fetch(statusUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const asyncJob = await statusResponse.json();

    if (asyncJob.status === 'completed') {
      // Extract the result from the output parameters
      const responseBody = asyncJob.output?.parameter?.find((p: any) => p.name === 'responseBody');
      result = responseBody?.valueString || responseBody?.valueBoolean || responseBody?.valueInteger;
    } else if (asyncJob.status === 'error') {
      // Handle error case
      const outcome = asyncJob.output?.parameter?.find((p: any) => p.name === 'outcome');
      throw new Error(`Bot execution failed: ${outcome?.resource?.issue?.[0]?.details?.text}`);
    }

    // Wait 2 second before polling again
    await sleep(2000);
  }

  // If the result is undefined, throw an error
  if (result === undefined) {
    throw new Error('Max polling attempts reached without completion');
  }

  // end-block check-job-status-manual
  console.log(result);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
