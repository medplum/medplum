---
sidebar_position: 22
---

# PlanDefinition $apply

Medplum implements the FHIR [`$apply` operation](https://hl7.org/fhir/plandefinition-operation-apply.html) for PlanDefinition resources.

The `$apply` operation converts a PlanDefinition into a set of actionable resources for a specific patient. It creates a CarePlan containing a RequestGroup with Tasks based on the actions defined in the PlanDefinition.

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

## Behavior

The `$apply` operation processes the PlanDefinition and:

1. **Creates Tasks** for each action in the PlanDefinition
2. **Resolves ActivityDefinitions** - If an action references an ActivityDefinition, it creates appropriate resources:
   - `ServiceRequest` for ActivityDefinitions with `kind: ServiceRequest`
   - Tasks with Questionnaire inputs for Questionnaire definitions
3. **Creates a RequestGroup** containing all the generated actions
4. **Creates a CarePlan** that wraps the RequestGroup

### Action Definition Processing

| Definition Type      | Generated Resources                          |
| -------------------- | -------------------------------------------- |
| `Questionnaire`      | Task with Questionnaire input reference      |
| `ActivityDefinition` | Task + ServiceRequest (if kind is ServiceRequest) |
| None                 | Task only                                    |

### Task Extensions

Medplum supports custom extensions on ActivityDefinitions for Task configuration:

- `https://medplum.com/fhir/StructureDefinition/task-elements` - Configure Task owner and performerType using FHIRPath expressions

## Example PlanDefinition

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

## Related Documentation

- [CarePlans](/docs/careplans) - Working with care plans in Medplum
- [Task Management](/docs/careplans/tasks) - Managing tasks and workflows
- [FHIR PlanDefinition](https://hl7.org/fhir/plandefinition.html) - FHIR specification
