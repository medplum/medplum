---
title: SubstanceProtein
sidebar_position: 575
---

# SubstanceProtein

A SubstanceProtein is defined as a single unit of a linear amino acid sequence, or a combination of subunits that are
either covalently linked or have a defined invariant stoichiometric relationship. This includes all synthetic,
recombinant and purified SubstanceProteins of defined sequence, whether the use is therapeutic or prophylactic. This set
of elements will be used to describe albumins, coagulation factors, cytokines, growth factors, peptide/SubstanceProtein
hormones, enzymes, toxins, toxoids, recombinant vaccines, and immunomodulators.

## Properties

| Name              | Card  | Type            | Description                                                                    |
| ----------------- | ----- | --------------- | ------------------------------------------------------------------------------ |
| id                | 0..1  | string          | Logical id of this artifact                                                    |
| meta              | 0..1  | Meta            | Metadata about the resource                                                    |
| implicitRules     | 0..1  | uri             | A set of rules under which this content was created                            |
| language          | 0..1  | code            | Language of the resource content                                               |
| text              | 0..1  | Narrative       | Text summary of the resource, for human interpretation                         |
| contained         | 0..\* | Resource        | Contained, inline Resources                                                    |
| extension         | 0..\* | Extension       | Additional content defined by implementations                                  |
| modifierExtension | 0..\* | Extension       | Extensions that cannot be ignored                                              |
| sequenceType      | 0..1  | CodeableConcept | The SubstanceProtein descriptive elements will only be used when a complete or |

partial amino acid sequence is available or derivable from a nucleic acid sequence
| numberOfSubunits | 0..1 | integer | Number of linear sequences of amino acids linked through peptide bonds. The number
of subunits constituting the SubstanceProtein shall be described. It is possible that the number of subunits can be
variable
| disulfideLinkage | 0.._ | string | The disulphide bond between two cysteine residues either on the same subunit or on
two different subunits shall be described. The position of the disulfide bonds in the SubstanceProtein shall be listed
in increasing order of subunit number and position within subunit followed by the abbreviation of the amino acids
involved. The disulfide linkage positions shall actually contain the amino acid Cysteine at the respective positions
| subunit | 0.._ | BackboneElement | This subclause refers to the description of each subunit constituting the
SubstanceProtein. A subunit is a linear sequence of amino acids linked through peptide bonds. The Subunit information
shall be provided when the finished SubstanceProtein is a complex of multiple sequences; subunits are not used to
delineate domains within a single sequence. Subunits are listed in order of decreasing length; sequences of the same
length will be ordered by decreasing molecular weight; subunits that have identical sequences will be repeated multiple
times

## Search Parameters

| Name | Type | Description | Expression |
| ---- | ---- | ----------- | ---------- |
