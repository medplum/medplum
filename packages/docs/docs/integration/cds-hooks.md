---
sidebar_position: 11
description: CDS Hooks is a standard for surfacing clinical decision support at key points in a clinician's EHR workflow. The EHR fires a hook such as `patient-view` or `order-sign`, sends context to a CDS service, and receives cards with guidance, warnings, or suggested actions.
---

# CDS Hooks

CDS Hooks is a standard for surfacing clinical decision support at key points in a clinician's workflow inside the EHR. The EHR fires a hook such as `patient-view` or `order-sign`, sends context to a CDS service, and receives cards with guidance, warnings, or suggested actions.

Medplum supports implementing [CDS Hooks](https://cds-hooks.hl7.org/) services using Bots.

This page focuses on Medplum's CDS Hooks integration model and API contract. For broader CDS strategy and compliance context, see [Clinical Decision Support](/docs/careplans/clinical-decision-support).

## Overview

Medplum exposes CDS Hooks endpoints and routes hook invocations to configured Bots.

- Discovery endpoint lists CDS services available in the current project.
- Invocation endpoint executes a Bot for a specific CDS service.
- Authentication is required for both endpoints.

## Endpoints

| Endpoint | Method | Path | Purpose |
| --- | --- | --- | --- |
| Discovery | `GET` | `/cds-services` | Returns all configured CDS services visible to the caller. |
| Invocation | `POST` | `/cds-services/{botId}` | Invokes a specific CDS service Bot for a hook event. |

## Configure a Bot as a CDS Service

Configure the Bot's `cdsService` object:

| Field | Required | Description |
| --- | --- | --- |
| `hook` | Yes | CDS hook name such as `patient-view` or `order-sign`. |
| `title` | Yes | Human-readable service title. |
| `description` | Yes | Summary shown to the calling system. |
| `usageRequirements` | No | Optional usage constraints for operators. |
| `prefetch` | No | List of prefetch templates that the client can resolve before invocation. |

### Prefetch Format

Use key/query entries:

```json
{
  "cdsService": {
    "hook": "patient-view",
    "title": "Patient Risk Alerts",
    "description": "Shows contextual risk alerts",
    "prefetch": [
      {
        "key": "patient",
        "query": "Patient/{{context.patientId}}"
      },
      {
        "key": "activeMeds",
        "query": "MedicationRequest?patient={{context.patientId}}&status=active"
      }
    ]
  }
}
```

## Invocation Payloads and Responses

At invocation time, the calling system posts the CDS Hooks request body to `/cds-services/{botId}`. Your Bot should return a CDS Hooks response with `cards`.

Minimal response example:

```json
{
  "cards": [
    {
      "summary": "Patient has elevated fall risk.",
      "indicator": "warning",
      "source": {
        "label": "Medplum Fall Risk Bot"
      }
    }
  ]
}
```

Cards can also include `suggestions` and `actions` where supported by the client.

## Authentication and Access Control

- Use authenticated requests to discovery and invocation endpoints.
- Scope access using [Access Policies](/docs/access/access-policies).
- Follow least-privilege practices for both the calling client and the Bot runtime.

## Quick Test

```bash
curl 'https://api.medplum.com/cds-services' \
  -H "Authorization: Bearer $MEDPLUM_ACCESS_TOKEN"
```

```bash
curl 'https://api.medplum.com/cds-services/<bot-id>' \
  -X POST \
  -H "Authorization: Bearer $MEDPLUM_ACCESS_TOKEN" \
  -H 'Content-Type: application/fhir+json' \
  --data-raw '{"hook":"patient-view","hookInstance":"test","fhirServer":"https://example.com/fhir/R4"}'
```

## Related Reading

- [Clinical Decision Support](/docs/careplans/clinical-decision-support)
- [SMART App Launch](/docs/integration/smart-app-launch)
- [Consuming Webhooks](/docs/bots/consuming-webhooks)
