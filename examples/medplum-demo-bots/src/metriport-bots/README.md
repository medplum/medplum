# Metriport and Medplum

This folder contains a set of bots that integrate Medplum with Metriport. The integration consists of two bots that work together:

- **Patient Bot** (`metriport-patient-bot.ts`): This bot is triggered when a Medplum `Patient` resource is created or updated. It checks for specific configuration on the `Patient` and its related `Organization` (see "Enabling Metriport Interaction per Patient" below). If configured, it attempts to find/create the patient in Metriport and initiates a consolidated data query. If not configured, it logs a warning and skips Metriport interaction for that patient.
- **Consolidated Data Webhook** (`metriport-consolidated-data-webhook.ts`): This bot receives consolidated data webhooks from Metriport, processes the FHIR Bundle, and upserts the resources into Medplum.

## Prerequisites

- A Medplum account with bot creation permissions.
- A Metriport developer account where you have permissions to the API keys and can configure webhooks.

## Medplum Setup

1. Create your [Medplum Access Policy](https://www.medplum.com/docs/access/access-policies#resource-type). An Access Policy is important because you want to make sure that the system sending webhooks only has the minimal set of permissions needed to function. Example below.

   > [!NOTE]
   > The following example grants access to create all resources using `\*`. For production environments, you might want to specify only a subset of resources (e.g., "Patient", "Observation") relevant to the data received from Metriport.

   ```json
   {
     "resourceType": "AccessPolicy",
     "name": "Metriport Webhook Access Policy",
     "resource": [
       {
         "resourceType": "*"
       }
     ]
   }
   ```

2. Create a [ClientApplication](https://www.medplum.com/docs/auth/methods/client-credentials) in the [Admin Panel](https://app.medplum.com/admin/project) and apply the access policy created above. This ClientApplication will be used by Metriport to authenticate when sending webhooks.

3. Create, build, and [deploy](https://www.medplum.com/docs/bots/bots-in-production#deploying-your-bot) the code of both [Bots](https://www.medplum.com/docs/bots/bot-basics) using the samples in this repository as a base.

### Enabling Patient Creation in Metriport (Optional, Not mandatory)

The Patient Bot (`metriport-patient-bot.ts`) always attempts to match patients in Metriport based on the Medplum `Patient` resource's demographics when triggered. However, to enable the bot to _create_ a patient in Metriport if no match is found, the following conditions must be met for the specific Medplum `Patient` resource:

1.  **Patient Linked to Organization:** The `Patient` resource must have its `managingOrganization` field set to reference a Medplum `Organization` resource.
    ```json
    {
      "resourceType": "Patient",
      // ... other Patient properties
      "managingOrganization": {
        "reference": "Organization/<medplum-organization-id>"
      }
      // ...
    }
    ```
2.  **Organization Contains Metriport Facility ID:** The referenced `Organization` resource must contain an `identifier` with the Metriport Facility ID using the correct system. This Facility ID is required by Metriport when creating a new patient. See the [Metriport API documentation](https://docs.metriport.com/medical-api/api-reference/patient/create-patient) for more information.
    - **Identifier System:** `https://metriport.com/fhir/identifiers/organization-id`
    - **Identifier Value:** The actual Metriport Facility ID (e.g., `0195d964-d166-7226-8912-76934c23c140`)
    ```json
    {
      "resourceType": "Organization",
      // ... other Organization properties
      "identifier": [
        {
          "system": "https://metriport.com/fhir/identifiers/organization-id",
          "value": "<metriport-facility-id>"
        }
        // ... other identifiers if any
      ]
      // ...
    }
    ```

> **Behavior:** When the Patient Bot is triggered, it first attempts to match the patient in Metriport using demographics.
>
> - If a match is found, the bot proceeds to request consolidated data using the existing Metriport patient ID.
> - If no match is found, the bot checks for the `managingOrganization` reference and the Metriport Facility ID on the referenced `Organization`.
>   - If both are present, the bot creates the patient in Metriport and then requests consolidated data.
>   - If either the reference or the identifier is missing, the bot cannot create the patient, logs a warning detailing the missing information, and stops further Metriport processing for this patient update. Check the bot execution logs for these warnings.

## Metriport Setup

1.  Go to [Metriport Developer Dashboard](https://dash.metriport.com/sandbox/developers) (or the production equivalent).

2.  Copy the `API Key` and the `Webhook Key`. Add both as secrets to your [Medplum Project Secrets](https://app.medplum.com/admin/secrets) with the keys `METRIPORT_API_KEY` and `METRIPORT_WEBHOOK_KEY` respectively. These secrets will be accessible by both bots.

3.  Configure the `Webhook URL` in Metriport to point to your deployed `metriport-consolidated-data-webhook` bot endpoint, using the ClientApplication credentials and Bot ID from the Medplum Setup (Steps 2 & 3):

    ```url
    https://<client-application-id>:<client-secret>@api.medplum.com/fhir/R4/Bot/<webhook-bot-id>/$execute
    ```

4.  Click `Save and Test` in the Metriport dashboard to ensure the webhook endpoint is reachable and the `ping` message is handled correctly by the bot.

Once this setup is complete, the bots are deployed. Changes to Medplum `Patient` resources will trigger the patient bot. If a patient meets the criteria described in "Enabling Metriport Interaction per Patient", the bot will interact with Metriport. Otherwise, it will log a warning. Results from successful Metriport queries will be sent via webhook to the consolidated data bot for processing into Medplum.

## Support

For issues related to Medplum, please refer to the [Medplum documentation](https://www.medplum.com/docs) or contact Medplum support in [Discord](https://discord.gg/medplum).

For Metriport-related issues, consult the [Metriport API documentation](https://docs.metriport.com/medical-api).
