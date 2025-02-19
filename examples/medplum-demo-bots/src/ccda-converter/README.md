# C-CDA Converter

An example bot using `fast-xml-parser` to parse and ingest a C-CDA into a `Patient` and `Observation` FHIR resources.

## Usage

1. Upload the bot
2. Add a create-only subscription to your project for the `Media` resource that calls the bot

```json
{
  "resourceType": "Subscription",
  "status": "active",
  "criteria": "Media",
  "reason": "Calls the example C-CDA converter bot on creation of a new Media resource.",
  "channel": {
    "type": "rest-hook",
    "endpoint": "Bot/<your_bot_id>"
  },
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction",
      "valueCode": "create"
    }
  ]
}
```

3. Upload a C-CDA as an XML file using the content type `application/cda+xml`

The bot should then parse `Patient` and certain `Observation` resources from uploaded `C-CDA` documents.
