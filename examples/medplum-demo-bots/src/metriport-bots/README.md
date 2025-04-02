# Metriport and Medplum

This folder contains a set of bots that integrate Medplum with Metriport. The integration consists of two bots that work together:

- **Patient Bot** (`metriport-patient-bot.ts`): This bot is used to request medical records from the Metriport Medical API for a given Medplum Patient resource.

- **Consolidated Data Webhook** (`metriport-consolidated-data-webhook.ts`): This bot is used to receive the consolidated data from Metriport with the medical records and process it to create resources in Medplum.

## Prerequisites

- A Medplum account with bot creation permissions
- A Metriport developer account where you have permissions to the API keys

## Medplum Setup

1. Create your [Medplum Access Policy](https://www.medplum.com/docs/access/access-policies#resource-type). An Access Policy is important because you want to make sure that the system sending webhooks only has the minimal set of permissions needed to function. Example below.

> [!NOTE]
> The following example grants access to create all resources using "\*". For production environments, you might want to specify only a subset of resources (e.g., "Patient", "Observation") to follow your use case.

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

2. Create a [ClientApplication](https://www.medplum.com/docs/auth/methods/client-credentials) and apply the access policy from above in the [Admin Panel](https://app.medplum.com/admin/project)

3. Create, build, and [deploy](https://www.medplum.com/docs/bots/bots-in-production#deploying-your-bot) the code of both [Bots](https://www.medplum.com/docs/bots/bot-basics) using the samples in this repository as a base.

4. Apply the access policy from above in the [Admin Panel](https://app.medplum.com/admin/project) to the Consolidated Data Webhook bot `(metriport-consolidated-data-webhook.ts)`.

## Metriport Setup

1. Go to [Metriport Developer Dashboard](https://dash.metriport.com/sandbox/developers)

2. Copy the `API Key` and the `Webhook Key` to add both to the [Medplum Project Secrets](https://app.medplum.com/admin/secrets).

3. For the `Webhook URL` add the following:

```url
https://<client-application-id>:<client-secret>@api.medplum.com/fhir/R4/Bot/<bot-id>/$execute
```

4. Click on `Save and Test`.

Once this endpoint is live, your bot will execute when those webhook events are triggered.

## Support

For issues related to Medplum, please refer to the [Medplum documentation](https://www.medplum.com/docs) or contact Medplum support in [Discord](https://discord.gg/medplum)

For Metriport-related issues, consult the [Metriport API documentation](https://docs.metriport.com/medical-api).
