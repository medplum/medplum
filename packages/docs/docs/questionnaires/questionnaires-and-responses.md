import ExampleCode from '!!raw-loader!@site/..//examples/src/questionnaires/questionnaires-and-responses.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Modeling Questionnaires and Responses

Questionnaires are used to organize a collection of questions to gather healthcare information and are modeled in FHIR as a [`Questionnaire`](/docs/api/fhir/resources/questionnaire) resource. The responses to these questions are modeled with the [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) resource.

## Creating a Questionnaire

A [`Questionnaire`](/docs/api/fhir/resources/questionnaire) represents the questions, rules for answering the questions, and metadata used to define what it should be used for. It allows you to create complex forms with nested and conditional questions.

| **Element**   | **Description**                                                                                            | **Code System**                                                                       | **Example**                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `title`       | A _human-readable_ name to identify the `Questionnaire`.                                                   |                                                                                       | US Surgeon General - Family Health Portrait                            |
| `name`        | A _computer-readable_ name to identify the `Questionnaire`.                                                |                                                                                       | USSurgeonGeneralFamilyHealthPortrait                                   |
| `item`        | An object containing the questions and groups of questions. Also includes any rules defined for answering. |                                                                                       | [See below](#defining-the-questions)                                   |
| `subjectType` | The resource types that can be a subject of this `Questionnaire`.                                          |                                                                                       | Patient                                                                |
| `description` | A description of the `Questionnaire`. It can include instructions, examples, comments about misuse, etc.   |                                                                                       | Questions to get a picture of family health and family health history. |
| `purpose`     | An explanation of _why_ the `Questionnaire` is needed.                                                     |                                                                                       | Captures basic family history information.                             |
| `status`      | Defines the stage of its lifecycle a `Questionnaire` is in (e.g. active, in a draft, etc.).                | [Publication Status Codes](https://www.hl7.org/fhir/valueset-publication-status.html) | draft                                                                  |

### Defining the Questions

The actual questions on a [`Questionnaire`](/docs/api/fhir/resources/questionnaire) are defined in the `item` element. This element allows you to structure your questions both as individual questions and in groups. You can also provide additional context or instructions on how the questions should be answered.

One of the most important properties in the `item` is `linkId`, which is used to link the questions to the corresponding answers on a [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) resource. These must all be unique within the [`Questionnaire`](/docs/api/fhir/resources/questionnaire) to ensure that there is no ambiguity.

| **Property**      | **Description**                                                                                                                         | **Example**                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `linkId`          | A unique identifier within the `Questionnaire` that maps directly to the answer for the equivalent `item` on a `QuestionnaireResponse`. | gender                                     |
| `text`            | The text of the question or name of a group of questions.                                                                               | What is your date of birth?                |
| `type`            | The type of `item` this is. This could be a group, or could refer to the datatype that is used to answer the question.                  | date                                       |
| `item`            | Another `item` used when making groups or nested questions.                                                                             | [See below](#nesting-questions)            |
| `answerValueSet`  | A reference to an external value set containing possible answers for the question.                                                      | http://hl7.org/fhir/ValueSet/yesnodontknow |
| `answerOption`    | An array of possible answers for the question.                                                                                          |                                            |
| `initial`         | A value that will pre-populate a free-form field when the question renders.                                                             | 1970-01-01                                 |
| `initialSelected` | A value that will pre-populate the field of an `answerOption` type question when the question renders.                                  | male                                       |
| `required`        | A boolean indicating if the question must be answered.                                                                                  | false                                      |
| `repeats`         | A boolean indicating if the question may have more than one associated answer.                                                          | true                                       |

<details>
  <summary>Example: A basic `Questionnaire`</summary>
  <MedplumCodeBlock language="ts" selectBlocks="simpleQuestionnaire">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

### Nesting Questions

The `item` element allows you to group and nest questions together by adding additional sub-questions on the `item.item` field.

To do this, you must set `item.type='group'`. This specifies that the item will not be a question, but instead a group of questions. When defining a group, the `text` property should be a description of the group instead of an actual question.

<details>
  <summary>Example: A `Questionnaire` with nested questions</summary>
  <MedplumCodeBlock language="ts" selectBlocks="nestedQuestionnaire">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

### Defining Rules For Your Questions

FHIR allows you to set rules for your questions beyond just providing options for the answer. The two main rules that you can define are:

- Setting initial values
- Conditionally enabling/disabling certain questions

#### Initial Values

To set an initial value for your question, you can use the `item.initial` or `item.initialSelected` field.

The `initial` property can be set to any value type, but should be the same as the `type` field of the item it is on. It can be overwritten by the user responding to the [`Questionnaire`](/docs/api/fhir/resources/questionnaire), but the value will persist if the user does not change it.

The `initialSelected` field works in the same way, but applies to questions that have an `answerOption` field, and is a property on that field (i.e. `answerOption.initialSelected`). In this case you set an initial choice that is automatically selected when a question renders.

#### Conditionally Displaying Questions

You can conditionally display questions so that they only appear based on a user's answer to a different question. This is done using the `item.enableWhen` field. The `enableWhen` property is an object with properties that define when a question should be displayed.

| **Property** | **Description**                                                                                                                                                | **Code System**                                                                                     | **Example** |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------- |
| `question`   | The `linkId` for the `item` whose answer determines if this `item` will appear.                                                                                |                                                                                                     | gender      |
| `operator`   | The criteria used to determine if the question will appear.                                                                                                    | [Questionnaire Item Operator](https://www.hl7.org/fhir/valueset-questionnaire-enable-operator.html) | =           |
| `answer[x]`  | The value that the referenced question is being tested against using the `operator`. The datatype should match the answer datatype of the referenced question. |                                                                                                     | female      |

<details>
  <summary>Example: A `Questionnaire` with initial values and conditionally rendered questions</summary>
  <MedplumCodeBlock language="ts" selectBlocks="ruledQuestionnaire">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## Creating a Response to a Questionnaire

Once you have created your [`Questionnaire`](/docs/api/fhir/resources/questionnaire), you will need to record responses to it. This is modeled with the [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) resource.

Each [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) represents an _individual response_ to a [`Questionnaire`](/docs/api/fhir/resources/questionnaire). An individual response could be one response per person or the same person responding multiple times to the same [`Questionnaire`](/docs/api/fhir/resources/questionnaire) over the course of their care.

A [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) should link to a specific [`Questionnaire`](/docs/api/fhir/resources/questionnaire). It does not necessarily need to provide answers to each question, but all required questions must be answered.

:::caution Structuring Answers
The answer items in a [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) should follow the same structure in terms of grouping and nesting and adhere to all data types for answers defined in the linked [`Questionnaire`](/docs/api/fhir/resources/questionnaire).
:::

The [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) resource provides fields to define meta data about the responses, such as who provided the answers, recorded the answers, and more.

| **Element**     | **Description**                                                                                                  | **Code System** | **Example**                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| `questionnaire` | The canonical URL of the `Questionnaire` that is being answered by this response.                                |                 | http://example.org/Questionnaires/example-questionnaire |
| `source`        | The individual who provided the answers on this response.                                                        |                 | Patient/homer-simpson                                   |
| `subject`       | Who/what the answers from the response apply to, but not necessarily who actually answered the questions.        |                 | Patient/maggie-simpson                                  |
| `item`          | The responses to the questions.                                                                                  |                 | [See below](#answering-the-questions)                   |
| `author`        | The individual who received and recorded the responses, but not necessarily who actually answered the questions. |                 | Practitioner/receptionist                               |
| `authored`      | The date that the answers were gathered.                                                                         | dateTime        | 2023-11-18                                              |
| `encounter`     | A reference to the `Encounter` that the response is a part of.                                                   |                 | Encounter/maggie-simpson-physical                       |

### Answering the Questions

The answers on a [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) are stored in the `item` element. It is very similar to the `item` element on a [`Questionnaire`](/docs/api/fhir/resources/questionnaire), allowing you to model the responses so that they match the structure of the [`Questionnaire`](/docs/api/fhir/resources/questionnaire) they are answering.

| **Property**      | **Description**                                                                                             | **Example**          |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| `answer.value[x]` | The answer to the question. The datatype should correspond to what is specified in the `Questionnaire.item` | female               |
| `answer.item`     | Any nested answers or groups within the current one. Only used when nesting underneath an answer.           |                      |
| `text`            | The text of the question that is being answered.                                                            | What is your gender? |
| `item`            | An additional item that allows for grouping or nesting answers.                                             |                      |
| `linkId`          | The item from the corresponding `Questionnaire` that this answer responds to.                               | marital-status       |

<details>
  <summary>Example: A `QuestionnaireResponse` responding to the [conditional questionnaire above](#conditionally-displaying-questions)</summary>
  <MedplumCodeBlock language="ts" selectBlocks="response">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

## UI Components

Medplum provides React components to help you view and build [`Questionnaire`](/docs/api/fhir/resources/questionnaire) resources. You can preview the [QuestionnaireForm](https://storybook.medplum.com/?path=/story/medplum-questionnaireform--basic) and [QuestionnaireBuilder](https://storybook.medplum.com/?path=/story/medplum-questionnairebuilder--basic) components in [Storybook](https://storybook.medplum.com/?path=/docs/medplum-introduction--docs).
