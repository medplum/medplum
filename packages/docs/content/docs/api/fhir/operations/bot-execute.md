---
id: bot-execute
title: Bot $execute
weight: 70
---

The `$execute` operation runs a Medplum Bot on-demand, allowing you to trigger server-side automation logic via API calls. Bots can process
incoming data, integrate with external systems, and return custom responses-making this operation the primary way to leverage Medplum's
automation capabilities.

Whether you're processing HL7v2 messages from legacy systems, responding to webhooks, or building custom API endpoints, `$execute` provides
the flexibility to handle virtually any healthcare integration scenario.

## Use Cases

- **Webhook Handling**: Receive and process incoming webhooks from external services (labs, pharmacies, payers)
- **HL7v2 Integration**: Parse and transform HL7v2 messages from legacy healthcare systems
- **Custom API Endpoints**: Build application-specific endpoints that return custom JSON responses
- **On-Demand Processing**: Trigger data transformations, validations, or calculations programmatically
- **External System Integration**: Connect to third-party APIs and synchronize data with your FHIR resources

{{< tip >}}
If you're not familiar with Medplum Bots, you may want to review [Bot Basics](/docs/bots/bot-basics) documentation first.
{{< /tip >}}

## Invoke a bot by ID

Invoke a bot by ID when you know the Bot's ID in advance.

### Finding your Bot Id

You can find the `id` of your Bot by clicking on the **Details** tab of the Bot resource. In this example, it is ` 43ac3060-ff20-49e8-9682-bf91ab3a5191`

<img src="/img/app/bots/find_bot_id.png" width="50%" height="50%" alt="Find your Bot ID" title="Find your Bot ID" />

### Using POST

```
POST [base]/Bot/[id]/$execute
```

#### Examples

{{< tabs >}}
  {{< tab value="ts" label="TypeScript" >}}

The [MedplumClient](/docs/sdk/core.medplumclient) TypeScript class provides a `executeBot` convenience method

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="execute-by-id" >}}
  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum login
medplum post 'Bot/[id]/$execute' '{ "foo": "bar" }'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl 'https://api.medplum.com/fhir/R4/Bot/[id]/$execute' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d '{"foo":"bar"}'
```

  {{< /tab >}}
{{< /tabs >}}

### Using GET

Query parameters will be passed to the bot as type `Record<string, string>` (see [Content Types](#content-types) below)

```
GET [base]/Bot/[id]/$execute?params
```

{{< tabs >}}
  {{< tab value="ts" label="TypeScript" >}}
{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="execute-by-id-get" >}}

  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum login
medplum get 'Bot/[id]/$execute?foo=bar'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl 'https://api.medplum.com/fhir/R4/Bot/[id]/$execute?foo=bar' \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN"
```

  {{< /tab >}}
{{< /tabs >}}

## Invoke a bot by identifier

Sometimes you may not know the Medplum Bot ID in advance. In that case, you can invoke a Bot by `Identifier`.

This is also useful when the same conceptual bot exists in multiple Medplum projects. Each bot will have a different ID, but they can all have the same identifier.

### Using POST

```
POST [base]/Bot/$execute?identifier=[system]|[code]
```

#### Examples

{{< tabs >}}
  {{< tab value="ts" label="TypeScript" >}}

The [MedplumClient](/docs/sdk/core.medplumclient) `executeBot` convenience method supports both `id: string` and `identifier: Identifier`:

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="execute-by-identifier" >}}
  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum login
medplum post 'Bot/[id]/$execute?identifier=https://example.com/bots|1234' '{ "foo": "bar" }'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl 'https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https://example.com/bots|1234' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d '{"foo":"bar"}'
```

  {{< /tab >}}
{{< /tabs >}}

### Using GET

Query parameters will be passed to the bot as type `Record<string, string>` (see [Content Types](#content-types) below)

```
GET [base]/Bot/$execute?identifier=[system]|[code]&params
```

{{< tabs >}}
  {{< tab value="ts" label="TypeScript" >}}

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="execute-by-identifier-get" >}}

  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum login
medplum get 'Bot/$execute?identifier=https://example.com/bots|1234'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl 'https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https://example.com/bots|1234' \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN"
```

  {{< /tab >}}
{{< /tabs >}}

## Content Types

Medplum Bots support a variety of input content types. Specify the input content type using the standard `Content-Type` HTTP header, or as an optional parameter to `MedplumClient.executeBot()`.

| Content-Type                         | typeof `event.input`                      | Description                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text/plain`                         | `string`                                  | `<INPUT_DATA>` is parsed as plaintext string                                                                                                                        |
| `application/json`                   | `Record<string, any>`                     | `<INPUT_DATA>` is parsed as JSON-encoded object                                                                                                                     |
| `application/x-www-form-urlencoded ` | `Record<string, string>`                  | `<INPUT_DATA>` is parsed as URL-encoded string, resulting in a key/value map                                                                                        |
| `application/fhir+json`              | [`Resource`](/docs/api/fhir/resources)    | `<INPUT_DATA>` is parsed as a [FHIR Resource](/docs/fhir-basics#storing-data-resources) encoded as JSON                                                             |
| `x-application/hl7-v2+er7`           | [`HL7Message`](/docs/sdk/core.hl7message) | `<INPUT_DATA>` is a string that should be parsed as a pipe-delimited HL7v2 message. HL7v2 is a common text-based message protocol used in legacy healthcare systems |

The input data that will be parsed according to `CONTENT_TYPE` and passed into your Bot as `event.input`.

## Asynchronous Execution

For authenticated Bot `$execute` requests, specify `Prefer: respond-async` to receive HTTP `202 Accepted` with a job status URL while the Bot runs in the background. Use this for non-streaming execution; it does not extend the Bot runtime's limits. Custom FHIR operations and public `/webhook/` routes do not implement this response mechanism.

{{< note title="Execution tracking and recovery" >}}

The server records an `AsyncJob`, but this execution path does not persist the request body as a resumable queue or automatically retry Bot failures. An interruption can leave a job unfinished. Retain the inputs and operation identity separately when recovery needs them, and reconcile an uncertain outcome before resubmitting. See [background processing and recovery](/docs/bots/event-processing#accept-work-for-background-processing).

{{< /note >}}

### Making an Async Request

Add the `Prefer: respond-async` header to the `$execute` request:

{{< tabs >}}
  {{< tab value="ts" label="TypeScript" >}}

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="async-imports, execute-async" >}}

  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
medplum post 'Bot/[id]/$execute' '{ "foo": "bar" }' --prefer-async
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
curl 'https://api.medplum.com/fhir/R4/Bot/[id]/$execute' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -H "Prefer: respond-async" \
  -d '{"foo":"bar"}'
```

  {{< /tab >}}
{{< /tabs >}}

### Checking Job Status

When using async execution, the server returns a `202 Accepted` response with a `Content-Location` header containing the URL to check the job status:

```http
HTTP/1.1 202 Accepted
Content-Location: https://api.medplum.com/fhir/R4/job/[job-id]/status
```

You can poll this URL to check the status of your bot execution. In general, for long running jobs it's best to poll no more frequently than 1 second.

{{< tabs >}}
  {{< tab value="ts" label="TypeScript" >}}
The SDK can poll automatically. Its resolved value is the terminal `AsyncJob`, not the Bot's unwrapped result. Inspect both the job status and output:
{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="execute-async-with-polling" >}}

Use this helper with either polling approach. It rejects terminal job failures and error `OperationOutcome` output, including errors inside a `completed` job. Interpret custom Bot response data according to your application's result contract as well.

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="inspect-job-output" >}}

Alternatively, capture the status URL and poll with a limit. Use the same authenticated identity, or another identity authorized to read the job. A polling timeout stops waiting; it does not cancel execution or authorize resubmitting the action.

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="check-job-status-manual" >}}

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="wait-for-job" >}}

  {{< /tab >}}
  {{< tab value="cli" label="CLI" >}}

```bash
# Check job status
medplum get 'job/[job-id]/status'
```

  {{< /tab >}}
  {{< tab value="curl" label="cURL" >}}

```bash
# Check job status
curl 'https://api.medplum.com/fhir/R4/job/[job-id]/status' \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN"
```

  {{< /tab >}}
{{< /tabs >}}

### AsyncJob Resource Structure

The status endpoint returns an `AsyncJob` resource. HTTP `202` means it is nonterminal; HTTP `200` means it has reached a terminal status, which can include failure or cancellation.

- **`status`**: Current job status
  - `accepted` - Job was accepted. Bot `$execute` can retain this status while processing; it is not proof that work is still waiting to start.
  - `active` - An in-progress status used by some asynchronous operations; do not require this transition when polling Bot execution.
  - `completed` - The asynchronous wrapper finished. Inspect the output before treating the Bot's business operation as successful.
  - `error` - The asynchronous operation reported a failure. Inspect its output.
  - `cancelled` - Cancellation was recorded. Do not rely on this to interrupt an already running Bot or undo its effects.

- **`output`**: A `Parameters` resource containing the result or failure details. Look up parameters by name rather than position.
  - `responseBody` contains ordinary Bot return data. Objects are JSON-encoded in `valueString`; booleans use `valueBoolean`.
  - `outcome` contains an `OperationOutcome`, which can indicate success or failure. A Bot error can appear here even when the job status is `completed`.
  - Errors from the asynchronous wrapper can also produce `error` and `stack` parameters. Avoid exposing internal diagnostics to end users.

- **`requester`**: The user or client application that started the execution

### Example Response

When the bot execution completes successfully:

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="example-success-response" >}}

An example of an asynchronous operation failure follows. A Bot execution failure can instead have `status: completed` with an error outcome, so do not use status alone to detect it.

{{< code-example file="packages/examples/src/api/fhir/operations/bot-execute.ts" language="ts" blocks="example-error-response" >}}

## Related

- [Bot $deploy](/docs/api/fhir/operations/bot-deploy) - Deploy bot code before execution
- [Bot Basics](/docs/bots/bot-basics) - Introduction to Medplum Bots
- [Bots In Production](/docs/bots/bots-in-production) - Best practices for production bot deployments
- [HL7 Interfacing](/docs/integration/hl7-interfacing) - Processing HL7v2 messages with bots
- [Consuming Webhooks](/docs/bots/consuming-webhooks) - Handle incoming webhooks with bots
