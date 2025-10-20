# Twilio Voice and Medplum

This bot integrates Medplum with Twilio's Programmable Voice API to handle incoming and outgoing voice calls through webhooks. The bot validates incoming requests from Twilio and generates appropriate TwiML responses for call routing.

At a high level, the integration has the following components:

1. A phone call is initiated (either inbound to your Twilio number or outbound from your application)
2. Twilio sends a webhook request to the Medplum Bot with call details
3. The Bot validates the request signature to ensure it's from Twilio
4. Based on the call direction, the Bot generates TwiML to either:
   - **Inbound calls**: Play a greeting message and connect to a client
   - **Outbound calls**: Dial the target number with caller ID

## Prerequisites

- A Medplum account with bot creation permissions
- A Twilio account with a purchased phone number
- Twilio Auth Token and Account SID for webhook validation

## Medplum Setup

1. Create your [Medplum Access Policy](https://www.medplum.com/docs/access/access-policies#resource-type). An Access Policy ensures that the webhook endpoint has only the minimal permissions needed to function. Example below:

   ```json
   {
     "resourceType": "AccessPolicy",
     "name": "Twilio Voice Webhook Access Policy",
     "resource": [
       {
         "resourceType": "Bot",
         "readonly": true
       },
       {
         "resourceType": "ProjectMembership",
         "readonly": true
       }
     ]
   }
   ```

2. Create a [ClientApplication](https://www.medplum.com/docs/auth/client-credentials) in the [Admin Panel](https://app.medplum.com/admin/project) and apply the access policy created above.

3. Create, build, and [deploy](https://www.medplum.com/docs/bots/bots-in-production#deploying-your-bot) your [Bot](https://www.medplum.com/docs/bots/bot-basics) using the code in this repository as a base.

4. Add the following secrets to your [Medplum Project Secrets](https://app.medplum.com/admin/secrets):
   - `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token (used for webhook signature validation)
   - `TWILIO_NUMBER`: Your Twilio phone number (e.g., `+15551234567`)

## Twilio Setup

1. Log into your [Twilio Console](https://console.twilio.com/).

2. Navigate to **Phone Numbers** → **Manage** → **Active numbers** and select your Twilio phone number.

3. Set the webhook URL:

   ```url
   https://api.medplum.com/webhook/<project-membership-id>
   ```

Replace `<project-membership-id>` with the ID of the project membership for your bot.

4. Set the HTTP method to `POST`.

## Extending the Bot

This bot provides a foundation for voice call handling. You can extend it to:

- Route calls based on caller ID or time of day
- Integrate with Medplum `Patient` resources for personalized greetings
- Log call details as FHIR `Communication` resources
- Implement interactive voice response (IVR) menus
- Queue calls or route to available practitioners

## Support

For issues related to Medplum, please refer to the [Medplum documentation](https://www.medplum.com/docs) or contact Medplum support in [Discord](https://discord.gg/medplum).

For Twilio-related issues, consult the [Twilio Voice documentation](https://www.twilio.com/docs/voice) and [TwiML reference](https://www.twilio.com/docs/voice/twiml).
