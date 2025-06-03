---
sidebar_position: 1000
tags: [bots, subscriptions, auth, security]
---

# Consuming Webhooks

Many SaaS products including popular services like Stripe and Okta support Webhooks, allowing a web application to register a Medplum URL to receive notifications. When a certain event occurs in the source application, such as a new user signup or a change to a record, the source application sends an HTTP POST request to the URL registered by the destination application. This HTTP POST request contains information about the event that occurred.

Medplum [bots](/docs/bots) can be used to listen for webhooks and so keep records synchronized between systems. When another application fires a webhook, it can trigger a Medplum bot using the [$execute](/docs/bots/bot-basics#using-the-execute-endpoint) endpoint.

For an example of a Bot that consumes webhooks, see the [Stripe demo bot](https://github.com/medplum/medplum-demo-bots/tree/main/src/stripe-bots).

## Planning your integration

To get started, find the webhook documentation for the SaaS product you want to connect to Medplum. Find what type of data the webhook will send to Medplum and make note of it. For example, Stripe publishes an [event](https://stripe.com/docs/api/events/object) object specification that outlines the JSON that the webhook will post.

## Creating a Bot

Once you understand the shape of the data you will consume, write a bot to parse the data and create or update the relevant FHIR resources. These bots are varied, but it can help to make a list of which [FHIR resources](/docs/api/fhir/resources) need to be manipulated when the Bot is triggered. The [demo bots repo](https://github.com/medplum/medplum-demo-bots) has examples across use cases

We recommend writing some [unit tests](/docs/bots/unit-testing-bots) as well, and have several samples provided in `medplum-demo-bots` repo that use our `@medplum/mock` library for testing.

### Using TypeScript SDKs in your bot

If the SaaS application that sends webhooks publishes a TypeScript SDK, it's straightforward to add it to your bot, to streamline development. Add the package to the `devDependencies` in the `package.json` of your bot repository and install the dependency, and [example from demo bots repo](https://github.com/medplum/medplum-demo-bots/blob/main/package.json) is available. You can then use the TypeScript SDK when developing your bot.

The [Stripe demo bot](https://github.com/medplum/medplum-demo-bots/tree/main/src/stripe-bots) uses the Stripe TypeScript SDK.

## Creating Access Policies

We recommend making at least one, but probably two Access Policies to enable Webhooks from applications. The reason these policies are important is that the allow the SaaS application to have very minimal access to the data in your Medplum project.

Create an Access Policy that allows read only access to the Bot, like below.

```json
{
  "resourceType": "AccessPolicy",
  "name": "Stripe Webhook Access Policy",
  "resource": [
    {
      "resourceType": "Bot",
      "readonly": true
    }
  ]
}
```

[Create a ClientApplication](/docs/auth/methods/client-credentials) and assign the AccessPolicy above to that application and save.

Create another (optional) one for the bot, that enables only the resources that bot touches and assign it to the bot in your [Admin settings](https://app.medplum.com/admin/project).

```json
{
  "resourceType": "AccessPolicy",
  "name": "Stripe Bot Access Policy",
  "resource": [
    {
      "resourceType": "Invoice"
    },
    {
      "resourceType": "Account"
    }
  ]
}
```

## Configuring Webhooks in another Application

The SaaS application that generates the webhooks will have a configuration for the endpoint url. In some cases they will support basic authentication in the URL itself. Construct one, like below using the client id, secret from the previous section and id of the bot you created.

```bash
https://<client-application-id>:<client-secret>@api.medplum.com/fhir/R4/Bot/<bot-id>/$execute
```

## Authenticating Payloads

Many SaaS applications support signature verification. Their webhook configuration portal will have a place to download a `secret` or `signing secret`. You can store that value in [bot secrets](/docs/bots/bot-secrets) and use it to verify the webhook signature.

## Unauthenticated Webhooks

Medplum supports unauthenticated webhooks for integrating with third-party services. This allows you to receive webhook notifications without requiring authentication credentials in the URL. The webhook endpoint format is:

```
GET/POST /webhook/{ProjectMembership.id}
```

When using unauthenticated webhooks, it's important to implement proper security measures:

1. **Signature Verification**: Always verify the webhook signature using the secret provided by the third-party service. Store this secret in your bot's secrets and use it to validate incoming requests.

2. **IP Whitelisting**: If supported by the third-party service, configure IP whitelisting to only accept requests from known IP addresses.

3. **Rate Limiting**: Implement rate limiting to prevent abuse of your webhook endpoint.

4. **Payload Validation**: Validate the structure and content of incoming webhook payloads before processing them.

To set up an unauthenticated webhook:

1. Create a Bot for the third party service and ensure that the ProjectMembership for the bot has the appropriate AccessPolicy
2. Configure the webhook URL in the third-party service using the format above
3. Implement signature verification in your bot
4. Test the webhook integration using the third-party service's test tools

## Monitoring your integration

As data flows through the system, you can see event logs in your Medplum app as [AuditEvents](https://app.medplum.com/AuditEvent?_count=20&_fields=id,_lastUpdated,entity,type&_offset=0&_sort=-_lastUpdated).
