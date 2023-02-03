---
sidebar_position: 7
---

# Integrating Logistics

Adding a logistics provider which ships packaged goods is a common need for medical apps and services. Common shipments include:

- At home lab tests
- Durable Medical Equipment (DME) sent to home
- At-home pharmacy

Many compainies use third party logistics (3PL) to do fulfillment. Examples of these providers are [Fulfulled By Amazon (FBA)](https://sell.amazon.com/fulfillment-by-amazon) or [ShipBob](https://product.shipbob.com/) that warehouses inventory and sends goods to customers.

## This guide will show you

- How to integrate with a sample 3PL provider (in this case [Easypost](https://www.easypost.com/))
- How to enable communication between the Easypost (3PL) and Medplum
- How to link your shipments to your medical records stored in FHIR
- Security and compliance best practices for the integration.

## The Workflow

When we this implementation is complete, the whole workflow below will be done in an automated way with without human intervention.

- Update a [ServiceRequest](https://app.medplum.com/ServiceRequest) when a package is shipped to a [Patient](https://app.medplum.com/Patient)'s home
- Link a Tracker url (that shows the delivery history of a package) to a ServiceRequest.
- Receive updates as that shipment moves through the mail service to the Patient via [Easypost Webhooks](https://www.easypost.com/docs/api#webhooks) and update the ServiceRequest accordingly.

## The Implementation

### Account and Policy Setup

- Make sure you have an account on Medplum, if not, [register](https://app.medplum.com/register).
- Make sure you have an account on Easypost, if not, [register](https://www.easypost.com/signup)
- Create a [ClientApplication](https://app.medplum.com/admin/project) on Medplum called "Easypost Webhook".
- (Optional) Create a very restrictive [AccessPolicy](https://app.medplum.com/AccessPolicy) called "Easypost", make it so that the policy only allows readwrite on the ServiceRequest.
- (Optional) In the [ProjectAdmin dashboard](https://app.medplum.com/admin/project) apply the "Easypost" policy to the `ClientApplication` by clicking `Access`.

### Bot Setup

- Linking the logistics system, Easypost, to Medplum is done through [Medplum Bots](https://app.medplum.com/Bot).
- At a high level, webhooks are sent from Easypost to Medplum, updating data in Medplum based on the contents of the Webhook.
- This example assumes that there is a `ServiceRequest` with an identifier that matches the Easypost `shipment_id`.
- This example assumes that the [Easypost Event JSON Object](https://www.easypost.com/docs/api#events) is posted to the Bot endpoint and serves as the data synced between systems. As you can see from the code, it contains a `tracker` object with a `public_url`, a `tracking_code` and other details which we will use to populate the `ServiceRequest`.

- Make the Easypost subscription bot that will listen for webhooks

  - First, [create a bot](https://app.medplum.com/admin/project) called EasyPost Shipment Handler and save it
  - Paste the code below into the Bot you created and save.

  ```js
  export async function handler(medplum, event) {
    const input = event.input;
    // The input is an Easypost Event https://www.easypost.com/docs/api#events
    const reference = input['id'];
    const status = input['status'];
    const description = input['description'];

    // If this is not an Easypost tracker event, let's ignore it
    if (!description.toLowerCase().includes('tracker')) {
      console.log(reference + ' is not a tracking event');
      return;
    }

    const { shipment_id, tracking_code, public_url } = input.result;

    // Find the ServiceRequest that has the Easypost reference
    const serviceRequest = await medplum.searchOne('ServiceRequest', 'identifier=' + shipment_id);

    if (!serviceRequest) {
      console.log('Shipment ServiceRequest not found');
    }

    const result = await medplum.updateResource({
      ...serviceRequest,
      orderDetail: [
        {
          text: 'easypost_tracker',
          coding: [
            {
              system: 'https://www.easypost.com/public_url',
              code: 'public_url',
              display: public_url,
            },
          ],
        },
        {
          text: 'easypost_status',
          coding: [
            {
              system: 'https://www.easypost.com/status',
              code: 'status',
              display: status,
            },
          ],
        },
        {
          text: 'easypost_status',
          coding: [
            {
              system: 'https://www.easypost.com/tracker',
              code: 'tracker',
              display: tracker,
            },
          ],
        },
      ],
    });
  }
  ```

Before moving this bot to production, you should consider the following:

- You should do HMAC signature check as part of your bot to ensure that the request actually came from Easypost.

### Easypost Webhook creation

Next stage is to create a Webhook in Easypost and configure it to connect to Medplum.

- First, create a ClientApplication in Medplum and note the `<client-application-id>` and `<client-secret>`
- Next, create a [Webhook in Easypost](https://www.easypost.com/account/webhooks-and-events). For the URL contstruct it as follows (using the `<bot-id>` from the bot you created in the previous section).

```url
https://<client-application-id>:<client-secret>@api.medplum.com/fhir/R4/Bot/<bot-id>/$execute
```

That's it, you are done! Test a couple of requests by making labels, and you should see the data propagating through the system, with ServiceRequests getting updated as a shiment moves through the mail.
