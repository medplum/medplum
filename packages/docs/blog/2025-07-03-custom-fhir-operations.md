---
slug: custom-fhir-operations
title: "Medplum Supports Custom FHIR Operations"
authors: cody
tags: [fhir-datastore, integration, auth, community, ai]
---

# Introducing Custom FHIR Operations in Medplum

Healthcare APIs need flexibility. While FHIR's standard CRUD operations (create, read, update, delete) handle most use cases, real-world healthcare workflows often require custom logic that goes beyond basic data manipulation. That's why we're excited to introduce custom FHIR operations in Medplum.

## What Are FHIR Operations?

FHIR operations are the "dollar sign things" – endpoints like `$validate`, `$expand`, or `$match` that perform specialized functions beyond standard CRUD operations. These are technically called "operations" in FHIR terminology, distinct from the basic "interactions" used for everyday data management.

<!--truncate-->

Until now, Medplum supported built-in FHIR operations like `$validate` and custom logic through our Bot framework using `$execute`. But there was a gap: customers wanted more natural, domain-specific endpoints that felt like proper FHIR operations.

## Why Custom Operations Matter

Consider these scenarios:

- A pharmacy system that needs a `MedicationRequest/$submit` operation
- A quality assurance workflow requiring `Patient/$quality-check`
- Custom patient matching logic via `Patient/$match`
- Integration workflows that transform data before processing

Previously, these would all use the generic `Bot/{id}/$execute` syntax. Custom operations provide a more elegant, FHIR-native approach with endpoints that clearly communicate their purpose.

## How It Works

Custom FHIR operations build on Medplum's existing Bot infrastructure, providing three key benefits:

1. **Natural API Design**: Instead of `Bot/dose-calculator/$execute`, you can now use `MedicationRequest/$calculate-dose`
2. **FHIR Standards Compliance**: Operations are defined using standard FHIR OperationDefinition resources
3. **Existing Security Model**: Custom operations inherit all the access controls and permissions from the underlying Bot framework

## Getting Started

Setting up a custom operation involves three steps:

1. Create and deploy your Bot with the custom logic
2. Create an OperationDefinition resource that defines the operation's interface
3. Link them together using the operation-definition-implementation extension

The OperationDefinition specifies the operation code (like "quality-check"), input/output parameters, and includes a reference to your Bot implementation.

Once configured, you can call your custom operation using standard FHIR syntax:

```
POST /fhir/R4/Patient/$quality-check
```

## Security and Access Control

Custom operations follow Medplum's principle of "syntactic sugar on the existing Bot execute framework." They inherit all existing security controls:

- Bots must have appropriate project membership
- Standard FHIR access control applies
- Access policies are recommended for all Bot implementations
- The same permission model that governs `$execute` applies to custom operations

## Implementation Philosophy

We've designed custom operations following Postel's Law: "be liberal in what you accept and conservative in what you send." The system is flexible with inputs (your Bot receives the raw POST body) but strict with outputs (responses are properly formatted according to the OperationDefinition).

This approach prioritizes developer experience while maintaining FHIR compliance for API consumers.

## Looking Forward

This initial implementation focuses on Bot-backed operations, but the framework is extensible. Future versions could support external web service implementations or other execution models.

We're also considering whether customers should be able to override built-in operations – a powerful capability that opens interesting possibilities while requiring careful consideration of the implications.

## Ready to Try It?

Custom FHIR operations are available now in Medplum. Check out [our documentation](/docs/bots/custom-fhir-operations) for detailed setup instructions, examples, and best practices.

This feature represents our commitment to providing healthcare developers with powerful, standards-compliant tools that adapt to real-world workflows. We can't wait to see what custom operations you build.