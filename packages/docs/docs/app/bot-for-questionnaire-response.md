---
sidebar_position: 101
---

# Bot for QuestionnaireResponse

Bots are an advanced Medplum feature that enable complex workflows.

One of the most powerful combos is "Bots" + "Questionnaires".

A FHIR [Questionnaire](/api/fhir/resources/questionnaire) is a customizable form. You can add custom questions, question types, multiple choice options, etc. You can think of a FHIR Questionnaire as a healthcare-specific Google Forms or Survey Monkey.

A Medplum [Bot](./bots) is a snippet of JavaScript code that can run on any resource change (create or update). This JavaScript code has access to a FHIR client, which itself can invoke FHIR operations.

Connecting a Bot to a Questionnaire enables custom workflows that you control top to bottom.

## Example uses

Consider some of these Bot and Questionnaire use cases:

- Patient registration - Create a Patient plus initial [Appointment](/api/fhir/resources/appointment) or [ServiceRequest](/api/fhir/resources/servicerequest)
- Observation entry - From one form, create many [Observation](/api/fhir/resources/observation) and [DiagnosticReport](/api/fhir/resources/diagnosticreport) resources
- Quick ordering - Create shortcut forms for common orders or workflows

These capabilities would normally require writing custom code, HTTP servers, webhooks, and managing credentials for a separate service.

By using Bots, the entire logic is self contained and managed in one place. Like all FHIR resources in Medplum, the Bot resource is versioned with full history tracking, so you can see exactly what changed over time.

## Patient registration example

Let's create 3 resources to demonstrate how this works.

- Questionnaire - the form with a few example inputs for patient registration
- Bot - the logic that processes Questionnaire responses
- Subscription - the link that connects the Questionnaire and the Bot together

We can create all 3 resources using the "Batch Import" feature. Click on the top-left menu. Click on "Batch". Then copy/paste the following bundle:

```json
{
  "resourceType": "Bundle",
  "type": "batch",
  "entry": [
    {
      "fullUrl": "urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb",
      "request": {
        "method": "POST",
        "url": "Questionnaire"
      },
      "resource": {
        "resourceType": "Questionnaire",
        "name": "Patient Registration Demo",
        "title": "New Patient",
        "item": [
          {
            "linkId": "q1",
            "type": "string",
            "text": "Given Name"
          },
          {
            "linkId": "q2",
            "type": "string",
            "text": "Family Name"
          },
          {
            "linkId": "q3",
            "type": "string",
            "text": "Email"
          },
          {
            "linkId": "q4",
            "type": "string",
            "text": "Phone"
          },
          {
            "linkId": "q5",
            "type": "string",
            "text": "Reason for visiting"
          }
        ]
      }
    },
    {
      "fullUrl": "urn:uuid:32178250-67a4-4ec9-89bc-d16f1d619403",
      "request": {
        "method": "POST",
        "url": "Bot"
      },
      "resource": {
        "resourceType": "Bot",
        "name": "Patient Registration Bot",
        "code": "const items = resource.item;\n\nconst [patientOutcome, patient] = await repo.createResource({\n  resourceType: 'Patient',\n  name: [\n    {\n      given: [items[0].answer[0].valueString],\n      family: items[1].answer[0].valueString,\n    },\n  ],\n  telecom: [\n    {\n      system: 'email',\n      value: items[2].answer[0].valueString,\n    },\n    {\n      system: 'phone',\n      value: items[3].answer[0].valueString,\n    }\n  ]\n});\nassertOk(patientOutcome, patient);\nconsole.log('Created patient', patient.id);\n\nconst [serviceRequestOutcome, serviceRequest] = await repo.createResource({\n  resourceType: 'ServiceRequest',\n  status: 'active',\n  subject: createReference(patient),\n  requester: resource.meta.author,\n  reasonCode: [\n    {\n      text: items[4].answer[0].valueString,\n    }\n  ]\n});"
      }
    },
    {
      "fullUrl": "urn:uuid:14b4f91f-1119-40b8-b10e-3db77cf1c191",
      "request": {
        "method": "POST",
        "url": "Subscription"
      },
      "resource": {
        "resourceType": "Subscription",
        "status": "active",
        "criteria": "QuestionnaireResponse?questionnaire=urn:uuid:e95d01cf-60ae-43f7-a8fc-0500a8b045bb",
        "channel": {
          "type": "rest-hook",
          "endpoint": "urn:uuid:32178250-67a4-4ec9-89bc-d16f1d619403",
          "payload": "application/fhir+json"
        }
      }
    }
  ]
}
```

After that, you should have a new Questionnaire available.

If you submit the Questionnaire, it should create a Patient and ServiceRequest accordingly.

## Closer look

Let's look at the JavaScript code for the Bot:

```javascript
const items = resource.item;

const [patientOutcome, patient] = await repo.createResource({
  resourceType: 'Patient',
  name: [
    {
      given: [items[0].answer[0].valueString],
      family: items[1].answer[0].valueString,
    },
  ],
  telecom: [
    {
      system: 'email',
      value: items[2].answer[0].valueString,
    },
    {
      system: 'phone',
      value: items[3].answer[0].valueString,
    }
  ]
});
assertOk(patientOutcome, patient);
console.log('Created patient', patient.id);

const [serviceRequestOutcome, serviceRequest] = await repo.createResource({
  resourceType: 'ServiceRequest',
  status: 'active',
  subject: createReference(patient),
  requester: resource.meta.author,
  reasonCode: [
    {
      text: items[4].answer[0].valueString,
    }
  ]
});
```
