# SMART App Launch

Medplum is an open source implementation of [SMART App Launch 2.0.0](https://www.hl7.org/fhir/smart-app-launch/). This guide will walk through how to set up and test your SMART App Launch links and test your application.

## Configuring your application

- Create your [Client Application](https://app.medplum.com/admin/clients) in your Medplum project
- Navigate to the [ClientApplication List](https://app.medplum.com/ClientApplication)
- Select your new `ClientApplication`
- Navigate to the "Edit" tab
- Add the `JWKS URI`, `Redirect URI` and `Launch URI` to the Client Application and save

:::tip SMART Launch Configuration
The `launchUri` is the most critical field on the `ClientApplication` resource in the context of a SMART launch. This URI serves as the entry point where Medplum will redirect the user to initiate the authentication handshake.
:::

In the example below, this application is configured to launch Inferno, the testing tool for SMART App Launch.

```json
{
  "resourceType": "ClientApplication",
  "name": "Inferno Client",
  "id": "<id here>",
  "secret": "<secret here>",
  "redirectUri": "[https://inferno.healthit.gov/suites/custom/smart/redirect](https://inferno.healthit.gov/suites/custom/smart/redirect)",
  "jwksUri": "[https://inferno.healthit.gov/suites/custom/g10_certification/.well-known/jwks.json](https://inferno.healthit.gov/suites/custom/g10_certification/.well-known/jwks.json)",
  "launchUri": "[https://inferno.healthit.gov/suites/custom/smart/launch](https://inferno.healthit.gov/suites/custom/smart/launch)"
}
```

## Using Custom Patient and Encounter Identifiers

Some SMART apps require specific external identifiers rather than the Medplum FHIR resource IDs. In these cases, you may need to pass the external system's patient ID or visit ID instead of your internal Medplum resource IDs.

To configure this, add the `launchIdentifierSystems` field to your `ClientApplication` that specifies which identifier systems to use for each resource type:

```json
{
  "resourceType": "ClientApplication",
  "name": "External Smart on FHIR App",
  "launchUri": "https://example.com/app/patient-chart/launch",
  "launchIdentifierSystems": [
    {
      "resourceType": "Patient",
      "system": "https://example.com/patient-id"
    },
    {
      "resourceType": "Encounter",
      "system": "https://example.com/visit-id"
    }
  ]
}
```

You can specify identifier systems for `Patient`, `Encounter`, or both. When `launchIdentifierSystems` is configured:

1. The `SmartAppLaunchLink` component looks up the resource's identifier with the specified system for each configured resource type
2. The identifier is stored in the `SmartAppLaunch` resource's reference (e.g., `patient.identifier` or `encounter.identifier`)
3. The OAuth token response returns the identifier value instead of the FHIR resource ID for the configured resource types

For this to work, your resources must have identifiers with the matching systems:

**Patient with identifier:**
```json
{
  "resourceType": "Patient",
  "name": [{ "given": ["John"], "family": "Smith" }],
  "identifier": [
    {
      "system": "https://example.com/patient-id",
      "value": "0e4af968e733693405e943e1"
    }
  ]
}
```

**Encounter with identifier:**
```json
{
  "resourceType": "Encounter",
  "status": "finished",
  "class": { "code": "AMB" },
  "identifier": [
    {
      "system": "https://example.com/visit-id",
      "value": "VISIT-12345"
    }
  ]
}
```

The SMART app will then receive the external identifiers (e.g., `0e4af968e733693405e943e1` for patient, `VISIT-12345` for encounter) in the token response, allowing seamless integration with external systems.

## Registering Patients

To test, you will need to have registered patients in your user account with credentials to sign in. You can [invite a patient](https://app.medplum.com/admin/invite) from your admin panel, remember to select "Patient" in the drop down at the top of the page.

## Launching from Medplum App

Once you have saved your application you can launch it from the apps section of the `Patient` resource page or `Encounter` resource page. For example:

- Navigate to the [Patient](https://app.medplum.com/Patient/) page and click on one of the patients in the list
- Navigate to the `Apps` tab of for a specific patient, the URL should look like this `https://app.medplum.com/Patient/<id>/apps`
- You should see the Client Credential application you generated above as a launch link on the apps tab.
- Click on the link and you will be prompted to re-authenticate with the patient credentials.

The same launch links will be available on the [Encounter](https://app.medplum.com/Encounter/) resource page. You can browse your [SMART Launch History](https://app.medplum.com/SmartAppLaunch?_count=20&_fields=id,patient,encounter,_lastUpdated&_offset=0&_sort=-_lastUpdated) form the Medplum app.

## Launching from a React component

In addition to supporting Smart app launch from the [Medplum app](/docs/app), implementors can also embed Smart App Launch Links into their own custom applications. To see an example of how that works, refer to the [Smart App Launch Link](https://storybook.medplum.com/?path=/story/medplum-smartapplaunchlink--basic) react component.

## Related Reading

- [SMART Scopes](/docs/access/smart-scopes) access control guide
- [SMART-on-FHIR sample application](https://github.com/medplum/medplum/tree/main/examples/medplum-smart-on-fhir-demo) on GitHub
- [Inferno](https://inferno.healthit.gov/) reference application with [source](https://github.com/onc-healthit/inferno-program)
- [ONC Compliance Documentation](/docs/compliance/onc)
- [Smart App Launch Link](https://storybook.medplum.com/?path=/story/medplum-smartapplaunchlink--basic) on Storybook
