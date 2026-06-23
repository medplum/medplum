# User Management

This guide describes how to sync practitioners and patients between Medplum and Health Gorilla.

## Practitioner Sync Flow

The `sync-practitioner` bot is responsible for syncing practitioner data between Medplum and Health Gorilla. Health Gorilla tracks enrollment based on the presence of a `PractitionerRole` against the tenant.

The basic process is:

1. **Read NPI**: The integration reads the NPI number from the Practitioner in Medplum. (NPI is unconditionally required).
2. **Check and Enroll**: It checks if the practitioner is already enrolled in your Health Gorilla tenant. If not, it searches the Health Gorilla NPI registry and automatically enrolls them as a clinical user.
3. **Sync Identifiers**: The Health Gorilla ID and login details are saved back to the Medplum `Practitioner`. Health Gorilla ID consistency is validated on every sync.
4. **Sync Lab Account Numbers**: Physician-level lab account numbers (AN identifiers) are resolved and merged into the Health Gorilla `PractitionerRole`.

### Bot Call Pattern

To trigger the sync for a practitioner, you can execute the `sync-practitioner` OperationDefinition on the `Practitioner` resource:

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Practitioner/{id}/\$sync-practitioner" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": []
  }'
```

Alternatively, you can execute the bot directly:

```bash
curl -X POST "https://api.medplum.com/fhir/R4/Bot/$execute?identifier=https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/sync-practitioner" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "practitioner",
        "valueReference": {
          "reference": "Practitioner/{id}" // Reference to the practitioner to sync
        }
      }
    ]
  }'
```

:::info Multiple Locations
If you are operating a Management Services Organization (MSO) or a practice with multiple locations, the sync process involves additional steps for mapping lab account numbers to specific practice locations. See the [Multiple Locations](./multiple-locations) guide for more details.
:::

### Name Matching and Validation

When enrolling a new practitioner, Health Gorilla requires the name to match the NPI registry. The sync bot performs the following validation:

- It searches Health Gorilla by NPI to find the existing record.
- It compares the name in Medplum against the name found in Health Gorilla.
- **Family Name**: Must match exactly (case-insensitive, ignoring leading/trailing whitespace). Suffixes or titles (like "DNP, MSN, APRN") should not be included in the family name unless they are part of the legal name in the NPI registry.
- **Given Name**: The first given name in Health Gorilla (`name.given[0]`) must match either the entire given name string in Medplum, or any individual word within Medplum's given names (case-insensitive). This gracefully handles common variations in middle names and spacing.

If a practitioner has multiple names (e.g., a maiden name), you can add multiple names to the Medplum `Practitioner` resource and set the `use` field appropriately. The bot will check against all names provided in Medplum to find a match with Health Gorilla.

### Physician-Level Lab Account Numbers

Health Gorilla supports physician-level lab account numbers (AN identifiers) which can be synced from Medplum to Health Gorilla during practitioner enrollment and re-sync.

Lab account numbers are modeled as `Identifier` resources on the Medplum `Practitioner` with:
- `type.coding[].system` = `http://hl7.org/fhir/v2/0203` or `http://terminology.hl7.org/CodeSystem/v2-0203`
- `type.coding[].code` = `AN`
- `assigner.reference` pointing at the Medplum `Organization` for the lab (which must itself carry a `HEALTH_GORILLA_SYSTEM` identifier)

```json
{
  "resourceType": "Practitioner",
  "identifier": [
    {
      "type": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
            "code": "AN"
          }
        ]
      },
      "value": "12345",
      "assigner": {
        "reference": "Organization/lab-org-id"
      }
    }
  ]
}
```

On each sync, the bot:
1. Resolves each AN identifier's assigner Organization to a Health Gorilla `Organization/f-...` reference.
2. Merges the resolved ANs into the Health Gorilla `Practitioner` via the contained-Practitioner pattern on `PractitionerRole`.
3. Embeds ANs at initial enrollment so they are present from the moment the clinical user is created.