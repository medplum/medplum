---
sidebar_position: 29
---

# Custom Operations

Medplum supports custom FHIR operations implemented via Bots. This allows you to define your own operations with custom business logic while following FHIR operation semantics.

## Overview

Custom operations are implemented by:

1. Creating an `OperationDefinition` resource that defines the operation's code, parameters, and binding
2. Creating a `Bot` resource that contains the implementation logic
3. Linking them using a Medplum-specific extension

## Creating a Custom Operation

### Step 1: Create the Bot

First, create a Bot that will handle the operation:

```json
{
  "resourceType": "Bot",
  "name": "my-custom-operation",
  "runtimeVersion": "awslambda",
  "code": "export async function handler(input, event) {\n  // Your operation logic here\n  return { result: 'success' };\n}"
}
```

### Step 2: Create the OperationDefinition

Create an `OperationDefinition` that references your Bot:

```json
{
  "resourceType": "OperationDefinition",
  "name": "my-operation",
  "status": "active",
  "kind": "operation",
  "code": "my-operation",
  "resource": ["Patient"],
  "system": false,
  "type": true,
  "instance": true,
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation",
      "valueReference": {
        "reference": "Bot/your-bot-id"
      }
    }
  ],
  "parameter": [
    {
      "name": "input",
      "use": "in",
      "min": 1,
      "max": "1",
      "type": "string"
    },
    {
      "name": "return",
      "use": "out",
      "min": 1,
      "max": "1",
      "type": "Parameters"
    }
  ]
}
```

## Invocation

Once configured, your custom operation can be invoked like any FHIR operation:

```
POST [base]/[ResourceType]/$my-operation
GET [base]/[ResourceType]/[id]/$my-operation
```

The invocation pattern depends on your `OperationDefinition` settings:
- `system: true` - Operation available at `[base]/$code`
- `type: true` - Operation available at `[base]/[ResourceType]/$code`
- `instance: true` - Operation available at `[base]/[ResourceType]/[id]/$code`

## Bot Input

The Bot receives different input based on the HTTP method:

### POST Request
The Bot receives the request body as input. This is typically a `Parameters` resource or direct resource content.

### GET Request
The Bot receives the query string parameters as an object.

## Bot Output

The Bot's return value is wrapped in a `Parameters` resource according to the `OperationDefinition`'s output parameter definitions.

If the Bot returns an `OperationOutcome`, it is returned directly to the caller.

## Example: Patient Eligibility Check

### Bot Implementation

```typescript
import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(
  medplum: MedplumClient,
  event: BotEvent
): Promise<any> {
  const input = event.input;
  
  // Extract patient from input
  const patientRef = input.patient;
  const patient = await medplum.readReference(patientRef);
  
  // Perform eligibility check logic
  const isEligible = await checkEligibility(patient);
  
  return {
    eligible: isEligible,
    checkedAt: new Date().toISOString()
  };
}
```

### OperationDefinition

```json
{
  "resourceType": "OperationDefinition",
  "name": "check-eligibility",
  "status": "active",
  "kind": "operation",
  "code": "check-eligibility",
  "resource": ["Patient"],
  "system": false,
  "type": false,
  "instance": true,
  "extension": [
    {
      "url": "https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation",
      "valueReference": {
        "reference": "Bot/eligibility-bot-id"
      }
    }
  ],
  "parameter": [
    {
      "name": "eligible",
      "use": "out",
      "min": 1,
      "max": "1",
      "type": "boolean"
    },
    {
      "name": "checkedAt",
      "use": "out",
      "min": 1,
      "max": "1",
      "type": "instant"
    }
  ]
}
```

### Invocation

```http
GET /fhir/R4/Patient/patient123/$check-eligibility
```

### Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "eligible",
      "valueBoolean": true
    },
    {
      "name": "checkedAt",
      "valueInstant": "2026-01-08T15:30:00.000Z"
    }
  ]
}
```

## Error Handling

If the Bot execution fails, an `OperationOutcome` is returned:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "exception",
      "details": {
        "text": "Bot execution failed: Error message here"
      }
    }
  ]
}
```

## Requirements

- The `OperationDefinition` must have the Medplum implementation extension pointing to a Bot
- The Bot reference must start with `Bot/`
- The user invoking the operation must have read access to the Bot

## Related Documentation

- [Bots](/docs/bots)
- [OperationDefinition Resource](https://www.hl7.org/fhir/operationdefinition.html)
- [FHIR Operations](https://www.hl7.org/fhir/operations.html)