# Medplum Document Extraction Bot Notes

## Bot Runtime

The bot must have `runtimeVersion: "awslambda"` set on the Bot resource. It was previously
set to `vmcontext` (the server default), which caused a "VM Context bots not enabled" error.
This was fixed by PATCHing the bot resource directly via the API, then redeploying.

To verify:
```bash
TOKEN=$(node .../index.cjs token)
curl https://api.medplum.com/fhir/R4/Bot/<id> -H "Authorization: Bearer $TOKEN" | jq '{name, runtimeVersion}'
```

## Document Extraction Bot

### US Core Compliance
The bot produces FHIR R4 resources conforming to **US Core 6.1.0 / USCDI v3** profiles.
Every resource includes a `meta.profile` URL. Key mappings:

| Document Entity | FHIR Resource | US Core Profile |
|---|---|---|
| Patient demographics | Patient | us-core-patient |
| Lab result (individual) | Observation | us-core-observation-lab |
| Lab report (overall) | DiagnosticReport | us-core-diagnosticreport-lab |
| Diagnosis / problem | Condition | us-core-condition-problems-health-concerns |
| Medication prescribed | MedicationRequest | us-core-medicationrequest |
| Allergy | AllergyIntolerance | us-core-allergyintolerance |
| Procedure | Procedure | us-core-procedure |
| Vaccine | Immunization | us-core-immunization |

Terminology codes (LOINC, SNOMED, RxNorm) are used when present in the document.
When not available, `CodeableConcept.text` is used with the term as it appears in the document.
This is preferred over expensive per-code `ValueSet/$expand` lookups that consume too many turns.

Reference: [Understanding USCDI Data Classes](/docs/fhir-datastore/understanding-uscdi-dataclasses)

### Timeout
The bot's Lambda timeout must be set to a high value (currently **300 seconds**) because it runs
an agentic loop with multiple OpenAI + FHIR API calls. The default 10-second Lambda timeout
will always cause it to fail.

Set via PATCH:
```bash
curl -X PATCH https://api.medplum.com/fhir/R4/Bot/<id> \
  -H "Content-Type: application/json-patch+json" \
  -d '[{"op":"replace","path":"/timeout","value":300}]'
```
Then redeploy so the Lambda config is updated.

### MAX_ITERATIONS
Each iteration = one OpenAI tool call round-trip. A complex document (many diagnoses,
medications, labs, allergies) requires:
- 1 duplicate check per resource type
- 1 terminology lookup (ValueSet/$expand) per code

This can easily exceed 20 iterations before the AI reaches `submit_bundle`.
`MAX_ITERATIONS` is currently set to **40**. If the bot still hits the limit, check
CloudWatch logs to see if the AI is doing redundant lookups.

### Debugging
The bot emits `console.log` lines at each iteration, visible in CloudWatch. They are also
partially visible in the `outcomeDesc` field of the AuditEvent for the bot execution, but
Lambda's LogResult is capped at ~4KB so only the tail of the logs (usually just the final
error) appears there for long runs.

To search AuditEvents:
```bash
curl "https://api.medplum.com/fhir/R4/AuditEvent?entity=Bot/<id>&_count=5&_sort=-_lastUpdated"
```

### Testing
To test the bot end-to-end:
1. Upload a PDF as a Binary: `POST /fhir/R4/Binary` with `Content-Type: application/pdf`
2. Create a DocumentReference pointing to the Binary
3. Execute: `POST /fhir/R4/Bot/<id>/$execute` with the DocumentReference as the body
