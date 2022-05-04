
# Integrating Logistics into your EHR

Adding a logistics provider which ships packaged goods is a common need for medical apps and services.  Common shipments include:

* At home lab tests
* Durable Medical Equipment (DME) sent to home
* At-home pharmacy

Many compainies use third party logistics (3PL) to do fulfillment.  Examples of these providers are [Fulfulled By Amazon (FBA)](https://sell.amazon.com/fulfillment-by-amazon) or [ShipBob](https://product.shipbob.com/) that warehouses inventory and sends goods to customers.

## This guide will show you

* How to integrate with a sample 3PL provider (in this case [Easypost](https://www.easypost.com/))
* How to enable communication between the Easypost (3PL) and Medplum
* How to link your shipments to your medical records stored in FHIR
* Security and compliance best practices for the integration.

## The Workflow

When we this implementation is complete, the whole workflow below will be done in an automated way with without human intervention.

* Create a [ServiceRequest](https://app.medplum.com/ServiceRequest) when a package is shipped to a [Patient](https://app.medplum.com/Patient)'s home
* Link a Tracker url (that shows the delivery history of a package) to a ServiceRequest.
* Receive updates as that shipment is sent to the Patient via [Easypost Webhooks](https://www.easypost.com/docs/api#webhooks) and update the ServiceRequest accordingly.
* Receive confirmation that the shipment has arrived (also via Easypost Webhooks).

## The Implementation

### Account and Policy Setup

* Make sure you have an account on Medplum, if not, [register](https://app.medplum.com/register).
* Make sure you have an account on Easypost, if not, [register](https://www.easypost.com/signup)
* Create a [ClientApplication](https://app.medplum.com/admin/project) on Medplum called "Easypost Webhook".
* (Optional) Create a very restrictive [AccessPolicy](https://app.medplum.com/AccessPolicy) called "Easypost", make it so that the policy only allows readwrite on the ServiceRequest.
* (Optional) In the [ProjectAdmin dashboard](https://app.medplum.com/admin/project) apply the "Easypost" policy to the `ClientApplication` by clicking `Access`.

### Bot Setup

* Linking the logistics system, Easypost, to Medplum is done through [Medplum Bots](https://app.medplum.com/Bot).
* At a high level, webhooks are sent from Easypost to Medplum, updating data in Medplum based on the contents of the Webhook.
* This example assumes that there is a `ServiceRequest` with an identifier that matches the Easypost `reference`.

* Make the Easypost subscription bot that will listen for webhooks
  * First, [create a bot](https://app.medplum.com/Bot/new) called EasyPost Shipment Handler and save it
  * Paste the code below into the Bot you created and save.

  ```js
  //Grab the reference and the tracker object out of the Easypost Shipment json
  const reference = input.get('reference');
  const tracker = input.get('tracker');
  const status = tracker.get('status');
  const public_url = tracker.get('public_url');

  //Find the ServiceRequest that has the Easypost reference
  const serviceRequest = await medplum.readResource('ServiceRequest', reference);

  if (!serviceRequest) {
    const to_address = input.get('to_address');
    const shipmentAddress = await medplum.createResource({
      resourceType: 'Location',
      identifier: [{
        system: 'https://www.easypost.com/address',
        value: to_address.get('id');
      }],
      name: to_address.get('name');
      address: {
        use: 'home',
        type: 'physical',
        line: [to_address.get('street1'), to_address.get('street2')],
        city: to_address.get('city'),
        state: to_address.get('state'),
        postalCode: to_address.get('zip'),
        country: to_address.get('country')
      }
    })
    const newServiceRequest = await medplum.createResource({
    resourceType: 'ServiceRequest',
      identifier: [{
        system: 'https://www.easypost.com/reference',
        value: reference
      }],
      location: shipmentAddress, 
      orderDetail: [
        {"text": "easypost_tracker",
        "coding": [
          {
            "system": "https://www.easypost.com/tracker",
            "code": 'tracker',
            "display": public_url
          }
        ]
        },
        {"text": "easypost_status",
        "coding": [
          {
            "system": "https://www.easypost.com/status",
            "code": 'status',
            "display": status
          }
        ]
        }
      ] 
    });
  } else {
    const result = await medplum.updateResource({
    resourceType: 'ServiceRequest',
      identifier: [{
        system: 'https://www.easypost.com/reference',
        value: reference
      }],
      orderDetail: [
        {"text": "easypost_tracker",
        "coding": [
          {
            "system": "https://www.easypost.com/tracker",
            "code": 'tracker',
            "display": public_url
          }
        ]
        },
        {"text": "easypost_status",
        "coding": [
          {
            "system": "https://www.easypost.com/status",
            "code": 'status',
            "display": status
          }
        ]
        }
      ] 
    });
  }
  return ok;
  ```

Before moving this bot to production, you should consider the following:

* You should do HMAC signature check as part of your bot to ensure that the request actually came from Easypost.
* Use throwaway identifiers to map the ServiceRequests to the Easypost shipments.  ServiceRequests support multiple identifiers, so in this case it is recommended to make one especially for Easypost usage, or tag the ServiceRequest with the `shipment_id` as shown in this example.

### Easypost Webhook creation

Next stage is to create a Webhook in Easypost and configure it to connect to Medplum.

* First, create a ClientApplication in Medplum and note the `<client-application-id>` and `<client-secret>`
* Next, create a [Webhook in Easypost](https://www.easypost.com/account/webhooks-and-events).  For the URL contstruct it as follows (using the `<bot-id>` from the bot you created in the previous section).

```url
https://<client-application-id>:<client-secret>@api.medplum.com/fhir/R4/Bot/<bot-id>/$execute
```

That's it, you are done!  Test a couple of requests, and you should see the data propagating through the system, with ServiceRequests getting updated as a shiment moves through the system.