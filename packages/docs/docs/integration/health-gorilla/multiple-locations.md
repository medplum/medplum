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

### Syncing Locations

To sync a practice location to Health Gorilla, you call the `sync-locations` bot. This creates the location in Health Gorilla and writes the `tl-...` ID back to the Medplum `Organization`.

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/sync-locations" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "location",
        "valueReference": {
          "reference": "Organization/{medplum-org-id}" // Reference to the practice location organization
        }
      }
    ]
  }'
```

### Enrolling Practitioners to a Location

Once the location is synced, you can enroll a practitioner into that specific location by providing the location reference to the `sync-practitioner` bot.

You can execute the `sync-practitioner` OperationDefinition on the `Practitioner` resource:

```bash {10-13}
curl -X POST "https://api.medplum.com/fhir/R4/Practitioner/{id}/\$sync-practitioner" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "location",
        "valueReference": {
          "reference": "Organization/{practice-location-id}" // Reference to the practice location organization
        }
      }
    ]
  }'
```

Alternatively, you can execute the bot directly:

```bash {10-13}
curl -X POST "https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/sync-practitioner" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "practitioner",
        "valueReference": {
          "reference": "Practitioner/{id}" // Reference to the practitioner
        }
      },
      {
        "name": "location",
        "valueReference": {
          "reference": "Organization/{practice-location-id}" // Reference to the practice location organization
        }
      }
    ]
  }'
```

:::caution[Known Limitation]
Health Gorilla only supports location assignment at `PractitionerRole` creation time. Updates via `PUT` or `PATCH` are silently ignored for the location field. Re-assigning a practitioner to a different location requires re-enrollment.
:::
