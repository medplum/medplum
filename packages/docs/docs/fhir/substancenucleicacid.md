---
title: SubstanceNucleicAcid
sidebar_position: 564
---

# SubstanceNucleicAcid

Nucleic acids are defined by three distinct elements: the base, sugar and linkage. Individual substance/moiety IDs will
be created for each of these elements. The nucleotide sequence will be always entered in the 5’-3’ direction.

## Properties

| Name              | Card  | Type            | Description                                                                       |
| ----------------- | ----- | --------------- | --------------------------------------------------------------------------------- |
| id                | 0..1  | string          | Logical id of this artifact                                                       |
| meta              | 0..1  | Meta            | Metadata about the resource                                                       |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                               |
| language          | 0..1  | code            | Language of the resource content                                                  |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                            |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                       |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                     |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                                 |
| sequenceType      | 0..1  | CodeableConcept | The type of the sequence shall be specified based on a controlled vocabulary      |
| numberOfSubunits  | 0..1  | integer         | The number of linear sequences of nucleotides linked through phosphodiester bonds |

shall be described. Subunits would be strands of nucleic acids that are tightly associated typically through
Watson-Crick base pairing. NOTE: If not specified in the reference source, the assumption is that there is 1 subunit
| areaOfHybridisation | 0..1 | string | The area of hybridisation shall be described if applicable for double stranded
RNA or DNA. The number associated with the subunit followed by the number associated to the residue shall be specified
in increasing order. The underscore “” shall be used as separator as follows: “Subunitnumber Residue”
| oligoNucleotideType | 0..1 | CodeableConcept | (TBC)
| subunit | 0..\* | BackboneElement | Subunits are listed in order of decreasing length; sequences of the same length
will be ordered by molecular weight; subunits that have identical sequences will be repeated multiple times

## Search Parameters

| Name | Type | Description | Expression |
| ---- | ---- | ----------- | ---------- |
