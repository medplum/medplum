---
sidebar_position: 29
---

# Custom Operations

Medplum supports custom FHIR operations implemented via Bots. This allows you to define your own operations with custom business logic while following FHIR operation semantics.

## Overview

Custom operations enable you to:

- **Build domain-specific APIs**: Create custom endpoints tailored to your organization's specific healthcare workflows
- **Implement business logic**: Add complex validation, calculation, or transformation logic as reusable operations
- **Extend FHIR capabilities**: Add functionality beyond standard FHIR operations while maintaining API consistency
- **Create integration endpoints**: Receive data from external systems in specific formats

## Quick Example

Custom operations are created by:

1. Creating a `Bot` resource with your JavaScript implementation
2. Creating an `OperationDefinition` resource that defines the operation's interface
3. Linking them using a Medplum-specific extension

Once configured, operations can be invoked like any standard FHIR operation:

```http
POST [base]/[ResourceType]/$my-operation
GET [base]/[ResourceType]/[id]/$my-operation
```

## Full Documentation

For complete documentation on creating and using custom FHIR operations, see:

**[Custom FHIR Operations Guide](/docs/bots/custom-fhir-operations)**

The full guide covers:

- Creating and deploying Bots for custom operations
- Defining OperationDefinition resources with proper parameters
- Configuring system, type, and instance-level operations
- Input and output handling for POST and GET requests
- Security and permissions model
- Error handling patterns
- Complete working examples

## Related Documentation

- [Bot Basics](/docs/bots/bot-basics)
- [OperationDefinition Resource](https://www.hl7.org/fhir/operationdefinition.html)
- [FHIR Operations](https://www.hl7.org/fhir/operations.html)