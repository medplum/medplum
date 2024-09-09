# Questionnaires & Assessments

Creating, updating and embedding FHIR Questionnaires for both patients and practitioners is a common use-case for Medplum.

- [Medplum app](https://app.medplum.com/Questionnaire) supports creating and updating Questionnaires
- [Questionnaire](https://storybook.medplum.com/?path=/docs/medplum-questionnaireform--basic) react component can be embedded in patient facing or practitioner facing applications
- [QuestionnaireBuilder](https://storybook.medplum.com/?path=/docs/medplum-questionnairebuilder--basic) react component can be embedded in applications as well
- [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse) resources can also be viewed in the [Medplum app](../app/index.md)
- [Bot for QuestionnaireResponse](/docs/bots/bot-for-questionnaire-response/bot-for-questionnaire-response.md) is one of the most common automations
- [Questionnaire Features and Fixes](https://github.com/medplum/medplum/pulls?q=is%3Apr+label%3Aquestionnaires) on Github

## Key Resources

```mermaid

flowchart BT

   Q[<table><thead><tr><th>Questionnaire</th></tr></thead><tbody><tr><td>ICA Assessment</td></tr></tbody></table>]
   subgraph p1 [<i>Patient 1</i>]
  QR1[<table><thead><tr><th>QuestionnaireResponse</th></tr></thead><tbody><tr><td>Homer Simpsons' Response</td></tr></tbody></table>]
  Obs11[<table><thead><tr><th>Observation</th></tr></thead><tbody><tr><td>Heart Rate: 150 bpm</td></tr></tbody></table>] -->|basedOn| QR1
  Obs12[<table><thead><tr><th>Observation</th></tr></thead><tbody><tr><td>BMI: 300</td></tr></tbody></table>] -->|basedOn| QR1
  RA11[<table><thead><tr><th>RiskAssessment</th></tr></thead><tbody><tr><td>Future Fall Risk: 80%</td></tr></tbody></table>] -->|basedOn| QR1
  condition1[<table><thead><tr><th>Condition</th></tr></thead><tbody><tr><td>Hypertension</td></tr></tbody></table>] -->|evidence.detail| QR1
  end

  subgraph p2 [<i>Patient 2</i>]
  QR2[<table><thead><tr><th>QuestionnaireResponse</th></tr></thead><tbody><tr><td>Rick Sanchez's Response</td></tr></tbody></table>]
  Obs21[<table><thead><tr><th>Observation</th></tr></thead><tbody><tr><td>Heart Rate: 190 bpm</td></tr></tbody></table>] -->|basedOn| QR2
  Obs22[<table><thead><tr><th>Observation</th></tr></thead><tbody><tr><td>BMI: 110 </td></tr></tbody></table>] -->|basedOn| QR2
  RA21[<table><thead><tr><th>RiskAssessment</th></tr></thead><tbody><tr><td>Future Fall Risk: 20%</td></tr></tbody></table>] -->|basedOn| QR2
  condition2[<table><thead><tr><th>Condition</th></tr></thead><tbody><tr><td>Diabetes</td></tr></tbody></table>] -->|evidence.detail| QR2
  end

  QR1 --> Q
  QR2 --> Q

```

| **Resource**                                                              | **Description**                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`Questionnaire`](/docs/api/fhir/resources/questionnaire)                 | Definition of questions/answers. 1 per form.                                                                        |
| [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) | A patient's responses to each question. 1 per patient, per instance.                                                |
| [`Observation`](/docs/api/fhir/resources/observation)                     | A structured representation of a point-in-time result measured by an assessment.                                    |
| [`RiskAssessment`](/docs/api/fhir/resources/riskassessment)               | A specialized form of an [`Observation`](/docs/api/fhir/resources/observation) tailored to propensity measurements. |
| [`Condition`](/docs/api/fhir/resources/condition)                         | Records a long-term diagnosis for a [`Patient`](/docs/api/fhir/resources/patient).                                  |

## Key Code Systems

| **Code System**                                                | **Description**                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [LOINC](https://www.medplum.com/docs/careplans/loinc)          | Used to tag questions and answers. Also has predefined standard assessments.              |
| [ICD-10](https://www.cdc.gov/nchs/icd/icd10cm_browsertool.htm) | Used to annotate [`Condition`](/docs/api/fhir/resources/condition) resources for billing. |

## Other Resources

- [Questionnaire Video](https://youtu.be/mOBC0VYtCLE) on Youtube
- [Questionnaire Core Extensions](http://hl7.org/fhir/R4/questionnaire-profiles.html#extensions) - Because of the wide variety of data collection applications, the [`Questionnaire`](/docs/api/fhir/resources/questionnaire) resource has the most "core extensions" of any FHIR resource.
- [Structured Data Capture (SDC) Implementation Guide](http://hl7.org/fhir/uv/sdc/) - A collection of profiles, extensions, and best practices for advanced questionnaire use cases.
  - [Modular Forms](http://hl7.org/fhir/uv/sdc/modular.html) - Reuse sections and questions between questionnaires
  - [Advanced Rendering](http://hl7.org/fhir/uv/sdc/rendering.html) - Additional extensions to inform how a questionnaire is displayed.
- [List of SDC implementations](https://confluence.hl7.org/display/FHIRI/SDC+Implementations) - Wiki page with a number of Form Builders and Form Fillers that implement some part of the SDC guide
