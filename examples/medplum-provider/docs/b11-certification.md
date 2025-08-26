# ONC B11 Certification (315.b.11) - Decision Support Intervention

This document covers the ONC B11 certification (315.b.11) - Decision Support Intervention capability for Medplum to achieve Base EHR designation. This demonstrates the ability to provide clinical decision support interventions that support user decision-making and enable a user to review the basis for the system's recommendations.

## Workflow Overview

The B11 certification workflow consists of three main steps:

1. **Trigger Event**: When a patient encounter occurs, the system automatically evaluates whether the patient meets criteria for a clinical decision support intervention.

2. **Decision Support Alert**: If criteria are met, the system creates a Task resource with a feedback questionnaire, providing evidence-based recommendations and clinical guidance.

3. **User Interaction**: Clinicians can review the alert, provide feedback on its helpfulness, and take action based on the recommendations.

4. **DSI Admin Page**: The DSI admin page provides management capabilities for enabling/disabling DSIs.

## Available Decision Support Intervention

- Colorectal Cancer Screening
  - Trigger: Encounter with status `arrived`
  - Criteria:
    - Patient must be over the age of 45
    - Patient must lack a colonoscopy procedure in the last 5 years
  - Recommendation: [USPSTF Colorectal Cancer Screening Guidelines](https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/colorectal-cancer-screening)
  - Bot: `b11-dsi-colonoscopy-bot`
- Breast Cancer Screening
  - Trigger: Encounter with status `arrived`
  - Criteria:
    - Patient must be a female
    - Patient must be over the age of 40
    - Patient must lack a mammography procedure in the last 2 years
  - Recommendation: [USPSTF Breast Cancer Screening Guidelines](https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening)
  - Bot: `b11-dsi-mammography-bot`

## Getting Started

See the [main README](../README.md#getting-started) for installation and setup instructions.

## Bots

| Bot Name                  | Description                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `b11-dsi-colonoscopy-bot` | Automatically triggers colonoscopy screening alerts based on USPSTF guidelines and patient criteria. |
| `b11-dsi-mammography-bot` | Automatically triggers mammography screening alerts based on USPSTF guidelines and patient criteria. |

## Core Data

For each DSI, there is a Subscription resource that needs to be created in the Medplum admin page to trigger the bot.

1. Go to [Subscriptions](https://app.medplum.com/Subscription)
2. Click the `New` button
3. Paste the following JSONs (`Subscription` resources), making sure to replace the `endpoint` value with the actual bot ID:
   a. Subscription for the `b11-dsi-colonoscopy-bot`:
   ```json
   {
     "resourceType": "Subscription",
     "status": "active",
     "reason": "Trigger DSI colorectal screening prompt for any patient over the age of 45 at an encounter and if the patient lacks a colonoscopy procedure complete in the last 5 years",
     "criteria": "Encounter?status=arrived",
     "channel": {
       "type": "rest-hook",
       "endpoint": "Bot/<B11-DSI-COLONOSCOPY-BOT-ID>",
       "payload": "application/fhir+json"
     }
   }
   ```
   b. Subscription for the `b11-dsi-mammography-bot`:
   ```json
   {
     "resourceType": "Subscription",
     "status": "active",
     "reason": "Trigger DSI mammography screening prompt for any female patient over the age of 40 at an encounter and if the patient lacks a mammogram complete in the last 2 years",
     "criteria": "Encounter?status=arrived",
     "channel": {
       "type": "rest-hook",
       "endpoint": "Bot/<B11-DSI-MAMMOGRAPHY-BOT-ID>",
       "payload": "application/fhir+json"
     }
   }
   ```

> [!NOTE]
> For now, the DSI admin page is filtering Subscriptions that contain the `DSI` string in the `reason` field.

The questionnaires resources for the DSI source attributes are available in the [data/core/b11/questionnaires.json](../data/core/b11/questionnaires.json) file.

## DSI Pages

| Page                                               | Description                                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision Support Interventions                     | Allows users to view and enable/disable DSIs.                                                                                                                                          |
| Feedback Export                                    | Allows users to view and export feedback from the Task resources.                                                                                                                      |
| Predictive DSI Source Attributes Questionnaire     | Allows users to submit responses to the Predictive DSI Source Attributes Questionnaire.                                                                                                |
| Evidence-Based DSI Source Attributes Questionnaire | Allows users to submit responses to the Evidence-Based DSI Source Attributes Questionnaire.                                                                                            |
| Integrations                                       | Allows users to view and create ClientApplication resources that are used to simply represent the integrations with the DSI. It does not actually integrate with any external systems. |

## Workflow for Testing

Besides this application, it is possible to test the DSI functionality by running the Provider App. Once you have the Bots and Subscriptions created, you can run the Provider App (local or hosted).

1. Create the necessary resources to meet the DSI criteria.
2. Review the Task resource in the Tasks interface.
3. Provide feedback on the Task resource.
4. Toggle the DSI status in the DSI admin page to verify that the Task is not created when the DSI is disabled.

## Useful Links

- [Medplum DSI Overview](https://docs.google.com/document/d/1aKa8N6ArTZyh_jNRw_J41LdN_KkkQnLp/edit)
- [Medplum DSI Source Attributes Questionnaires](https://docs.google.com/spreadsheets/d/18TqkIsvTVAX6ZJjuyOWi8vdlCEmAUSor/edit)
