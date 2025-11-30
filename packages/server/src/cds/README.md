# CDS Hooks

https://cds-hooks.hl7.org/

## Architecture and Design Decisions

The Medplum CDS Hooks implementation is built on the following core principles and architectural choices:

| Component      | Standard              | Medplum Implementation                 | Rationale                                                                                                                                         |
| :------------- | :-------------------- | :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| CDS Service    | External Application  | Medplum Bot Resource                   | Uses existing, secure, user-authored code execution environment.                                                                                  |
| Base URL       | Service Endpoint      | `https://api.medplum.com/cds-services` | Uses the service's primary base URL, separate from the FHIR base (`/fhir/R4`).                                                                    |
| Authentication | OAuth/JWT             | Mandatory JWT Authentication           | Both Discovery and Service Invocation endpoints require robust authentication for security and tenant isolation.                                  |
| Data Model     | Service Configuration | `Bot.cdsService` (Singleton)           | Dedicated, typed property on the `Bot` resource (no FHIR Extensions or `OperationDefinition` overloading).                                        |
| Execution      | Synchronous           | Synchronous HTTP POST                  | Aligns with the specification's requirement for near-real-time, in-workflow guidance. Asynchronous responses are not supported.                   |
| Permissions    | Least Privilege       | Limited by Caller's Token              | Bot actions on the external FHIR server are strictly limited by the scopes and user privileges granted in the incoming `fhirAuthorization` token. |

## CDS Hooks Endpoints

All endpoints require JWT authentication.

| Endpoint   | Method | Path                     | Purpose                                                                                |
| :--------- | :----- | :----------------------- | :------------------------------------------------------------------------------------- |
| Discovery  | `GET`  | `/cds-services`          | Lists all Bots configured as CDS Services for the authenticated user's project/tenant. |
| Invocation | `POST` | `/cds-services/{Bot.id}` | Executes the specific Bot's logic when a hook event is triggered by the EHR.           |

### Discovery Logic

The Discovery endpoint filters for all `Bot` resources where the custom FHIR Search Parameter `cds-hook` is present:

`GET /fhir/R4/Bot?cds-hook:present=true`

## Bot Configuration Contract (`Bot.cdsService`)

The following fields must be configured on a `Bot` resource to expose it as a CDS Service.

| Field                         | Required/Optional | CDS Hook Field      | Description                                                                                       |
| :---------------------------- | :---------------- | :------------------ | :------------------------------------------------------------------------------------------------ |
| `cdsService.hook`             | REQUIRED          | `hook`              | The event trigger (e.g., `patient-view`, `order-sign`). Used for the `cds-hook` search parameter. |
| `cdsService.description`      | REQUIRED          | `description`       | Summary of the Bot's function.                                                                    |
| `cdsService.title`            | REQUIRED          | `title`             | Human-friendly name for the service.                                                              |
| `cdsServie.usageRequirements` | OPTIONAL          | `usageRequirements` | Optional human-friendly description of any preconditions for the use of this CDS Service.         |
| `cdsService.prefetch`         | OPTIONAL          | `prefetch`          | An array of key/query templates used to request FHIR data from the EHR _before_ invoking the Bot. |

### Prefetch Structure

`Bot.cdsService.prefetch` is an array of objects that is flattened into a JSON object for the Discovery response:

```typescript
// Medplum Bot Definition
interface BotCdsServicePrefetch {
  key: string; // Becomes the JSON key (e.g., "patient")
  query: string; // Becomes the FHIR query (e.g., "Patient/{{context.patientId}}")
}
```

---

## Bot Response Contract (The "Cards")

The Medplum Bot's execution output must be a valid CDS Hooks response body (HTTP `200 OK`) containing the required `cards` array.

A card must contain at least these required fields:

| Field          | Constraint                                  | Purpose                                                               |
| :------------- | :------------------------------------------ | :-------------------------------------------------------------------- |
| `summary`      | REQUIRED, $<140$ characters.                | Concise message displayed to the clinician.                           |
| `indicator`    | REQUIRED: `info`, `warning`, or `critical`. | Sets the severity/prominence in the EHR UI.                           |
| `source.label` | REQUIRED                                    | Identifies the source of the guidance (e.g., "Medplum Dose Checker"). |

### Suggestion Cards

For cards that propose changes, the Bot must include the `suggestions` array, which allows the EHR to render an "Accept" button.

```json
{
  "cards": [
    {
      "summary": "Lower dose suggested for renal impairment.",
      // ... indicator, source ...
      "suggestions": [
        {
          "label": "Change order to 5mg daily",
          "uuid": "unique-suggestion-id", // Recommended for auditing
          "actions": [
            {
              "type": "update",
              "description": "Adjust medication dose.",
              "resource": {
                "resourceType": "MedicationRequest",
                "id": "original-resource-id",
                "dosageInstruction": [
                  {
                    /* new dosage details... */
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## Test with curl

```bash
curl 'http://localhost:8103/cds-services' -H "Authorization: Bearer $MY_ACCESS_TOKEN"
```

```bash
curl 'http://localhost:8103/cds-services/1214bc96-58ca-4f05-b160-6c2c826247dd' \
 -X 'POST' \
 -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
 -H 'Content-Type: application/fhir+json' \
 --data-raw '{"foo":"bar"}'
```
