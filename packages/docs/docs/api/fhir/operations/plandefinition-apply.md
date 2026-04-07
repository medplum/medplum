---
sidebar_position: 22
---

# PlanDefinition $apply

Medplum implements the FHIR [`$apply` operation](https://hl7.org/fhir/plandefinition-operation-apply.html) for PlanDefinition resources.

The `$apply` operation converts a PlanDefinition into a set of actionable resources for a specific patient. It creates a CarePlan containing a RequestGroup with Tasks based on the actions defined in the PlanDefinition.

For a detailed explanation of how Medplum processes PlanDefinitions, resolves ActivityDefinitions, and handles custom Task extensions, see our guide on [Authoring Clinical Protocols](/docs/careplans/protocols).

## Use Cases

- **Care Protocols**: Apply standardized care protocols to patients
- **Clinical Guidelines**: Implement evidence-based treatment guidelines
- **Care Coordination**: Generate care plans with assigned tasks
- **Workflow Automation**: Create structured workflows from templates

## Invoke the `$apply` operation

```
[base]/PlanDefinition/[id]/$apply
```

For example:

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/PlanDefinition/example-id/$apply' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "subject",
        "valueString": "Patient/patient-123"
      }
    ]
  }'
```

## Parameters

| Name           | Type        | Description                                         | Required |
| -------------- | ----------- | --------------------------------------------------- | -------- |
| `subject`      | `string[]`  | Reference to the Patient the plan applies to        | Yes      |
| `encounter`    | `string`    | Reference to the Encounter for context              | No       |
| `practitioner` | `string`    | Reference to the Practitioner applying the plan     | No       |
| `organization` | `string`    | Reference to the Organization context               | No       |

### Example with All Parameters

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/PlanDefinition/example-id/$apply' \
  -H "Content-Type: application/fhir+json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "subject",
        "valueString": "Patient/patient-123"
      },
      {
        "name": "encounter",
        "valueString": "Encounter/encounter-456"
      },
      {
        "name": "practitioner",
        "valueString": "Practitioner/dr-smith"
      },
      {
        "name": "organization",
        "valueString": "Organization/clinic-abc"
      }
    ]
  }'
```

## Output

The operation returns a CarePlan resource that references a RequestGroup containing the generated Tasks.

### Example Response

```json
{
  "resourceType": "CarePlan",
  "id": "generated-careplan-id",
  "status": "active",
  "intent": "plan",
  "subject": {
    "reference": "Patient/patient-123"
  },
  "instantiatesCanonical": [
    "http://example.org/PlanDefinition/diabetes-management"
  ],
  "activity": [
    {
      "reference": {
        "reference": "RequestGroup/generated-requestgroup-id"
      }
    }
  ]
}
```

## Example PlanDefinition

At its most basic level, a `PlanDefinition` is a list of sequential tasks. The `$apply` operation converts these actions into a `RequestGroup` and individual `Task` resources.

```json
{
  "resourceType": "PlanDefinition",
  "id": "example-plan",
  "url": "http://example.org/PlanDefinition/diabetes-screening",
  "title": "Diabetes Screening Protocol",
  "status": "active",
  "action": [
    {
      "title": "Order HbA1c Test",
      "definitionCanonical": "http://example.org/ActivityDefinition/hba1c-order"
    },
    {
      "title": "Complete Risk Assessment",
      "definitionCanonical": "http://example.org/Questionnaire/diabetes-risk"
    },
    {
      "title": "Schedule Follow-up",
      "description": "Schedule a follow-up appointment in 3 months"
    }
  ]
}
```

For more advanced examples of modeling workflows (including hierarchical actions, conditional logic, timing dependencies, and dynamic values), see our guide on [Authoring Clinical Protocols](/docs/careplans/protocols).

## Related Documentation

- [Authoring Clinical Protocols](/docs/careplans/protocols) - Advanced workflow modeling with PlanDefinition
- [CarePlans](/docs/careplans) - Working with care plans in Medplum
- [Task Management](/docs/careplans/tasks) - Managing tasks and workflows
- [FHIR PlanDefinition](https://hl7.org/fhir/plandefinition.html) - FHIR specification