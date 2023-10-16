# Stripe and Medplum

Many applications use Stripe to process payments, and keeping records of payments in the context of patient records can help streamline your workflow.

At a high level, the integration has the following components:

1. The user initiates a payment on a custom web application or using a [Stripe Payment Link](https://stripe.com/payments/payment-links).
2. A webhook, containing details of the transaction as a [Stripe Event Object](https://stripe.com/docs/api/events/object) are sent to Medplum Bot
3. The Medplum Bot processes the `event` and creates or updates the relevant FHIR resources, e.g. [Invoice](https://www.medplum.com/docs/api/fhir/resources/invoice)

## Medplum Setup

Create your [Medplum Access Policy](https://www.medplum.com/docs/access/access-policies#resource-type), you'll want to include three resource types `Invoice`, `Account` and `Bot` (read-only). An Access Policy is important because you want to make sure that the system sending webhooks only has the minimal set of permissions needed to function. Example below.

```json
{
  "resourceType": "AccessPolicy",
  "name": "Stripe Webhook Access Policy",
  "resource": [
    {
      "resourceType": "Invoice"
    },
    {
      "resourceType": "Account"
    },
    {
      "resourceType": "Bot",
      "readonly": true
    }
  ]
}
```

Create a [ClientApplication](https://www.medplum.com/docs/auth/methods/client-credentials) and apply the access policy from above in the [Admin Panel](https://app.medplum.com/admin/project)

Create your [Bot](https://www.medplum.com/docs/bots/bot-basics) and [deploy](https://www.medplum.com/docs/bots/bots-in-production#deploying-your-bot) the code using the sample in this repository as a base, build and deploy your bot. Apply the access policy from above in the [Admin Panel](https://app.medplum.com/admin/project).

## Stripe Setup

1. Go to [Stripe Webhook](https://dashboard.stripe.com/webhooks) and click the `Add Endpoint`
2. For the `Endpoint URL` add the following

```url
https://<client-application-id>:<client-secret>@api.medplum.com/fhir/R4/Bot/<bot-id>/$execute
```

3. Subscribe to all invoice related events. A [list of event types](https://stripe.com/docs/api/events/types#event_types-invoice.created) is published by Stripe.

Once this endpoint is live, your bot will execute when those webhook events are triggered. You will start seeing [Invoice](https://app.medplum.com/Invoice) resources in your Medplum account.

## Modifying the Bot Logic

The Bot provided is a sample of how to capture a Stripe Invoice as a FHIR Invoice. In practice there are a few types of payment data that are useful to capture and synchronize. Below are some examples, though your implementation may vary based on your billing logic.

1. [SubscriptionScheduleCreated](https://stripe.com/docs/api/subscription_schedules/object) - in this case it may make sense create an [Account](https://www.medplum.com/docs/api/fhir/resources/account) resource associated with the subscription and keep it updated as the subscription moves through its lifecycle (for example, is cancelled or upgraded)
2. [PaymentIntentSuceeded](https://stripe.com/docs/api/payment_intents/object) - these are single payments, and may be useful to create a [PaymentNotice](https://www.medplum.com/docs/api/fhir/resources/paymentnotice) resource to track this item
