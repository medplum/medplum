---
title: SubstanceSourceMaterial
sidebar_position: 582
---

# SubstanceSourceMaterial

Source material shall capture information on the taxonomic and anatomical origins as well as the fraction of a material
  that can result in or can be modified to form a substance. This set of data elements shall be used to define polymer
  substances isolated from biological matrices. Taxonomic and anatomical origins shall be described using a controlled
  vocabulary as required. This information is captured for naturally derived polymers ( . starch) and structurally diverse
  substances. For Organisms belonging to the Kingdom Plantae the Substance level defines the fresh material of a single
  species or infraspecies, the Herbal Drug and the Herbal preparation. For Herbal preparations, the fraction information
  will be captured at the Substance information level and additional information for herbal extracts will be captured at
  the Specified Substance Group 1 information level. See for further explanation the Substance Class: Structurally Diverse
  and the herbal annex.

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
| sourceMaterialClass | 0..1 | CodeableConcept | General high level classification of the source material specific to the origin of the material
| sourceMaterialType | 0..1 | CodeableConcept | The type of the source material shall be specified based on a controlled
  vocabulary. For vaccines, this subclause refers to the class of infectious agent
| sourceMaterialState | 0..1 | CodeableConcept | The state of the source material when extracted
| organismId | 0..1 | Identifier | The unique identifier associated with the source material parent organism shall be specified
| organismName | 0..1 | string | The organism accepted Scientific name shall be provided based on the organism taxonomy
| parentSubstanceId | 0..* | Identifier | The parent of the herbal drug Ginkgo biloba, Leaf is the substance ID of the
  substance (fresh) of Ginkgo biloba L. or Ginkgo biloba L. (Whole plant)
| parentSubstanceName | 0..* | string | The parent substance of the Herbal Drug, or Herbal preparation
| countryOfOrigin | 0..* | CodeableConcept | The country where the plant material is harvested or the countries where
  the plasma is sourced from as laid down in accordance with the Plasma Master File. For “Plasma-derived substances” the
  attribute country of origin provides information about the countries used for the manufacturing of the Cryopoor plama or
  Crioprecipitate
| geographicalLocation | 0..* | string | The place/region where the plant is harvested or the places/regions where the animal source material has its habitat
| developmentStage | 0..1 | CodeableConcept | Stage of life for animals, plants, insects and microorganisms. This
  information shall be provided only when the substance is significantly different in these stages (e.g. foetal bovine
  serum)
| fractionDescription | 0..* | BackboneElement | Many complex materials are fractions of parts of plants, animals, or
  minerals. Fraction elements are often necessary to define both Substances and Specified Group 1 Substances. For
  substances derived from Plants, fraction information will be captured at the Substance information level ( . Oils,
  Juices and Exudates). Additional information for Extracts, such as extraction solvent composition, will be captured at
  the Specified Substance Group 1 information level. For plasma-derived products fraction information will be captured at
  the Substance and the Specified Substance Group 1 levels
| organism | 0..1 | BackboneElement | This subclause describes the organism which the substance is derived from. For
  vaccines, the parent organism shall be specified based on these subclause elements. As an example, full taxonomy will be
  described for the Substance Name: ., Leaf
| partDescription | 0..* | BackboneElement | To do

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |

