# Upload and Use Questionnaires

This tutorial will walk through how to create a [Questionnaire](https://app.medplum.com/Questionnaire?_count=20&_fields=id,_lastUpdated,name,subjectType&_offset=0&_sort=-_lastUpdated) and generate a [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse?_count=20&_fields=id,_lastUpdated,author,subject&_offset=0&_sort=-_lastUpdated) using the Medplum console app. The `Questionnaire` and `QuestionnaireResponse` resources are very common in implementations and are used to drive patient-facing and provider-facing experiences.

## Upload Questionnaire

First, download your questionnaire from [questionnaire-bundle.json](https://drive.google.com/file/d/1oiFZSnXcloFO9uQP6YMts7KCwCqLNqHV/view?usp=sharing), this is a very simple Questionnaire that asks for the Patient's weight in pounds.

You'll notice that in this example [Questionnaire.subjectType](/docs/api/fhir/resources/questionnaire) is Patient.

Upload [questionnaire-bundle.json](https://drive.google.com/file/d/1oiFZSnXcloFO9uQP6YMts7KCwCqLNqHV/view?usp=sharing) on the [Batch Upload](https://app.medplum.com/batch) tool on the Medplum app and wait until you see confirmation of success.

## View Questionnaire

Second, navigate to the [Questionnaires](https://app.medplum.com/Questionnaire?_count=20&_fields=id,_lastUpdated,name,subjectType&_offset=0&_sort=-_lastUpdated) on your Medplum App and click on the Questionnaire you just uploaded.

Familiarize yourself with the Questionnaire tool - you can see a `Preview`, add items to the questionnaire through the `Builder` and more.

## Try Questionnaire

To fill out the Questionnaire, navigate to the Patient on your Medplum app and click on any Patient. You'll see an `Apps` tab on the Patient which is were all Questionnaires where `subjectType` is `Patient`.

Click on the link and fill out the Questionnaire.

:::tip Other resource types
Questionnaires are general purpose and can have a subjectType that is any resource. Common workflows include adding `Encounter` or `DiagnosticReport` as a `subjectType` for a [Questionnaire](/docs/api/fhir/resources/questionnaire).
:::

## View QuestionnaireResponse

Once you have filled out your Questionnaire, a QuestionnaireResponse will be generated, which we recommend looking at on the [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse?_count=20&_fields=id,_lastUpdated,author,subject&_offset=0&_sort=-_lastUpdated) of your Medplum app.

The [QuestionnaireResponse](/docs/api/fhir/resources/questionnaireresponse) resource is often the basis for automation, and contains a structured representation of the answers to the questionnaire, as well as the author and which questionnaire generated it.

## Next Steps

Questionnaires are very powerful when embedded in custom applications and [paired with Bots](/docs/bots/bot-for-questionnaire-response). The Medplum App is a good example of use of a Questionnaire in an application and [related commits](https://github.com/medplum/medplum/pulls?q=is%3Apr+is%3Aclosed+label%3Aquestionnaires) can be useful for context.

There are bots in the [medplum-demo-bot repository](https://github.com/medplum/medplum-demo-bots/tree/main/src/examples/questionnaire-bots) that show examples of how to create common FHIR resources like `Observation` or `Condition` from QuestionnaireResponse resources.

## Related Resources

- [Download Questionnaires](https://lhcformbuilder.nlm.nih.gov/) that have LOINC codes from NIH - includes many common assessments like PHQ-9, Activities of Daily living and more
