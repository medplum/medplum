---
sidebar_position: 30
---

# ClientApplication $smart-launch

The `$smart-launch` operation initiates a SMART on FHIR app launch sequence for a `ClientApplication`. This creates a `SmartAppLaunch` context resource and redirects the user to the application's launch URI.

## Use Cases

- **EHR-Embedded App Launching**: Launch SMART apps from within an EHR's clinical workflow context
- **Single Sign-On Integration**: Provide seamless authentication when launching third-party clinical apps
- **Context-Aware App Initialization**: Pass patient or encounter context to SMART apps automatically
- **Patient Portal Integration**: Enable patients to launch apps from their portal with proper authorization

## Invocation

```
GET [base]/ClientApplication/[id]/$smart-launch
POST [base]/ClientApplication/[id]/$smart-launch
```

## Input Parameters

| Parameter | Cardinality | Type | Description |
|-----------|-------------|------|-------------|
| `patient` | 0..1 | `uuid` | The patient ID to include in the launch context |
| `encounter` | 0..1 | `uuid` | The encounter ID to include in the launch context |

**Note:** Only one of `patient` or `encounter` can be specified, not both.

## Output

The operation returns an HTTP redirect (302) to the ClientApplication's `launchUri` with the following query parameters:

| Parameter | Description |
|-----------|-------------|
| `iss` | The FHIR server base URL (e.g., `https://api.medplum.com/fhir/R4/`) |
| `launch` | The ID of the created `SmartAppLaunch` resource |

## Prerequisites

The `ClientApplication` must have a `launchUri` configured. This is the URL where the SMART app expects to receive the launch request.

## Example

### Request

```http
GET /fhir/R4/ClientApplication/my-smart-app/$smart-launch?patient=patient123
```

### Response

```http
HTTP/1.1 302 Found
Location: https://my-smart-app.example.com/launch?iss=https://api.medplum.com/fhir/R4/&launch=launch456
```

### Created SmartAppLaunch Resource

The operation creates a `SmartAppLaunch` resource in the background:

```json
{
  "resourceType": "SmartAppLaunch",
  "id": "launch456",
  "patient": {
    "reference": "Patient/patient123"
  }
}
```

## SMART App Launch Flow

1. **Initiate Launch**: Call `$smart-launch` on the ClientApplication
2. **Redirect**: User is redirected to the app's `launchUri` with `iss` and `launch` parameters
3. **Authorization**: The app uses the `launch` parameter during OAuth authorization to retrieve the launch context
4. **Token Exchange**: After authorization, the app can exchange the code for tokens and retrieve the launch context

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `400 Bad Request` | ClientApplication ID not specified |
| `400 Bad Request` | ClientApplication not configured for launch (missing `launchUri`) |
| `400 Bad Request` | Both `patient` and `encounter` specified (only one allowed) |
| `404 Not Found` | ClientApplication not found |

## Configuration

To enable SMART launch for a ClientApplication, set the `launchUri` field:

```json
{
  "resourceType": "ClientApplication",
  "id": "my-smart-app",
  "name": "My SMART App",
  "launchUri": "https://my-smart-app.example.com/launch"
}
```

## Related Documentation

- [SMART on FHIR Implementation Guide](http://hl7.org/fhir/smart-app-launch/)
- [ClientApplication Resource](/docs/api/fhir/medplum/clientapplication)
- [OAuth and Authentication](/docs/auth)
