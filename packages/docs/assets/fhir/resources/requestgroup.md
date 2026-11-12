## Usage

**This resource is a _request_ resource from a FHIR workflow perspective** - see [Workflow](https://www.hl7.org/fhir/workflow.html), specifically [Request](https://www.hl7.org/fhir/workflow.html#request).

The [RequestGroup](/docs/api/fhir/resources/requestgroup) resource is used to represent a group of optional activities that may be performed for a specific patient or context. This resource is often, but not always, the result of applying a specific [PlanDefinition](/docs/api/fhir/resources/plandefinition) to a particular patient. Other than differences that tie the [RequestGroup](/docs/api/fhir/resources/requestgroup) to a particular subject and setting, the `actionDefinition` element of [PlanDefinition](/docs/api/fhir/resources/plandefinition) is identical to the `action` element of the [RequestGroup](/docs/api/fhir/resources/requestgroup), allowing the same features and functionality to be used in both places to describe optionality of and relationships between activities in a workflow.

RequestGroups can contain hierarchical groups of actions, where each specific action references the action to be performed (in terms of a [Request](https://www.hl7.org/fhir/workflow.html#request) resource), and each group describes additional behavior, relationships, and applicable conditions between the actions in the overall group.
