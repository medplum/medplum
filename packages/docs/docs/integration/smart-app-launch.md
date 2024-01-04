# SMART App Launch

Medplum is an open source implementation of [SMART App Launch 2.0.0](https://www.hl7.org/fhir/smart-app-launch/). This guide will walk through how to set up and test your SMART App Launch links and test your application.

## Configuring your application

- Create your [Client Application](https://app.medplum.com/admin/clients) in your Medplum project
- Add the `JWKS URI`, `Redirect URI` and `Launch URI` to the Client Application and save

In the example below, this application is configured to launch Inferno, the testing tool for SMART App Launch.

```json
{
  "resourceType": "ClientApplication",
  "name": "Inferno Client",
  "id": "<id here>",
  "secret": "<secret here>",
  "redirectUri": "https://inferno.healthit.gov/suites/custom/smart/redirect",
  "jwksUri": "https://inferno.healthit.gov/suites/custom/g10_certification/.well-known/jwks.json",
  "launchUri": "https://inferno.healthit.gov/suites/custom/smart/launch"
}
```

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
- [Inferno](https://inferno.healthit.gov/) reference application with [source](https://github.com/onc-healthit/inferno-program)
- [ONC Compliance Documentation](/docs/compliance/onc)
- [Smart App Launch Link](https://storybook.medplum.com/?path=/story/medplum-smartapplaunchlink--basic) on Storybook
