---
sidebar_position: 4
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Prescriber Enrollment

This guide explains how to enroll a new prescriber in DoseSpot via the Medplum **Enroll Prescriber Bot**.

Note: In order to process an invite, the User that executes the bot must be

1. an admin in your project (ProjectMembership.admin)  
2. already have Access to DoseSpot(DoseSpot identifier on your Project Membership)  
3. You must be a Clinician Admin type role in DoseSpot (as specified in the PractitionerRoleTypes parameter)

**This bot can be executed to enroll a Practitioner or update an existing one in DoseSpot.**

<Tabs>
  <TabItem value="ts" label="TypeScript">

```typescript
await medplum.executeBot({system: "https://www.medplum.com/bots", value: "dosespot-enroll-prescriber-bot"}, {
  practitionerId: "ced6426b-ad93-4abe-8e75-1695d956e471",
  practitionerRoleTypes: [1]
});
```
  </TabItem>
  <TabItem value="curl" label="cURL">

```bash
curl 'https://api.medplum.com/fhir/R4/Bot/YOUR_BOT_ID/$execute' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d '{
    "practitionerId": "ced6426b-ad93-4abe-8e75-1695d956e471",
    "practitionerRoleTypes": [1]
  }'
```

  </TabItem>
</Tabs>

## Practitioner Resource Requirements

The Practitioner resource must contain the following fields (extracted automatically by the bot):

| Field | Required | Description | Requirements |
|-------|----------|-------------|--------------|
| `name` | Yes | At least one name entry | - `family`: Last name (required)<br/>- `given`: Array of given names (at least one required) |
| `birthDate` | Yes | Date of birth | Date format (e.g., "1980-05-15") |
| `identifier` | Yes | Must include an NPI identifier | - `system`: `"http://hl7.org/fhir/sid/us-npi"`<br/>- `value`: Valid 10-digit NPI that passes check digit validation |
| `address` | Yes | Address information | Must include: line, city, state, postalCode |
| `telecom` | Yes | Contact information | - Email: `system: "email"`, `value: "email@example.com"`<br/>- Phone: `system: "phone"`, `use: "work"`, `value: "555-123-4567"`<br/>- Fax: `system: "fax"`, `value: "555-123-4568"` |
| `active` | Yes | Boolean indicating if practitioner is active | Defaults to `true` |


<details>
  <summary>Example Practitioner resource</summary>

```json
{
  "resourceType": "Practitioner",
  "id": "ced6426b-ad93-4abe-8e75-1695d956e471",
  "name": [ // Required: At least one name entry
    {
      "family": "Smith", // Required: Last name
      "given": ["Jane", "Marie"], // Required: Array of given names (at least one required)
      "prefix": ["Dr."] // Optional
    }
  ],
  "birthDate": "1980-05-15", // Required: Date of birth
  "identifier": [ // Required: Must include an NPI identifier
    {
      "system": "http://hl7.org/fhir/sid/us-npi", // Required: NPI system identifier
      "value": "1234567893" // Required: Valid 10-digit NPI that passes check digit validation
    }
  ],
  "telecom": [ // Required: Contact information
    {
      "system": "email", // Email contact
      "value": "jane.smith@example.com"
    },
    {
      "system": "phone", // Phone contact
      "use": "work", // Optional: Use case (work, home, etc.)
      "value": "345-123-4567" // Must be valid 10-digit US phone number
    },
    {
      "system": "fax", // Fax contact
      "value": "567-123-4568" // Must be valid 10-digit US phone number
    }
  ],
  "address": [ // Required: Address information
    {
      "line": ["123 Main St", "Suite 100"], // Address line(s)
      "city": "Springfield", // Required: City
      "state": "IL", // Required: State
      "postalCode": "62701" // Required: Postal code
    }
  ],
  "active": true // Required: Boolean indicating if practitioner is active
}
```

</details>

## Bot Input Parameters

The bot requires the following input parameters:

| Parameter | Required | Type | Description | Example/Valid Values |
|-----------|----------|------|-------------|---------------------|
| `practitionerId` | Yes | `string` | The ID of the FHIR Practitioner resource to enroll | `"ced6426b-ad93-4abe-8e75-1695d956e471"` |
| `practitionerRoleTypes` | Yes | `DoseSpotClinicianRoleType[]` (array of numbers) | Array of role types for the clinician in DoseSpot | Valid values:<br/>- `1` - PrescribingClinician<br/>- `2` - ReportingClinician<br/>- `3` - EpcsCoordinator<br/>- `4` - ClinicianAdmin<br/>- `5` - PrescribingAgentClinician<br/>- `6` - ProxyClinician<br/><br/>Example: `[1]` (Prescribing Clinician) or `[1, 4]` (Prescribing Clinician and Clinician Admin) |

:::note
Users that need to be able to invite others should be added with ClinicianAdmin role type.
:::

### EPCS

To invite a prescriber to enroll in EPCS, you must provide the DEA number(s) for the prescriber.

- **Type**: `DoseSpotDeaNumber[]`  
- **Description**: Array of DEA (Drug Enforcement Administration) numbers with state information  
- **Structure**:

```typescript
{
  DEANumber: string;  // Format: ^[A-Za-z]{2}[0-9]{7}$ OR ^[A-Za-z]{1} 9 [0-9]{7}$ OR ^[A-Za-z]{2}[0-9]{7} - [A-Za-z0-9]{1-7}$
  State?: string;      // State DEA number is assigned for (optional)
}
```

- **Example**:

```ts
await medplum.executeBot({system: "https://www.medplum.com/bots", value: "dosespot-enroll-prescriber-bot"}, {
  practitionerId: "ced6426b-ad93-4abe-8e75-1695d956e471",
  practitionerRoleTypes: [1],
  deaNumbers: [
    { DEANumber: "AB1234563", State: "IL" }
  ]
});
```

## Important Validation Notes

### NPI Validation

- **The NPI must be exactly 10 digits**
- For testing purposes, you can use an online NPI generator such as [this one](https://jsfiddle.net/alexdresko/cLNB6)


### Phone and Fax Numbers

- Phone and fax numbers are extracted from the Practitioner `telecom` field  
- They must be valid 10-digit US phone numbers  
- Don't use a phone number that starts with '555-'.

### ProjectMembership

- The Practitioner that is being invited must have an associated ProjectMembership  
- The ProjectMembership must not already have a DoseSpot identifier  
- The DoseSpot clinician ID will be stored on the ProjectMembership after successful enrollment

