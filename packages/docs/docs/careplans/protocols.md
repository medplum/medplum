---
sidebar_position: 1
---

# Authoring Clinical Protocols

In FHIR, care workflows and clinical protocols are primarily modeled using the **`PlanDefinition`** resource. 

While a `CarePlan` represents a concrete plan for a *specific patient*, a `PlanDefinition` represents the abstract protocol that can be applied to *any patient*. 

At its core, a `PlanDefinition` contains a list of **`action`** elements, where each action represents a specific step in the workflow. The `action` element is extremely expressive and allows for incredibly rich workflow logic.

:::info Note on Medplum Support
The FHIR standard allows for very complex workflow modeling, including hierarchical actions, conditional logic, and dynamic values. While you can author and store these complex `PlanDefinition` resources in Medplum today, the Medplum [`$apply` operation](/docs/api/fhir/operations/plandefinition-apply) currently implements a focused subset of these capabilities (primarily generating sequential Tasks and resolving ActivityDefinitions). Full execution support for hierarchical and conditional logic is under active development.
:::

## Basic Sequential Tasks

At its most basic level, a `PlanDefinition` is just a simple list of sequential tasks. You can define the task details directly inline:

```json
{
  "resourceType": "PlanDefinition",
  "status": "active",
  "title": "Basic Onboarding Protocol",
  "action": [
    {
      "title": "Schedule Initial Consult",
      "description": "Call patient to schedule their first appointment."
    },
    {
      "title": "Send Welcome Packet",
      "description": "Email the welcome packet and intake forms."
    }
  ]
}
```

## Reusable Definitions (ActivityDefinition & Questionnaire)

Instead of defining all task details inline, actions often reference standalone, reusable definition resources using the `definitionCanonical` element. This allows you to maintain a single source of truth for common clinical activities across multiple protocols.

### ActivityDefinition

An [`ActivityDefinition`](/docs/api/fhir/resources/activitydefinition) is a template for a specific clinical act, such as ordering a lab test, prescribing a medication, or performing a procedure.

When an action references an `ActivityDefinition`, the protocol inherits its properties. Furthermore, the `ActivityDefinition.kind` element tells the system what type of resource to generate when the protocol is executed:

- If `kind` is set to `ServiceRequest`, executing the protocol will generate a draft `ServiceRequest` resource (copying over the `code`, `intent`, etc.) alongside the `Task`, and link them together.
- If `kind` is set to `Task` (or left blank), it will simply generate a `Task`.

```json
{
  "resourceType": "PlanDefinition",
  "status": "active",
  "action": [
    {
      "title": "Order HbA1c Test",
      "definitionCanonical": "http://example.org/ActivityDefinition/hba1c-order"
    }
  ]
}
```

### Questionnaire

If an action requires collecting structured data from a patient or provider, it can reference a [`Questionnaire`](/docs/api/fhir/resources/questionnaire). When executed, the system generates a `Task` whose `input` references the Questionnaire, signaling to your application that this specific form needs to be completed to fulfill the task.

```json
{
  "resourceType": "PlanDefinition",
  "status": "active",
  "action": [
    {
      "title": "Complete Risk Assessment",
      "definitionCanonical": "http://example.org/Questionnaire/diabetes-risk"
    }
  ]
}
```

## Advanced Workflow Logic

The FHIR standard supports highly complex workflow orchestration. 

### Hierarchical Actions & Grouping

You can nest actions to create phases or groups, and define rules for how users select from them using `groupingBehavior` (e.g., `logical-group`, `visual-group`) and `selectionBehavior` (e.g., `any`, `all`, `exactly-one`).

```json
{
  "resourceType": "PlanDefinition",
  "status": "active",
  "action": [{
    "title": "Initial Lab Orders",
    "groupingBehavior": "logical-group",
    "selectionBehavior": "any",
    "action": [
      { "title": "Order CBC" },
      { "title": "Order CMP" }
    ]
  }]
}
```

### Conditional Actions

You can define if/else logic or prerequisites using expressions (like CQL or FHIRPath) to determine if a step should occur.

```json
{
  "resourceType": "PlanDefinition",
  "status": "active",
  "action": [{
    "title": "Administer Medication",
    "condition": [{
      "kind": "applicability",
      "expression": {
        "language": "text/fhirpath",
        "expression": "%patient.birthDate <= today() - 18 years"
      }
    }]
  }]
}
```

### Action Timing & Dependencies

You can trigger actions based on the completion of other actions, including time delays.

```json
{
  "resourceType": "PlanDefinition",
  "status": "active",
  "action": [
    {
      "id": "step1",
      "title": "Initial Assessment"
    }, 
    {
      "title": "Follow-up Assessment",
      "relatedAction": [{
        "actionId": "step1",
        "relationship": "after-end",
        "offsetDuration": {
          "value": 7,
          "unit": "days",
          "system": "http://unitsofmeasure.org",
          "code": "d"
        }
      }]
    }
  ]
}
```

### Dynamic Values

You can dynamically inject values into the resulting resources based on the context (like the patient's name) when the protocol is applied.

```json
{
  "resourceType": "PlanDefinition",
  "status": "active",
  "action": [{
    "title": "Create Follow-up Task",
    "dynamicValue": [{
      "path": "Task.description",
      "expression": {
        "language": "text/fhirpath",
        "expression": "'Follow up with ' + %patient.name.first().given.first()"
      }
    }]
  }]
}
```

## Executing Protocols

To actually start a workflow for a specific patient, you instantiate the `PlanDefinition` using the [`$apply` operation](/docs/api/fhir/operations/plandefinition-apply). 

When you invoke the `$apply` operation, Medplum processes the PlanDefinition and:

1. **Creates Tasks** for each action in the PlanDefinition
2. **Resolves ActivityDefinitions & Questionnaires** to generate the appropriate underlying resources (like `ServiceRequest`).
3. **Creates a RequestGroup** containing all the generated actions.
4. **Creates a CarePlan** that wraps the RequestGroup.

### Action Definition Processing

| Definition Type      | Generated Resources                          |
| -------------------- | -------------------------------------------- |
| `Questionnaire`      | Task with Questionnaire input reference      |
| `ActivityDefinition` | Task + ServiceRequest (if kind is ServiceRequest) |
| None                 | Task only                                    |

### Task Extensions

Medplum supports custom extensions on `ActivityDefinition` resources to dynamically assign Task parameters when `$apply` is run. 

- `https://medplum.com/fhir/StructureDefinition/task-elements` - Configure Task `owner` and `performerType` using FHIRPath expressions based on the `$apply` parameters (e.g., `%patient`, `%practitioner`, `%organization`).

**Example ActivityDefinition with Task Extensions:**

```json
{
  "resourceType": "ActivityDefinition",
  "status": "active",
  "extension": [{
    "url": "https://medplum.com/fhir/StructureDefinition/task-elements",
    "extension": [
      {
        "url": "owner",
        "valueExpression": {
          "language": "text/fhirpath",
          "expression": "%practitioner"
        }
      },
      {
        "url": "performerType",
        "valueCodeableConcept": {
          "coding": [{ "system": "http://snomed.info/sct", "code": "158965000", "display": "Medical practitioner" }]
        }
      }
    ]
  }]
}
```