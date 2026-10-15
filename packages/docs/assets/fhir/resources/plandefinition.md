## Usage

**This resource is a _definition_ resource from a FHIR workflow perspective** - see [Workflow](https://www.hl7.org/fhir/workflow.html), specifically [Definition](https://www.hl7.org/fhir/workflow.html#definition).

A plan definition is a pre-defined group of actions to be taken in particular circumstances, often including conditional elements, options, and other decision points. The resource is flexible enough to be used to represent a variety of workflows, as well as clinical decision support and quality improvement assets, including order sets, protocols, and decision support rules.

PlanDefinitions can contain hierarchical groups of action definitions, where each action definition describes an activity to be performed (often in terms of an [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) resource), and each group defines additional behavior, relationships, and applicable conditions between the actions in the overall definition.

In addition to describing what should take place, each action in a plan definition can specify _when_ and _whether_ the action should take place. For when the action should be taken, the `trigger` element specifies the action should be taken in response to some trigger occurring (such as a particular point in a workflow being reached, or as the result of a prescription being ordered). For whether the action should be taken, the `condition` element can be used to provide an expression that evaluates to true or false to indicate the applicability of the action to the specific context.

The process of applying a [PlanDefinition](/docs/api/fhir/resources/plandefinition) to a particular context typically produces request resources representing the actions that should be performed, typically grouped within a [CarePlan](/docs/api/fhir/resources/careplan) and/or [RequestGroup](/docs/api/fhir/resources/requestgroup) to capture relationships between the resulting request resources.

Each [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) is used to construct a specific resource, based on the definition of the activity and combined with contextual information for the particular patient that the plan definition is being applied to.

As with the [ActivityDefinition](/docs/api/fhir/resources/activitydefinition), a [PlanDefinition](/docs/api/fhir/resources/plandefinition) may provide information about how to transform the activity to a specific intent resource, either by specifying a [StructureMap](/docs/api/fhir/resources/structuremap) that can be used to perform the transformation completely, or by specifying values for specific elements of the resulting resource using `dynamicValue` elements in the action.

Note that these mechanisms are provided on both the [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) and the [PlanDefinition](/docs/api/fhir/resources/plandefinition) to allow both reusable transformation descriptions, as well as customization of those descriptions within specific contexts. As such, the transform descriptions specified on the [PlanDefinition](/docs/api/fhir/resources/plandefinition) _override_ transform descriptions defined on the [ActivityDefinition](/docs/api/fhir/resources/activitydefinition).

Dynamic values within the definitions can be provided by specifying the expression directly, or by referencing an expression defined within a library. For more information on how to reference expressions within resources, refer to the [Using](https://www.hl7.org/fhir/clinicalreasoning-topics-using-expressions.html) [Expressions](/docs/api/fhir/datatypes/expression) topic.

As an example, the Low Suicide Risk example order set from the Clinical Decision Support Knowledge Artifact Specification can be represented using the [PlanDefinition](/docs/api/fhir/resources/plandefinition) and [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) structures: [Low Suicide Risk Example Order Set](https://www.hl7.org/fhir/plandefinition-example.html).

In addition to the representation of [PlanDefinitions](/docs/api/fhir/resources/plandefinition), the [$apply](https://www.hl7.org/fhir/plandefinition-operation-apply.html) operation allows [PlanDefinitions](/docs/api/fhir/resources/plandefinition) to be applied to a specific context such as a patient, practitioner, or institution. For Order Sets specifically, this operation is expected to place the orders defined by the order set, consistent with the service functional requirements defined by the [Order Set specification](http://www.hl7.org/implement/standards/product_brief.cfm?product_id=287) .

## Relationships

The [PlanDefinition](/docs/api/fhir/resources/plandefinition) resource is used to describe series, sequences, or groups of actions to be taken, while the [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) resource is used to define each specific step or activity to be performed.

As the name implies, the [PlanDefinition](/docs/api/fhir/resources/plandefinition) resource is strictly definitional. It does not represent the intention to take any action, nor does it represent that any actions have been taken. Rather, the resource provides a definition that can be applied in the appropriate circumstances. When the plan definition is applied, the result will in general be a set of actions that should be (or potentially even have been) performed.

Note that the [PlanDefinition](/docs/api/fhir/resources/plandefinition) still has action-level information, as well as a reference to an [ActivityDefinition](/docs/api/fhir/resources/activitydefinition). The action-level information defined in the [PlanDefinition](/docs/api/fhir/resources/plandefinition) itself is used to describe how the actions are related to each other within the plan, where the [ActivityDefinition](/docs/api/fhir/resources/activitydefinition) contains only information about the activity itself. In addition, there is some overlapping information that allows the resources to be used independently, or in combination. See the Applying a [PlanDefinition](/docs/api/fhir/resources/plandefinition) section for more information.
