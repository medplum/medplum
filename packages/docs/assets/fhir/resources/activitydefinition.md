## Usage

**This resource is a _definition_ resource from a FHIR workflow perspective** - see [Workflow](https://www.hl7.org/fhir/workflow.html), specifically [Definition](https://www.hl7.org/fhir/workflow.html#definition).

An [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) is a shareable, consumable description of some activity to be performed. It may be used to specify actions to be taken as part of a workflow, order set, or protocol, or it may be used independently as part of a catalog of activities such as orderables.

For more information on how activity definitions can be used to construct request resources, see the Applying an [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) topic below.

## Relationships

In general, an activity definition is simply a conceptual description of some specific action that should be taken. An instance of an [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) does not indicate that any action has been performed (as an [event](https://www.hl7.org/fhir/workflow.html#event) resource does), nor does it indicate the actual _intent_ to carry out any particular action (as a [request](https://www.hl7.org/fhir/workflow.html#request) resource does). Instead, an activity definition provides a reusable template that can be used to construct specific _request_ resources such as [ServiceRequest](/docs/api/fhir/resources/servicerequest) and [MedicationRequest](/docs/api/fhir/resources/medicationrequest).

Note that this is conceptually similar to the [Task](/docs/api/fhir/resources/task) resource as well, with the distinction being that [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) represents the description of a task in the abstract, while the [Task](/docs/api/fhir/resources/task) resource is used to track a specific instance of a task as it moves through the steps of a workflow.
