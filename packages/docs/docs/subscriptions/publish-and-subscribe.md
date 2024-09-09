---
sidebar_position: 2
tags:
  - subscription
---

import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import ExampleCode from '!!raw-loader!@site/../examples/src/tutorials/api-basics/publish-and-subscribe.ts';

# Publish and Subscribe

In a healthcare setting, Publish and Subscribe is a common pattern. For example, an everyday workflow in a laboratory setting is for a physician to create a lab order for a patient, and then receive a finalized lab report once the sample has been collected from the patient and processed.

In the past, this would have been a scenario where the patient is sent to a lab to get a blood test, and the lab report is faxed back to the doctor who ordered it.

This example will walk through how to technically using FHIR objects and [FHIR Subscriptions](https://www.hl7.org/fhir/subscription.html). For those unfamiliar with FHIR Subscriptions, it is helpful to think of them a kind of webhook that is triggered on changes to a FHIR search filter.

This tutorial will walk through an common clinical example, to demonstrate both the functionality and a use case.

- Create a ServiceRequest that "orders" the lab test
- Update the ServiceRequest it moves through a workflow, for example - the sample is collected, the sample is analyzed, diagnostic report is created etc.
- Create the Observations and DiagnosticReport that corresponds to the ServiceRequest above
- Send a notification to another web application as the ServiceRequest is updated

## Prerequisites

You will need to have a `ClientApplication` and `ClientSecret` in order to get this sample to work via the API. You can find your [ClientApplication](https://app.medplum.com/ClientApplication)s on Medplum.

If you just want to set up the FHIR notifications, you can drive the full workflow through the [Medplum](https://app.medplum.com) webapp by editing the objects from the web application.

## Setting up the "Subscription"

In this example, we will set up the system to send a FHIR Subscription (webhook) to another application every time there is a change to a ServiceRequest.

To set up your [Subscription](https://app.medplum.com/Subscription) page in Medplum and [create a new](https://app.medplum.com/Subscription/new) subscription.

- Make sure to set the `status` of the Subscription to "active" to ensure that the webhook is running
- The `Criteria` section in the setup is what determines the triggering event for notifications. For example you put "ServiceRequest" in the `Criteria` section, all changes to ServiceRequests will generate a notification.
- The `Endpoint` is the place where the subscribing web application URL should be placed. A full JSON representation of the object will be posted to the URL provided.

:::warning Subscriptions on `AuditEvents`

The `Criteria` of a subscription cannot be set to an [`AuditEvent`](/docs/api/fhir/resources/auditevent) resource. When a subscription is triggered it creates an [`AuditEvent`](/docs/api/fhir/resources/auditevent), so using it as criteria would create a notification spiral.

:::

You can find more instructions on setting up a subscription in the [Medplum Bots documentation](/docs/bots/bot-basics#executing-automatically-using-a-subscription).

Before moving on to the rest of the tutorial, **we recommend testing your subscription** by attempting to trigger the webhook and inspect the data. If you have set up your webhook correctly you should see events when you [create a new](https://app.medplum.com/ServiceRequest/new) ServiceRequest or edit an existing [ServiceRequest](https://app.medplum.com/ServiceRequest). You will also see [AuditEvents](https://app.medplum.com/AuditEvent) created for the Subscription.

You can use any endpoint you like, and there are free services like [Pipedream](https://pipedream.com/) that you can use to set up an endpoint for testing purposes.

## Creating the "Order" or ServiceRequest

This section shows how to create a ServiceRequest for a lab test needs that belongs to a Patient using the API. Notably, the snippet below _conditional creates_ (only if patient does not exist) and creates a service request for a lab panel.

<MedplumCodeBlock language="ts" selectBlocks="core-imports,create-service-request">
{ExampleCode}
</MedplumCodeBlock>

Using this code snippet ServiceRequest was created and linked to a Patient. You should be able to see [Patient](https://app.medplum.com/Patient) created here and the [ServiceRequest](https://app.medplum.com/ServiceRequest) created here.

Because the [ServiceRequest](https://app.medplum.com/ServiceRequest) was created, the [Subscription](https://app.medplum.com/Subscription)
that was created in the previous section will trigger a web request to the provided endpoint.

## Updating the status of the ServiceRequest as it moves through the workflow

After the ServiceRequest was created, it needs to be updated continuously as it moves through a workflow. It can be hard to visualize what is happening here, but the way to think about this from a perspective of a Patient getting a lab test.

- A physician orders the test
- The specimen is collected
- The observation is determined by the analyzer and diagnostic report is created

Step 1 above was completed in the previous step, so the next step is to record a specimen collection and link it back to the `ServiceRequest`, and then update the ServiceRequest to indicate that the `Specimen` is available.

Step 2 can be accomplished using the below code snippet:

<MedplumCodeBlock language="ts" selectBlocks='specimen-imports,create-specimen'>
{ExampleCode}
</MedplumCodeBlock>

## Creating an Observation and a DiagnosticReport

Now coming back to the core workflow, now that the specimen is collected, we need to run the samples on the lab instruments and produce the results.

- A physician orders the test - COMPLETE
- The specimen is collected - COMPLETE
- The observation is determined by the analyzer and diagnostic report is created

Usually, this data is generated by a lab instrument or Laboratory Information System (LIS), or comes from a Laboratory provided FHIR interface. After the data is generated, it is important to update the status of the original `ServiceRequest`
<MedplumCodeBlock language="ts" selectBlocks='report-imports,create-report'>
{ExampleCode}
</MedplumCodeBlock>

## In Conclusion

In this example we demonstrated the use of subscriptions and how to set them up for a simple lab workflow. FHIRPath subscriptions are very powerful and can be used to integrate systems with ease. This is similar to the workflow that large commercial labs use, and can be configured with additional features like advanced permissions (only get updates for very specific requests), multiples service types and more.
