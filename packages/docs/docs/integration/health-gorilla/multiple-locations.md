---
sidebar_position: 4
---

# Multiple Locations

This guide describes how to work with multiple locations in Health Gorilla. This is especially relevant for Management Services Organizations (MSOs) or practices with multiple clinic locations where different practitioners are assigned to different locations.

## Medplum Data Model

To support multiple locations, you will use `Organization` resources in Medplum to represent both the subtenant and the individual practice locations.

### Subtenant Organization

The subtenant organization represents the top-level entity and links directly to your Health Gorilla subtenant. It should already exist in your setup.

```js
{
  "resourceType": "Organization",
  "identifier": [
    {
      "system": "https://www.healthgorilla.com",
      "value": "t-{hg-subtenant-id}" // Health Gorilla subtenant ID
    }
  ]
}
```

### Practice Location Organization

Each individual practice location is represented by an `Organization` resource that references the subtenant organization via the `partOf` field. This resource uses the `MedplumHealthGorillaPracticeLocation` profile.

```js
{
  "resourceType": "Organization",
  "name": "Foo Health2",
  "partOf": {
    "reference": "Organization/{subtenant-id}" // Reference to the subtenant organization
  },
  "type": [
    {
      "coding": [
        {
          "system": "https://www.healthgorilla.com/fhir/organization-type",
          "code": "PRL" // Practice Location code
        }
      ]
    }
  ],
  "address": [
    {
      "line": ["123 Main St"],
      "city": "SF",
      "state": "CA",
      "postalCode": "94110",
      "country": "USA" // Country is required by Health Gorilla
    }
  ],
  "identifier": [
    {
      "system": "https://www.healthgorilla.com",
      "value": "tl-..." // This is written back after the location is synced
    }
  ]
}
```

## Bot Call Patterns

Bots are invoked via `POST /fhir/R4/Bot/$execute?identifier={system}|{value}`. Alternatively, you can use the corresponding OperationDefinition.

### Creating a Practice Location

To create a practice location in Health Gorilla, execute the `health-gorilla-sync-location` OperationDefinition on the `Organization` resource. This also writes the `tl-...` ID back to the Medplum `Organization`.

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Organization/\$health-gorilla-sync-location" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{ "reference": "Organization/{medplum-org-id}" }'
```

### Linking Practitioners to Locations

Link a practitioner to one or more practice locations by adding a repeatable extension to their Medplum `Practitioner` resource — one entry per linked location:

```js
{
  "resourceType": "Practitioner",
  "extension": [
    {
      "url": "https://medplum.com/integrations/health-gorilla/practitioner-location",
      "valueReference": { "reference": "Organization/{practice-location-id-1}" } // First linked location
    },
    {
      "url": "https://medplum.com/integrations/health-gorilla/practitioner-location",
      "valueReference": { "reference": "Organization/{practice-location-id-2}" } // Second linked location
    }
  ]
}
```

Each extension entry references a Medplum practice-location `Organization` (the same kind described above). This is a one-time setup step, not something to redo per order: once the extension is in place, the `sync-practitioner` bot reads it automatically on every sync—for initial enrollment, for manual re-sync, and for the automatic sync that runs on every lab order submission—so a practitioner's location is a durable fact you set once, not something you specify with each order. If a practitioner's locations change later, update the extension entries; the next sync (or the next order they place) reconciles Health Gorilla to match.

To trigger a sync immediately after setting up the extension, rather than waiting for the practitioner's next order, execute the `sync-practitioner` OperationDefinition on the `Practitioner` resource:

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Practitioner/{id}/\$health-gorilla-sync-practitioner" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{}'
```
