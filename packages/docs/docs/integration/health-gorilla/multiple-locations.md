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

Each extension entry references a Medplum practice-location `Organization` (the same kind described above). This is a one-time setup step, not something to redo per order: once the extension is in place, the `sync-practitioner` bot reads it automatically on every sync—for initial enrollment, for manual re-sync, and for the automatic sync that runs on every lab order submission—so a practitioner's enrolled locations are a durable fact you set once. (Which of those locations a specific order is placed from is set per order; see [Specifying the Order's Location](#specifying-the-orders-location).) If a practitioner's locations change later, update the extension entries; the next sync (or the next order they place) reconciles Health Gorilla to match.

:::caution
If a practitioner has no linked locations when they are first synced, Health Gorilla enrolls them at **all** of the subtenant's practice locations.
:::

To trigger a sync immediately after setting up the extension, rather than waiting for the practitioner's next order, execute the `sync-practitioner` OperationDefinition with a reference to the `Practitioner` in the request body:

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Practitioner/\$health-gorilla-sync-practitioner" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{ "reference": "Practitioner/{id}" }'
```

## Specifying the Order's Location

Each lab order is placed from one practice location. Health Gorilla uses that location's address, phone, and fax in the header of the order requisition (eReq) sent to the lab, and its address for the ordering physician on the result report. Set the location explicitly on every order. Otherwise, Health Gorilla chooses one for you (see [If No Location Is Specified](#if-no-location-is-specified)).

Pass the location as `requestingLocation` to the [`useHealthGorillaLabOrder`](./sending-orders.md#creating-an-order-form-in-react) hook. It takes the Medplum practice-location `Organization` (or a `Location`), or a reference to it:

```tsx
const labOrderReturn = useHealthGorillaLabOrder({
  patient,
  requester,
  requestingLocation: { reference: `Organization/${practiceLocationId}` }, // or the Organization/Location resource itself
});
```

`createOrderBundle()` records the location on the order, and the `send-to-health-gorilla` bot sends that location's Health Gorilla ID as the order's `authorizedBy` ([Health Gorilla docs](https://developer.healthgorilla.com/docs/diagnostic-network#requestgroup---authorizedby)). `createLabOrderBundle()` from `@medplum/health-gorilla-core` accepts the same `requestingLocation` option. If you create lab orders without these helpers, set the `https://www.healthgorilla.com/fhir/StructureDefinition/requestgroup-authorizedBy` extension (a reference to the location) on the parent order `ServiceRequest` before calling `$health-gorilla-send`. Once the order is `active`, its location cannot be changed.

### Requirements

- The referenced `Organization` must have a Health Gorilla identifier (`https://www.healthgorilla.com|tl-...`), written back by [`$health-gorilla-sync-location`](#creating-a-practice-location). If it is missing, the order is set to `on-hold` and is not sent.
- The ordering practitioner must be enrolled at that location in Health Gorilla (see [Linking Practitioners to Locations](#linking-practitioners-to-locations)). Otherwise, Health Gorilla rejects the order with `Supplied AuthorizedBy is unknown or cannot be used with the specified Author.`
- The address, phone, and fax that print on the requisition come from the location's record in Health Gorilla. Manage these contact details in the Health Gorilla portal.

### If No Location Is Specified

If no location is set on the order, the bot sends the Health Gorilla tenant as `authorizedBy`, and Health Gorilla resolves it to a location itself:

| Practitioner's enrolled locations | Location used on the order                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exactly one                       | That location                                                                                                                                                                            |
| More than one, or all locations   | The subtenant practice itself. The requisition shows the contact details of the first location listed for the practice in Health Gorilla, even if the practitioner is not enrolled there |

When a practitioner works at more than one location, an order without a location can therefore show an unrelated location's address, phone, or fax on the requisition. To avoid this, always set the location on orders from multi-location practices.
