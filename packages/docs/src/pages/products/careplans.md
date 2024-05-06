---
sidebar_label: Care Plans
sidebar_position: 5
---

# Care Plans

Medplum supports creating, managing and instantiating care plans for patients. Care plans go by many different names: care pathway, care journey, clinical protocol, onboarding or workflow. **In principle, care plans describe a set of actions required as part of a patient's care.**

In practice, there are two parts to care plans, (1) designing them and (2) applying them to patients and tracking adherence to the plan.

There are simple implementations of care plans, and they can get very complex - contact us at hello@medplum.com if you would like to discuss your specific plan.

## Designing Care Plans

Medplum supports creating a wide variety of care plans, from very simple ones to complex ones with branching logic and detailed workflows. To get started we recommend thinking of building a care plan as a checklist - one type of plan has a set of actions that belong to it, for example a simple care plan might have a patient (1) fill out an onboarding questionnaire, (2) schedule their first appointment, (3) take a lab test.

One way to think of a Care Plan protocol is an "order-able service" off of a service menu.

- **Defining a Plan**: care plan protocols are represented by [PlanDefinition](https://app.medplum.com/PlanDefinition/) FHIR objects, and objects have actions, which are like the checklist items. It may be useful to look at the [Plan Definition Builder on Storybook](https://storybook.medplum.com/?path=/docs/medplum-plandefinitionbuilder--basic) to get a visual representation.
- **Defining an Action**: each care plan protocol has multiple options. Common ones are scheduling an appointment, prescribing a medication or filling out a questionnaire. These are modeled as [ActivityDefinitions](https://app.medplum.com/ActivityDefinition), [Questionnaires](https://app.medplum.com/Questionnaire), [Schedule](https://app.medplum.com/Schedule) and can be created on app.medplum.com or via API.
- **Timing and Location**: each action should have a sense of timing, either relative (3 days after milestone) or absolute (on a patients' 18th birthday)
- **Tagging and Organizing**: Tagging your PlanDefinition objects, ActivityDefinition objects, Schedules and Questionnaires with the appropriate metadata is generally a best practice. For example, `ActivityDefinition.code` being a LOINC, SNOMED or ICD-9/10 code can be beneficial as well as `ActivityDefinition.useContext`.

## Applying Care Plans to Patients

Once care plans are designed, the next step is to create all the relevant resources when a care plan is instantiated for a specific patient. The FHIR [CarePlan](https://app.medplum.com/CarePlan) object serves as a high level object that refers to related resources. Items that belong to that instantiation of the CarePlan are linked in a [RequestGroup](https://app.medplum.com/RequestGroup). The care plan should refer to a specific patient, and the appropriate responsible party such as practitioner or care team should be appropriately tracked. The correct creation of the CarePlan and RequestGroup is referred to in FHIR terms as the **apply** operation.

- **Simple Care Plans**: are relatively straightforward to create, and we have provided sample implementations for your convenience. [RequestGroup sample in storybook](https://storybook.medplum.com/?path=/docs/medplum-requestgroupdisplay--simple).
- **Linking objects**: a CarePlan should have a RequestGroup, and the RequestGroup can have one or more actions in an implementation. Commonly, each of the actions in the RequestGroup can drive automations or integrations. Sample code for [creating care plans](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts).

## Care Plans and Care Teams

CarePlans have roles that help aid in workflow and are used to drive notifications, dashboards and the like. `CarePlan.author`, `CarePlan.contributor`, `CarePlan.careTeam` and `CarePlan.goal` should all be used in service of workflow and to ensure coordination.

## FHIR Resources for CarePlan Design

| Resource           | App Link                                               | Create New                                                   | API Documentation                                  |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------- |
| PlanDefinition     | [View All](https://app.medplum.com/PlanDefinition)     | [Create New](https://app.medplum.com/PlanDefinition/new)     | [API](/docs/api/fhir/resources/plandefinition)     |
| ActivityDefinition | [View All](https://app.medplum.com/ActivityDefinition) | [Create New](https://app.medplum.com/ActivityDefinition/new) | [API](/docs/api/fhir/resources/activitydefinition) |
| Schedule           | [View All](https://app.medplum.com/Schedule)           | [Create New](https://app.medplum.com/Schedule/new)           | [API](/docs/api/fhir/resources/schedule)           |
| Questionnaire      | [View All](https://app.medplum.com/Questionnaire)      | [Create New](https://app.medplum.com/Questionnaire/new)      | [API](/docs/api/fhir/resources/questionnaire)      |

## FHIR Resources for Care Plans for a Specific Patient

These are a common subset of objects that can be linked to CarePlans. Complex CarePlans may have more resource types.

| Resource              | App Link                                                  | Create New                                             | API Documentation                                     |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| CarePlan              | [View All](https://app.medplum.com/CarePlan)              | [Create New](https://app.medplum.com/CarePlan/new)     | [API](/docs/api/fhir/resources/careplan)              |
| RequestGroup          | [View All](https://app.medplum.com/RequestGroup)          | [Create New](https://app.medplum.com/RequestGroup/new) | [API](/docs/api/fhir/resources/requestgroup)          |
| Task                  | [View All](https://app.medplum.com/Task)                  | [Create New](https://app.medplum.com/Task/new)         | [API](/docs/api/fhir/resources/task)                  |
| QuestionnaireResponse | [View All](https://app.medplum.com/QuestionnaireResponse) | Created via API or workflow                            | [API](/docs/api/fhir/resources/questionnaireresponse) |
| Appointment           | [View All](https://app.medplum.com/Appointment)           | [Create New](https://app.medplum.com/Appointment/new)  | [API](/docs/api/fhir/resources/appointment)           |
| Medication            | [View All](https://app.medplum.com/Medication)            | [Create New](https://app.medplum.com/Medication/new)   | [API](/docs/api/fhir/resources/medication)            |
| CareTeam              | [View All](https://app.medplum.com/CareTeam)              | [Create New](https://app.medplum.com/CareTeam/new)     | [API](/docs/api/fhir/resources/careteam)              |

## Demos and Reference Material

- [Foo Medical Care Plan](https://foomedical.com/care-plan): sample patient portal with sample patient care plan.
- [Provider Demo Care Plans](https://provider.medplum.com/): sample simple EHR with a menu of available care plans.
- [Sample Code from for creating care plans](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/sample-account-setup.ts).
- [Care Plan sample React Component](https://storybook.medplum.com/?path=/docs/medplum-requestgroupdisplay--simple) is one example of a care plan visualization.
- [PlanDefinition Apply documentation](https://hl7.org/fhir/plandefinition-operation-apply.html), this is the process by which a PlanDefinition is converted to a CarePlan.
