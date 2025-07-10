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

export async function checkJobStatus(): Promise<void> {
  // start-block check-job-status-manual
  // Example: Get the status URL from the Content-Location header
  const response = await fetch('https://api.medplum.com/fhir/R4/Bot/bot-id/$execute', {
    headers: { Prefer: 'respond-async' },
  });
  const statusUrl = response.headers.get('Content-Location');
  if (!statusUrl) {
    throw new Error('No Content-Location header found');
  }
  const accessToken = 'your-access-token';

  // Poll the status until completion
  async function checkJobStatus(statusUrl: string): Promise<any> {
    const statusResponse = await fetch(statusUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const asyncJob = await statusResponse.json();

    // Check if job is complete
    if (asyncJob.status === 'completed') {
      // Extract the result from the output parameters
      const responseBody = asyncJob.output?.parameter?.find((p: any) => p.name === 'responseBody');
      return responseBody.valueString || responseBody.valueBoolean || responseBody.valueInteger;
    } else if (asyncJob.status === 'error') {
      // Handle error case
      const outcome = asyncJob.output?.parameter?.find((p: any) => p.name === 'outcome');
      throw new Error(`Bot execution failed: ${outcome?.resource?.issue?.[0]?.details?.text}`);
    } else {
      // Job still running, wait and try again
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      return checkJobStatus(statusUrl);
    }
  }

  const result = await checkJobStatus(statusUrl);
  // end-block check-job-status-manual
  console.log(result);
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
}
