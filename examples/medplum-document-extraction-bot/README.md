# Medplum Document Extraction Bot

Example Medplum bot that extracts text from medical documents and converts the result into FHIR R4 resources.

This project is intentionally focused on one bot:

| Bot           | Source               | Purpose                                                                                                                                                                    |
| ------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-textract` | `src/ai-textract.ts` | Runs `$aws-textract`, stores extracted text, asks OpenAI to convert document content into FHIR resources, validates generated resources, and submits a transaction bundle. |

## Requirements

- Node.js `^22.18.0` or `>=24.2.0`
- npm `10.9.8`
- Medplum CLI access to the target project
- Medplum project features: `bots`, `aws-textract`, and `ai`
- AWS S3 binary storage configured on the Medplum server
- OpenAI API key configured as a Medplum bot secret named `OPENAI_API_KEY`

## Secrets

```text
OPENAI_API_KEY=
OPENAI_MODEL=
MEDPLUM_CLIENT_ID=
MEDPLUM_CLIENT_SECRET=
MEDPLUM_BOT_ID=
```

`OPENAI_MODEL` is optional. The bot currently defaults to `gpt-5.2`.
`MEDPLUM_CLIENT_ID`, `MEDPLUM_CLIENT_SECRET`, and `MEDPLUM_BOT_ID` are only required for the live
end-to-end tests and helper scripts.

For local configuration, copy `.env.example` to `.env` and fill in the values needed for scripts.
Do not commit `.env`.

## Build

```bash
npm install
npm run build
```

The build compiles TypeScript and bundles the bot into `dist/ai-textract.js`.

## Test

```bash
npm test
```

The default test command runs the mocked unit tests only.

To run the live end-to-end fixture tests:

```bash
npm run test:e2e
```

The end-to-end tests require real Medplum, AWS, and OpenAI configuration.

## Deploy

The bot source mapping is defined in `medplum.config.json`. Set the bot `id` after creating the
bot in your target Medplum project.

```bash
npm run deploy
```

The deploy script builds the project and deploys only `ai-textract`.

## Subscription Trigger

To run automatically when a document is uploaded, create an active `Subscription` for
`DocumentReference` resources that points to this bot. This example is intentionally create-only:
it runs when the `DocumentReference` is first created and does not run on later updates.

```json
{
  "resourceType": "Subscription",
  "status": "active",
  "reason": "Trigger document extraction when a DocumentReference is created",
  "criteria": "DocumentReference",
  "channel": {
    "type": "rest-hook",
    "endpoint": "Bot/<bot-id>",
    "payload": "application/fhir+json"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "create"
    }
  ]
}
```

Replace `<bot-id>` with the deployed `ai-textract` bot id. This is required for upload workflows
that create a `DocumentReference` and expect document extraction to start without manually calling
`Bot/<bot-id>/$execute`. Without the `subscription-supported-interaction` extension, Medplum
subscriptions run on both create and update by default.

## Runtime

This bot must use:

```json
{
  "runtimeVersion": "awslambda"
}
```

If the bot is left on the default `vmcontext` runtime, execution can fail with a VM Context runtime
error. After changing runtime settings on the Bot resource, redeploy the bot so the Lambda
configuration is updated.

For large documents, configure a higher Lambda timeout. The notes for this project currently use
`300` seconds.

To verify the deployed runtime settings:

```bash
npx medplum get Bot/<bot-id> --profile <profile>
```

To set the timeout directly:

```bash
npx medplum patch Bot/<bot-id> '[{"op":"replace","path":"/timeout","value":300}]' --profile <profile>
```

Redeploy after changing runtime settings so the Lambda configuration is updated.

## Document Extraction Flow

1. Accept a `Media` or `DocumentReference` resource.
2. Run Medplum `$aws-textract` asynchronously.
3. Store extracted text on the source `DocumentReference` when applicable.
4. Send the extracted text to OpenAI with instructions to produce a FHIR transaction bundle.
5. Validate generated bundle entries with the FHIR server.
6. Submit valid resources with conditional `PUT` requests for idempotency.
7. Patch patient references and document classification fields after the transaction when needed.
8. Refresh reference display strings on created or updated resources.

Generated resources are intended to conform to US Core 6.1.0 / USCDI v3 profiles where applicable:

| Document content               | FHIR resource        | US Core profile                                    |
| ------------------------------ | -------------------- | -------------------------------------------------- |
| Patient demographics           | `Patient`            | `us-core-patient`                                  |
| Lab result                     | `Observation`        | `us-core-observation-lab`                          |
| Lab report                     | `DiagnosticReport`   | `us-core-diagnosticreport-lab`                     |
| Diagnosis or problem           | `Condition`          | `us-core-condition-problems-health-concerns`       |
| Prescribed medication          | `MedicationRequest`  | `us-core-medicationrequest`                        |
| Allergy                        | `AllergyIntolerance` | `us-core-allergyintolerance`                       |
| Procedure                      | `Procedure`          | `us-core-procedure`                                |
| Vaccine                        | `Immunization`       | `us-core-immunization`                             |
| Insurance card data            | `Coverage`           | FHIR R4 `Coverage`                                 |
| Source document classification | `DocumentReference`  | `http://hl7.org/fhir/us/core/...documentreference` |

Each generated resource should include the appropriate `meta.profile` URL. Terminology codes
such as LOINC, SNOMED CT, and RxNorm are used when present in the document. When a reliable code
is not available, the bot preserves the source term in `CodeableConcept.text`.

## End-to-End Document Test

1. Upload a PDF as a `Binary` with `Content-Type: application/pdf`.
2. Create a `DocumentReference` that points to the `Binary`.
3. Execute `ai-textract` with the `DocumentReference` as the request body.

Example direct bot execution:

```bash
npx medplum post 'Bot/<bot-id>/$execute' '<DocumentReference JSON>' --profile <profile>
```

## Debugging

The bot emits `console.log` lines during extraction, validation, bundle submission, and post-submit
patching. In production, review CloudWatch logs for the full execution trace. Medplum `AuditEvent`
records can also contain execution information, but Lambda log output there may be truncated.

To inspect recent bot audit events:

```bash
npx medplum get 'AuditEvent?entity=Bot/<bot-id>&_count=5&_sort=-_lastUpdated' --profile <profile>
```
