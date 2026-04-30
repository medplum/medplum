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

```js {6}
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

### Practitioner Data Model

The `Practitioner` resource in Medplum needs specific identifiers to correctly sync with Health Gorilla and associate the practitioner with the correct lab account numbers.

A Medplum `Practitioner` holds:

- An array of `identifier` with system `http://hl7.org/fhir/v2/0203` and type code `AN`. These are physician-level lab account numbers, one per lab. They are distinguished by `assigner.reference` which points to a Medplum `Organization` reference.
- An `identifier` with the NPI system (required).
- An `identifier` with the Health Gorilla system (written back after enrollment).
- An optional Health Gorilla login extension.

**Important:** The assigner `Organization` in Medplum must have its own identifier with the Health Gorilla system so the bot can resolve it to an `Organization/f-...` reference that Health Gorilla understands.

## Bot Call Patterns

Bots are invoked via `POST /fhir/R4/Bot/$execute?identifier={system}|{value}`.

### Syncing Locations

To sync a practice location to Health Gorilla, you call the `sync-locations` bot. This creates the location in Health Gorilla and writes the `tl-...` ID back to the Medplum `Organization`.

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https://medplum.com/bots|sync-locations" \
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

```bash {10-13}
curl -X POST "https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https://medplum.com/bots|sync-practitioner" \
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

:::caution Known Limitation
Health Gorilla only supports location assignment at `PractitionerRole` creation time. Updates via `PUT` or `PATCH` are silently ignored for the location field. Re-assigning a practitioner to a different location requires re-enrollment.
:::

### Practitioner Sync Bot Flow

The `sync-practitioner` bot performs the following 7 steps on every call to ensure the practitioner is correctly enrolled and updated:

1. **Resolve AN assigners**: Reads each `AN` identifier's assigner `Organization` from Medplum, extracts its Health Gorilla ID, and rewrites `assigner.reference` to `Organization/f-<hgId>`.
2. **Require NPI**: Throws an error if the NPI is missing.
3. **Find or enroll**: Looks up the `PractitionerRole` in Health Gorilla by NPI and tenant. If not found, it calls `enrollClinicalUser` (passing the resolved `AN`s so they are included at creation).
4. **Load Practitioner**: Loads the Health Gorilla `Practitioner` from the role's practitioner reference.
5. **Consistency check**: Writes the Health Gorilla ID back to Medplum if absent. Throws an error if Medplum's stored ID mismatches what Health Gorilla returned.
6. **Sync AN identifiers**: Upserts `AN` identifiers onto the Health Gorilla `PractitionerRole` via the contained Practitioner pattern (`PractitionerRole.contained = [practitioner]`, `PractitionerRole.practitioner = { reference: '#pr' }`).
7. **Sync email telecom**: Uses the same contained-update pattern to sync the practitioner's email.

To take advantage of this flow, add `AN`-typed identifiers to the Medplum `Practitioner`, with each `assigner.reference` pointing at the Medplum `Organization` for that lab. Ensure that the lab `Organization` itself has a Health Gorilla system identifier. The next time the `sync-practitioner` bot runs, it will propagate these identifiers to Health Gorilla automatically.