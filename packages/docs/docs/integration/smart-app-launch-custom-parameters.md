# SMART App Launch with Custom Parameters

Medplum supports custom URL parameters in SMART App Launch flows through FHIR extensions on `ClientApplication` resources. This allows you to include additional context (such as patient identifiers) in the launch URL without modifying code.

## Use Case

Some SMART apps require additional URL parameters beyond the standard `iss` and `launch` parameters. For example, Health Gorilla requires a `patient` parameter containing a patient identifier value.

Instead of hardcoding this logic, you can configure it declaratively using FHIR extensions on your `ClientApplication` resource.

## Extension Structure

Add an extension to your `ClientApplication` resource with the following structure:

```json
{
  "resourceType": "ClientApplication",
  "id": "your-client-id",
  "name": "Your App Name",
  "launchUri": "https://your-app.com/launch",
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/smart-launch-patient-identifier",
      "extension": [
        {
          "url": "system",
          "valueUri": "https://www.healthgorilla.com"
        },
        {
          "url": "parameterName",
          "valueString": "patient"
        }
      ]
    }
  ]
}
```

### Extension Fields

- **`url`**: `https://medplum.com/fhir/StructureDefinition/smart-launch-patient-identifier` - The extension definition URL
- **`system`** (nested extension): The identifier system to look up on the Patient resource (e.g., `"https://www.healthgorilla.com"`)
- **`parameterName`** (nested extension): The URL query parameter name to use (defaults to `"patient"` if not specified)

## Example: Health Gorilla Integration

Here's a complete example for Health Gorilla:

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
      "url": "https://medplum.com/fhir/StructureDefinition/smart-launch-patient-identifier",
      "extension": [
        {
          "url": "system",
          "valueUri": "https://www.healthgorilla.com"
        },
        {
          "url": "parameterName",
          "valueString": "patient"
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
      "value": "da06e767ef08774b83aed58b"
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
   - Checks the `ClientApplication` for the extension
   - If present, extracts the patient identifier using the specified system
   - Adds the identifier value to the launch URL as the specified parameter
   - Redirects to the launch URL

2. The resulting launch URL will look like:
   ```
   https://sandbox.healthgorilla.com/app/patient-chart/launch?iss=https://api.medplum.com/fhir/R4/&launch=da4435ec-5bca-4f18-b4a9-747d71c75369&patient=da06e767ef08774b83aed58b
   ```

## Error Handling

If the patient identifier with the specified system is not found on the Patient resource, a warning notification will be displayed, but the launch will still proceed with the standard `iss` and `launch` parameters.

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

