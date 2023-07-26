# Questionnaires

## Questionnaires in Medplum

Creating, updating and embedding FHIR Questionnaires for both patients and practitioners is a common use-case for Medplum.

- [Medplum app](https://app.medplum.com/Questionnaire) supports creating and updating Questionnaires
- [Questionnaire](https://storybook.medplum.com/?path=/docs/medplum-questionnaireform--basic) react component can be embedded in patient facing or practitioner facing applications
- [QuestionnaireBuilder](https://storybook.medplum.com/?path=/docs/medplum-questionnairebuilder--basic) react component can be embedded in applications as well
- [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse) resources can also be viewed in the [Medplum app](../app/index.md)
- [Bot for QuestionnaireResponse](/docs/bots/bot-for-questionnaire-response/bot-for-questionnaire-response.md) is one of the most common automations
- [Questionnaire Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aquestionnaires) on Github

## Other Resources

- [Questionnaire Core Extensions](http://hl7.org/fhir/R4/questionnaire-profiles.html#extensions) - Because of the wide variety of data collection applications, the [`Questionnaire`](/docs/fhir/resources/questionnaire) resource has the most "core extensions" of any FHIR resource.
- [Structured Data Capture (SDC) Implementation Guide](http://hl7.org/fhir/uv/sdc/) - A collection of profiles, extensions, and best practices for advanced questionnaire use cases.
  - [Modular Forms](http://hl7.org/fhir/uv/sdc/modular.html) - Reuse sections and questions between questionnaires
  - [Advanced Rendering](http://hl7.org/fhir/uv/sdc/rendering.html) - Additional extensions to inform how a questionnaire is displayed.
- [List of SDC implementations](https://confluence.hl7.org/display/FHIRI/SDC+Implementations) - Wiki page with a number of Form Builders and Form Fillers that implement some part of the SDC guide
