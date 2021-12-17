---
title: StructureDefinition
sidebar_position: 545
---

# StructureDefinition

A definition of a FHIR structure. This resource is used to describe the underlying resources, data types defined in
FHIR, and also for describing extensions and constraints on resources and data types.

## Properties

| Name              | Card  | Type            | Description                                                                                |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                                                                |
| meta              | 0..1  | Meta            | Metadata about the resource                                                                |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                                        |
| language          | 0..1  | code            | Language of the resource content                                                           |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                                     |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                                |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                              |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                          |
| url               | 1..1  | uri             | Canonical identifier for this structure definition, represented as a URI (globally unique) |
| identifier        | 0..\* | Identifier      | Additional identifier for the structure definition                                         |
| version           | 0..1  | string          | Business version of the structure definition                                               |
| name              | 1..1  | string          | Name for this structure definition (computer friendly)                                     |
| title             | 0..1  | string          | Name for this structure definition (human friendly)                                        |
| status            | 1..1  | code            | draft \| active \| retired \| unknown                                                      |
| experimental      | 0..1  | boolean         | For testing purposes, not real usage                                                       |
| date              | 0..1  | dateTime        | Date last changed                                                                          |
| publisher         | 0..1  | string          | Name of the publisher (organization or individual)                                         |
| contact           | 0..\* | ContactDetail   | Contact details for the publisher                                                          |
| description       | 0..1  | markdown        | Natural language description of the structure definition                                   |
| useContext        | 0..\* | UsageContext    | The context that the content is intended to support                                        |
| jurisdiction      | 0..\* | CodeableConcept | Intended jurisdiction for structure definition (if applicable)                             |
| purpose           | 0..1  | markdown        | Why this structure definition is defined                                                   |
| copyright         | 0..1  | markdown        | Use and/or publishing restrictions                                                         |
| keyword           | 0..\* | Coding          | Assist with indexing and finding                                                           |
| fhirVersion       | 0..1  | code            | FHIR Version this StructureDefinition targets                                              |
| mapping           | 0..\* | BackboneElement | External specification that the content is mapped to                                       |
| kind              | 1..1  | code            | primitive-type \| complex-type \| resource \| logical                                      |
| abstract          | 1..1  | boolean         | Whether the structure is abstract                                                          |
| context           | 0..\* | BackboneElement | If an extension, where it can be used in instances                                         |
| contextInvariant  | 0..\* | string          | FHIRPath invariants - when the extension can be used                                       |
| type              | 1..1  | uri             | Type defined or constrained by this structure                                              |
| baseDefinition    | 0..1  | canonical       | Definition that this type is constrained/specialized from                                  |
| derivation        | 0..1  | code            | specialization \| constraint - How relates to base definition                              |
| snapshot          | 0..1  | BackboneElement | Snapshot view of the structure                                                             |
| differential      | 0..1  | BackboneElement | Differential view of the structure                                                         |

## Search Parameters

| Name                  | Type      | Description                                                                                                               | Expression                                            |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| context               | token     | A use context assigned to the structure definition                                                                        | StructureDefinition.useContext.value                  |
| context-quantity      | quantity  | A quantity- or range-valued use context assigned to the structure definition                                              | StructureDefinition.useContext.value                  |
| context-type          | token     | A type of use context assigned to the structure definition                                                                | StructureDefinition.useContext.code                   |
| date                  | date      | The structure definition publication date                                                                                 | StructureDefinition.date                              |
| description           | string    | The description of the structure definition                                                                               | StructureDefinition.description                       |
| jurisdiction          | token     | Intended jurisdiction for the structure definition                                                                        | StructureDefinition.jurisdiction                      |
| name                  | string    | Computationally friendly name of the structure definition                                                                 | StructureDefinition.name                              |
| publisher             | string    | Name of the publisher of the structure definition                                                                         | StructureDefinition.publisher                         |
| status                | token     | The current status of the structure definition                                                                            | StructureDefinition.status                            |
| title                 | string    | The human-friendly name of the structure definition                                                                       | StructureDefinition.title                             |
| url                   | uri       | The uri that identifies the structure definition                                                                          | StructureDefinition.url                               |
| version               | token     | The business version of the structure definition                                                                          | StructureDefinition.version                           |
| context-type-quantity | composite | A use context type and quantity- or range-based value assigned to the structure definition                                | StructureDefinition.useContext                        |
| context-type-value    | composite | A use context type and value assigned to the structure definition                                                         | StructureDefinition.useContext                        |
| identifier            | token     | External identifier for the structure definition                                                                          | StructureDefinition.identifier                        |
| abstract              | token     | Whether the structure is abstract                                                                                         | StructureDefinition.abstract                          |
| base                  | reference | Definition that this type is constrained/specialized from                                                                 | StructureDefinition.baseDefinition                    |
| base-path             | token     | Path that identifies the base element                                                                                     | StructureDefinition.snapshot.element.base.path        |
| derivation            | token     | specialization \| constraint - How relates to base definition                                                             | StructureDefinition.derivation                        |
| experimental          | token     | For testing purposes, not real usage                                                                                      | StructureDefinition.experimental                      |
| ext-context           | token     | The system is the URL for the context-type: e.g. http://hl7.org/fhir/extension-context-type#element\|CodeableConcept.text | StructureDefinition.context.type                      |
| keyword               | token     | A code for the StructureDefinition                                                                                        | StructureDefinition.keyword                           |
| kind                  | token     | primitive-type \| complex-type \| resource \| logical                                                                     | StructureDefinition.kind                              |
| path                  | token     | A path that is constrained in the StructureDefinition                                                                     | StructureDefinition.snapshot.element.path             |
| type                  | uri       | Type defined or constrained by this structure                                                                             | StructureDefinition.type                              |
| valueset              | reference | A vocabulary binding reference                                                                                            | StructureDefinition.snapshot.element.binding.valueSet |
