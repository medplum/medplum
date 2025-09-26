# Auto-Responder Bot

A Medplum bot that automatically responds to messages from practitioners in communication threads.

## Overview

The Auto-Responder Bot is a demonstration bot that shows how to create automated responses to FHIR Communication resources. When a practitioner sends a message in a communication thread, this bot automatically generates and sends a predefined response back to the practitioner after each message from the practitioner.

### Setup

1. Deploy the bot to your Medplum instance
2. Create a Subscription resource to trigger the bot on Communication resource creation:
   ```json
   {
     "resourceType": "Subscription",
     "status": "active",
     "reason": "Auto-responder bot trigger",
     "criteria": "Communication",
     "channel": {
       "type": "rest-hook",
       "endpoint": "Bot/<YOUR-BOT-ID>",
       "payload": "application/fhir+json"
     },
     "extension": [
       {
         "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
         "valueCode": "create"
       }
     ]
   }
   ```
3. Ensure proper permissions for the bot to read and create Communication resources

### Running Tests

```bash
npm test auto-responder-bot.test.ts
```

## Example Workflow

1. A practitioner sends a message to a patient in a communication thread
2. The Subscription resource detects the new Communication resource creation
3. The Subscription triggers the bot via the configured webhook endpoint
4. The bot validates that the sender is a practitioner and the message is part of a thread
5. The bot creates an automated response from the patient back to the practitioner
6. The response appears in the same communication thread
7. This process repeats for each subsequent message from the practitioner
