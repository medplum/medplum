---
title: MolecularSequence
sidebar_position: 437
---

# MolecularSequence

Raw data describing a biological sequence.

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
| identifier | 0..* | Identifier | Unique ID for this particular sequence. This is a FHIR-defined id
| type | 0..1 | code | aa \| dna \| rna
| coordinateSystem | 1..1 | integer | Base number of coordinate system (0 for 0-based numbering or coordinates,
  inclusive start, exclusive end, 1 for 1-based numbering, inclusive start, inclusive end)
| patient | 0..1 | Reference | Who and/or what this is about
| specimen | 0..1 | Reference | Specimen used for sequencing
| device | 0..1 | Reference | The method for sequencing
| performer | 0..1 | Reference | Who should be responsible for test result
| quantity | 0..1 | Quantity | The number of copies of the sequence of interest.  (RNASeq)
| referenceSeq | 0..1 | BackboneElement | A sequence used as reference
| variant | 0..* | BackboneElement | Variant in sequence
| observedSeq | 0..1 | string | Sequence that was observed
| quality | 0..* | BackboneElement | An set of value as quality of sequence
| readCoverage | 0..1 | integer | Average number of reads representing a given nucleotide in the reconstructed sequence
| repository | 0..* | BackboneElement | External repository which contains detailed report related with observedSeq in this resource
| pointer | 0..* | Reference | Pointer to next atomic sequence
| structureVariant | 0..* | BackboneElement | Structural variant

## Search Parameters

| Name | Type | Description | Expression
| --- | --- | --- | --- |
| chromosome | token | Chromosome number of the reference sequence | MolecularSequence.referenceSeq.chromosome
| identifier | token | The unique identity for a particular sequence | MolecularSequence.identifier
| patient | reference | The subject that the observation is about | MolecularSequence.patient
| referenceseqid | token | Reference Sequence of the sequence | MolecularSequence.referenceSeq.referenceSeqId
| type | token | Amino Acid Sequence/ DNA Sequence / RNA Sequence | MolecularSequence.type
| variant-end | number | End position (0-based exclusive, which menas the acid at this position will not be included, 1-based inclusive, which means the acid at this position will be included) of the variant. | MolecularSequence.variant.end
| variant-start | number | Start position (0-based inclusive, 1-based inclusive, that means the nucleic acid or amino acid at this position will be included) of the variant. | MolecularSequence.variant.start
| window-end | number | End position (0-based exclusive, which menas the acid at this position will not be included, 1-based inclusive, which means the acid at this position will be included) of the reference sequence. | MolecularSequence.referenceSeq.windowEnd
| window-start | number | Start position (0-based inclusive, 1-based inclusive, that means the nucleic acid or amino acid at this position will be included) of the reference sequence. | MolecularSequence.referenceSeq.windowStart
| chromosome-variant-coordinate | composite | Search parameter by chromosome and variant coordinate. This will refer to part of a locus or part of a gene where search region will be represented in 1-based system. Since the coordinateSystem can either be 0-based or 1-based, this search query will include the result of both coordinateSystem that contains the equivalent segment of the gene or whole genome sequence. For example, a search for sequence can be represented as `chromosome-variant-coordinate=1$lt345$gt123`, this means it will search for the MolecularSequence resource with variants on chromosome 1 and with position >123 and <345, where in 1-based system resource, all strings within region 1:124-344 will be revealed, while in 0-based system resource, all strings within region 1:123-344 will be revealed. You may want to check detail about 0-based v.s. 1-based above. | MolecularSequence.variant
| chromosome-window-coordinate | composite | Search parameter by chromosome and window. This will refer to part of a locus or part of a gene where search region will be represented in 1-based system. Since the coordinateSystem can either be 0-based or 1-based, this search query will include the result of both coordinateSystem that contains the equivalent segment of the gene or whole genome sequence. For example, a search for sequence can be represented as `chromosome-window-coordinate=1$lt345$gt123`, this means it will search for the MolecularSequence resource with a window on chromosome 1 and with position >123 and <345, where in 1-based system resource, all strings within region 1:124-344 will be revealed, while in 0-based system resource, all strings within region 1:123-344 will be revealed. You may want to check detail about 0-based v.s. 1-based above. | MolecularSequence.referenceSeq
| referenceseqid-variant-coordinate | composite | Search parameter by reference sequence and variant coordinate. This will refer to part of a locus or part of a gene where search region will be represented in 1-based system. Since the coordinateSystem can either be 0-based or 1-based, this search query will include the result of both coordinateSystem that contains the equivalent segment of the gene or whole genome sequence. For example, a search for sequence can be represented as `referenceSeqId-variant-coordinate=NC_000001.11$lt345$gt123`, this means it will search for the MolecularSequence resource with variants on NC_000001.11 and with position >123 and <345, where in 1-based system resource, all strings within region NC_000001.11:124-344 will be revealed, while in 0-based system resource, all strings within region NC_000001.11:123-344 will be revealed. You may want to check detail about 0-based v.s. 1-based above. | MolecularSequence.variant
| referenceseqid-window-coordinate | composite | Search parameter by reference sequence and window. This will refer to part of a locus or part of a gene where search region will be represented in 1-based system. Since the coordinateSystem can either be 0-based or 1-based, this search query will include the result of both coordinateSystem that contains the equivalent segment of the gene or whole genome sequence. For example, a search for sequence can be represented as `referenceSeqId-window-coordinate=NC_000001.11$lt345$gt123`, this means it will search for the MolecularSequence resource with a window on NC_000001.11 and with position >123 and <345, where in 1-based system resource, all strings within region NC_000001.11:124-344 will be revealed, while in 0-based system resource, all strings within region NC_000001.11:123-344 will be revealed. You may want to check detail about 0-based v.s. 1-based above. | MolecularSequence.referenceSeq

