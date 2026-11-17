Read related on [US Core QuestionnaireResponse](http://hl7.org/fhir/us/core/StructureDefinition-us-core-questionnaireresponse.html) profile.

## Usage

**QuestionnaireResponse** provides a complete or partial list of answers to a set of questions filled when responding to a questionnaire. The questions may be included directly or by reference to a [Questionnaire](/docs/api/fhir/resources/questionnaire) resource that defines the questions as well as the constraints on the allowed answers. In some cases, both formal rules for editing the questionnaire (via link to [Questionnaire](/docs/api/fhir/resources/questionnaire)) as well as sufficient local information to allow rendering of the questionnaire may be provided.

Each time a questionnaire is completed for a different subject or at a different time, a distinct [QuestionnaireResponse](/docs/api/fhir/resources/questionnaireresponse) is generated, though it may be possible for a previously entered set of answers to be edited or updated.

[Questionnaire](/docs/api/fhir/resources/questionnaire) responses cover the need to communicate data originating from forms used in medical history examinations, research questionnaires and sometimes full clinical specialty records. In many systems this data is collected using user-defined screens and forms. [Questionnaire](/docs/api/fhir/resources/questionnaire) responses record specifics about data capture - exactly what questions were asked, in what order, what answers were given, etc. Each of these questions is part of the [Questionnaire](/docs/api/fhir/resources/questionnaire), and as such the [Questionnaire](/docs/api/fhir/resources/questionnaire) is a separately identifiable Resource, whereas the individual questions are not.

Examples of [Questionnaires](/docs/api/fhir/resources/questionnaire) include:

- Past medical history (PMH)
- Family diseases
- Social history
- Research questionnaires and Case report forms (CRFs)
- Quality and evaluation forms
- Patient intake form (e.g. clipboard)
- Insurance claim form

**QuestionnaireResponse** resources can be validated against their corresponding [Questionnaire](/docs/api/fhir/resources/questionnaire) to verify that required groups and questions are answered and that answers fit constraints in terms of cardinality, data type, etc.

## Relationships

The **QuestionnaireResponse** resource captures the responses to a questionnaire, while [Questionnaire](/docs/api/fhir/resources/questionnaire) represents the definition of the questionnaire form, including what questions are asked, how they're organized and the constraints on the allowed answers.

While [Observation](/docs/api/fhir/resources/observation), with its nested `relatedObservation` structure, can create complex hierarchies of questions and answers, the focus is different. First, [Observation](/docs/api/fhir/resources/observation) is used primarily for capturing data elements that are "true" observations - lab measurements, vital signs, social assessments, etc., while **QuestionnaireResponse** can be used to capture any types of data, including data that would typically map to other resources ([Procedure](/docs/api/fhir/resources/procedure), [Patient](/docs/api/fhir/resources/patient), [MedicationStatement](/docs/api/fhir/resources/medicationstatement), etc.). Second, the focus of **QuestionnaireResponse** includes the specific phrasing and organization of the questions. All data must be explicitly captured as a question. With [Observation](/docs/api/fhir/resources/observation), the focus is only on the meaning of the answer, not what question was asked (assuming a question was even asked at all). Additional information such as normal ranges, interpretation, date, etc., may also be captured.
