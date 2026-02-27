# Sick Note Questionnaire Bot

A Medplum bot that automatically generates PDF sick notes from questionnaire responses with digital signature support.

## Overview

The Sick Note Questionnaire Bot is a demonstration bot that shows how to create automated PDF generation from FHIR QuestionnaireResponse resources. When a practitioner completes a sick note questionnaire, this bot automatically generates a professional PDF sick note with digital signature support and creates a DocumentReference linking to the generated document.

### Setup

1. Deploy the bot to your Medplum instance
2. Upload the questionnaire bundle to create the Questionnaire resource
3. Create a Subscription resource to trigger the bot on QuestionnaireResponse resource creation:
   ```json
   {
     "resourceType": "Subscription",
     "status": "active",
     "reason": "Sick note questionnaire bot trigger",
     "criteria": "QuestionnaireResponse?questionnaire=Questionnaire/sick-note-questionnaire",
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
4. Ensure proper permissions for the bot to read Patient, Practitioner, and create DocumentReference resources

### Running Tests

```bash
npm test sick-note-questionnaire-bot.test.ts
```
