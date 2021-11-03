---
title: SubstanceSpecification
sidebar_position: 589
---

# SubstanceSpecification

The detailed description of a substance, typically at a level beyond what is used for prescribing.

## Properties

| Name | Card | Type | Description |
| --- | --- | --- | --- |
| id | 0..1 | string | Logical id of this artifact
| meta | 0..1 | Meta | Metadata about the resource
| implicitRules | 0..1 | uri | A set of rules under which this content was created
| language | 0..1 | code | Language of the resource content
| text | 0..1 | Narrative | Text summary of the resource, for human interpretation
| contained | 0..* | Resource | Contained, inline Resources
| extension | 0..* | Extension | Additional content defined by implementations
| modifierExtension | 0..* | Extension | Extensions that cannot be ignored
| identifier | 0..1 | Identifier | Identifier by which this substance is known
| type | 0..1 | CodeableConcept | High level categorization, e.g. polymer or nucleic acid
| status | 0..1 | CodeableConcept | Status of substance within the catalogue e.g. approved
| domain | 0..1 | CodeableConcept | If the substance applies to only human or veterinary use
| description | 0..1 | string | Textual description of the substance
| source | 0..* | Reference | Supporting literature
| comment | 0..1 | string | Textual comment about this record of a substance
| moiety | 0..* | BackboneElement | Moiety, for structural modifications
| property | 0..* | BackboneElement | General specifications for this substance, including how it is related to other substances
| referenceInformation | 0..1 | Reference | General information detailing this substance
| structure | 0..1 | BackboneElement | Structural information
| code | 0..* | BackboneElement | Codes associated with the substance
| name | 0..* | BackboneElement | Names applicable to this substance
| molecularWeight | 0..* |  | The molecular weight or weight range (for proteins, polymers or nucleic acids)
| relationship | 0..* | BackboneElement | A link between this substance and another, with details of the relationship
| nucleicAcid | 0..1 | Reference | Data items specific to nucleic acids
| polymer | 0..1 | Reference | Data items specific to polymers
| protein | 0..1 | Reference | Data items specific to proteins
| sourceMaterial | 0..1 | Reference | Material or taxonomic/anatomical source for the substance

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| code | token | The specific code | SubstanceSpecification.code.code

