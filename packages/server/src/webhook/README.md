## Webhook API

Medplum supports unauthenticated webhooks for integrating with third-party services like Cal.com, eFax, Twilio, and SendGrid.

### Endpoint

```
GET/POST /webhook/{ProjectMembership.id}
```

Where `{ProjectMembership.id}` is the ID of a ProjectMembership resource that references a Bot.

### Requirements

1. Request must include one of the supported signature headers (see below)
2. The ProjectMembership must belong to a Bot resource
3. The Bot must be deployed and active

### Signature Headers

For security, all webhook requests must include one of the following signature headers:

- `X-Signature` - standard generic signature header
- `X-HMAC-Signature` - standard HMAC signature header
- `X-Cal-Signature-256` - Cal.com specific signature header
- `X-Twilio-Email-Event-Webhook-Signature` - Twilio SendGrid specific signature header
- `X-Twilio-Signature` - Twilio specific signature header

### Response

Webhook endpoints return HTTP status codes only:

- 200 OK: The webhook was successfully processed
- 400 Bad Request: Missing signature header or invalid ProjectMembership
- 404 Not Found: ProjectMembership not found

### Setup Guide

1. Create a Bot in your Medplum project
2. Deploy the Bot with your webhook handling code
3. Find the Bot's ProjectMembership ID: `GET /fhir/R4/ProjectMembership?profile=Bot/{botId}`
4. Configure your third-party service to send webhooks to: `https://api.medplum.com/webhook/{projectMembershipId}`
5. Ensure your service is sending one of the required signature headers
