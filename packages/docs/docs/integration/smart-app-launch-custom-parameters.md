# SMART App Launch with Custom Parameters

Medplum supports custom URL parameters in SMART App Launch flows through FHIR extensions on `ClientApplication` resources. This allows you to include additional context (such as patient identifiers, resource IDs, or static values) in the launch URL without modifying code.

## Use Case

Some SMART apps require additional URL parameters beyond the standard `iss` and `launch` parameters. For example, Health Gorilla requires a `patient` parameter containing a patient identifier value.

Instead of hardcoding this logic, you can configure it declaratively using FHIR extensions on your `ClientApplication` resource.

## Extension Structure

You can add multiple extensions to your `ClientApplication`, each defining one custom URL parameter. Each extension has the following structure:

```json
{
  "resourceType": "ClientApplication",
  "id": "your-client-id",
  "name": "Your App Name",
  "launchUri": "https://your-app.com/launch",
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter",
      "extension": [
        {
          "url": "name",
          "valueString": "patient"
        },
        {
          "url": "sourceType",
          "valueString": "patientIdentifier"
        },
        {
          "url": "system",
          "valueUri": "https://www.healthgorilla.com"
        }
      ]
    }
  ]
}
```

### Extension Fields

- **`url`**: `https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter` - The extension definition URL (can be repeated for multiple parameters)
- **`name`** (nested extension, required): The URL query parameter name (e.g., `"patient"`, `"encounter"`, `"orgId"`)
- **`sourceType`** (nested extension, required): Where to get the parameter value from. Valid values:
  - `"patientIdentifier"` - Extract from Patient resource identifier with specified system
  - `"encounterIdentifier"` - Extract from Encounter resource identifier with specified system
  - `"patientId"` - Use the Patient resource ID
  - `"encounterId"` - Use the Encounter resource ID
  - `"static"` - Use a static value from the `value` field
- **`system`** (nested extension, required for identifier sources): The identifier system to look up (e.g., `"https://www.healthgorilla.com"`)
- **`value`** (nested extension, required for static sources): The static value to use when `sourceType` is `"static"`

## Example: Health Gorilla Integration

Here's a complete example for Health Gorilla that adds a `patient` parameter with the Health Gorilla identifier:

```json
{
  "resourceType": "ClientApplication",
  "id": "health-gorilla-client",
  "name": "Health Gorilla Patient Chart",
  "description": "Launch Health Gorilla patient chart from Medplum",
  "redirectUris": [
    "https://sandbox.healthgorilla.com/app/patient-chart/redirect"
  ],
  "launchUri": "https://sandbox.healthgorilla.com/app/patient-chart/launch",
  "jwksUri": "https://sandbox.healthgorilla.com/.well-known/jwks.json",
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter",
      "extension": [
        {
          "url": "name",
          "valueString": "patient"
        },
        {
          "url": "sourceType",
          "valueString": "patientIdentifier"
        },
        {
          "url": "system",
          "valueUri": "https://www.healthgorilla.com"
        }
      ]
    }
  ]
}
```

## Multiple Parameters Example

You can define multiple custom parameters by adding multiple extensions. Here's an example with both a patient identifier and a static organization ID:

```json
{
  "resourceType": "ClientApplication",
  "name": "Multi-Parameter App",
  "launchUri": "https://example.com/launch",
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter",
      "extension": [
        {
          "url": "name",
          "valueString": "patient"
        },
        {
          "url": "sourceType",
          "valueString": "patientIdentifier"
        },
        {
          "url": "system",
          "valueUri": "https://www.healthgorilla.com"
        }
      ]
    },
    {
      "url": "https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter",
      "extension": [
        {
          "url": "name",
          "valueString": "orgId"
        },
        {
          "url": "sourceType",
          "valueString": "static"
        },
        {
          "url": "value",
          "valueString": "my-org-123"
        }
      ]
    }
  ]
}
```

## Patient Resource Requirements

For this extension to work, your Patient resources must have an identifier with the specified system. For example:

```json
{
  "resourceType": "Patient",
  "id": "patient-123",
  "identifier": [
    {
      "system": "https://www.healthgorilla.com",
      "value": "<Health Gorilla ID>"
    }
  ],
  "name": [
    {
      "family": "Doe",
      "given": ["John"]
    }
  ]
}
```

## How It Works

1. When a user clicks the SMART app launch link on a Patient or Encounter page, Medplum:
   - Creates a `SmartAppLaunch` resource
   - Checks the `ClientApplication` for extensions with the `smart-launch-url-parameter` URL
   - For each extension found:
     - Resolves the parameter value based on the `sourceType`:
       - `patientIdentifier` / `encounterIdentifier`: Extracts identifier value from the resource
       - `patientId` / `encounterId`: Uses the resource ID
       - `static`: Uses the provided static value
     - Adds the parameter to the launch URL
   - Redirects to the launch URL

2. The resulting launch URL will look like:
   ```
   https://sandbox.healthgorilla.com/app/patient-chart/launch?iss=https://api.medplum.com/fhir/R4/&launch=da4435ec-5bca-4f18-b4a9-747d71c75369&patient=<Health Gorilla ID>
   ```

## Error Handling

- If a required resource (Patient or Encounter) is missing for a parameter that needs it, a warning notification is displayed and the launch proceeds without that parameter
- If an identifier with the specified system is not found, a warning notification is displayed and the launch proceeds without that parameter
- The launch always proceeds with at least the standard `iss` and `launch` parameters, even if custom parameters cannot be resolved

## Setting Up via Medplum App

1. Navigate to [ClientApplication List](https://app.medplum.com/ClientApplication)
2. Select your `ClientApplication` or create a new one
3. Navigate to the "Edit" tab
4. Add the extension in the JSON editor:
   - Click "JSON" tab
   - Add the extension structure as shown above
   - Save the resource

## Setting Up via API

You can create or update a `ClientApplication` via the FHIR API:

```bash
curl -X PUT "https://api.medplum.com/fhir/R4/ClientApplication/your-client-id" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @client-application.json
```

## Benefits

- **Declarative Configuration**: All configuration stored as FHIR resources, no code changes needed
- **Generalizable**: Works for any app requiring custom parameters
- **Maintainable**: Easy to update or remove without deploying code
- **Standard Compliant**: Uses FHIR extensions following best practices

## Related Documentation

- [SMART App Launch](/docs/integration/smart-app-launch) - General SMART App Launch guide
- [SMART Scopes](/docs/access/smart-scopes) - Access control for SMART apps
- [Apps Tab](/docs/app/apps-tab) - Using the Apps tab in Medplum App

