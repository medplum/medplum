/*
 * This is a generated file
 * Do not edit manually.
 */

import { CodeableConcept } from './CodeableConcept';
import { Device } from './Device';
import { Extension } from './Extension';
import { Identifier } from './Identifier';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { Observation } from './Observation';
import { Organization } from './Organization';
import { Patient } from './Patient';
import { PrimitiveExtension } from './PrimitiveExtension';
import { Quantity } from './Quantity';
import { Reference } from './Reference';
import { Resource } from './Resource';
import { Specimen } from './Specimen';

/**
 * Raw data describing a biological sequence.
 */
export interface MolecularSequence {

  /**
   * This is a MolecularSequence resource
   */
  readonly resourceType: 'MolecularSequence';

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  id?: string;

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  _id?: PrimitiveExtension;

  /**
   * The metadata about the resource. This is content that is maintained by
   * the infrastructure. Changes to the content might not always be
   * associated with version changes to the resource.
   */
  meta?: Meta;

  /**
   * A reference to a set of rules that were followed when the resource was
   * constructed, and which must be understood when processing the content.
   * Often, this is a reference to an implementation guide that defines the
   * special rules along with other profiles etc.
   */
  implicitRules?: string;

  /**
   * A reference to a set of rules that were followed when the resource was
   * constructed, and which must be understood when processing the content.
   * Often, this is a reference to an implementation guide that defines the
   * special rules along with other profiles etc.
   */
  _implicitRules?: PrimitiveExtension;

  /**
   * The base language in which the resource is written.
   */
  language?: string;

  /**
   * The base language in which the resource is written.
   */
  _language?: PrimitiveExtension;

  /**
   * A human-readable narrative that contains a summary of the resource and
   * can be used to represent the content of the resource to a human. The
   * narrative need not encode all the structured data, but is required to
   * contain sufficient detail to make it &quot;clinically safe&quot; for a human to
   * just read the narrative. Resource definitions may define what content
   * should be represented in the narrative to ensure clinical safety.
   */
  text?: Narrative;

  /**
   * These resources do not have an independent existence apart from the
   * resource that contains them - they cannot be identified independently,
   * and nor can they have their own independent transaction scope.
   */
  contained?: Resource[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the resource. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the resource and that modifies the
   * understanding of the element that contains it and/or the understanding
   * of the containing element's descendants. Usually modifier elements
   * provide negation or qualification. To make the use of extensions safe
   * and manageable, there is a strict set of governance applied to the
   * definition and use of extensions. Though any implementer is allowed to
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension. Applications processing a
   * resource are required to check for modifier extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * A unique identifier for this particular sequence instance. This is a
   * FHIR-defined id.
   */
  identifier?: Identifier[];

  /**
   * Amino Acid Sequence/ DNA Sequence / RNA Sequence.
   */
  type?: 'aa' | 'dna' | 'rna';

  /**
   * Amino Acid Sequence/ DNA Sequence / RNA Sequence.
   */
  _type?: PrimitiveExtension;

  /**
   * Whether the sequence is numbered starting at 0 (0-based numbering or
   * coordinates, inclusive start, exclusive end) or starting at 1 (1-based
   * numbering, inclusive start and inclusive end).
   */
  coordinateSystem: number;

  /**
   * Whether the sequence is numbered starting at 0 (0-based numbering or
   * coordinates, inclusive start, exclusive end) or starting at 1 (1-based
   * numbering, inclusive start and inclusive end).
   */
  _coordinateSystem?: PrimitiveExtension;

  /**
   * The patient whose sequencing results are described by this resource.
   */
  patient?: Reference<Patient>;

  /**
   * Specimen used for sequencing.
   */
  specimen?: Reference<Specimen>;

  /**
   * The method for sequencing, for example, chip information.
   */
  device?: Reference<Device>;

  /**
   * The organization or lab that should be responsible for this result.
   */
  performer?: Reference<Organization>;

  /**
   * The number of copies of the sequence of interest. (RNASeq).
   */
  quantity?: Quantity;

  /**
   * A sequence that is used as a reference to describe variants that are
   * present in a sequence analyzed.
   */
  referenceSeq?: MolecularSequenceReferenceSeq;

  /**
   * The definition of variant here originates from Sequence ontology
   * ([variant_of](http://www.sequenceontology.org/browser/current_svn/term/variant_of)).
   * This element can represent amino acid or nucleic sequence
   * change(including insertion,deletion,SNP,etc.)  It can represent some
   * complex mutation or segment variation with the assist of CIGAR string.
   */
  variant?: MolecularSequenceVariant[];

  /**
   * Sequence that was observed. It is the result marked by referenceSeq
   * along with variant records on referenceSeq. This shall start from
   * referenceSeq.windowStart and end by referenceSeq.windowEnd.
   */
  observedSeq?: string;

  /**
   * Sequence that was observed. It is the result marked by referenceSeq
   * along with variant records on referenceSeq. This shall start from
   * referenceSeq.windowStart and end by referenceSeq.windowEnd.
   */
  _observedSeq?: PrimitiveExtension;

  /**
   * An experimental feature attribute that defines the quality of the
   * feature in a quantitative way, such as a phred quality score
   * ([SO:0001686](http://www.sequenceontology.org/browser/current_svn/term/SO:0001686)).
   */
  quality?: MolecularSequenceQuality[];

  /**
   * Coverage (read depth or depth) is the average number of reads
   * representing a given nucleotide in the reconstructed sequence.
   */
  readCoverage?: number;

  /**
   * Coverage (read depth or depth) is the average number of reads
   * representing a given nucleotide in the reconstructed sequence.
   */
  _readCoverage?: PrimitiveExtension;

  /**
   * Configurations of the external repository. The repository shall store
   * target's observedSeq or records related with target's observedSeq.
   */
  repository?: MolecularSequenceRepository[];

  /**
   * Pointer to next atomic sequence which at most contains one variant.
   */
  pointer?: Reference<MolecularSequence>[];

  /**
   * Information about chromosome structure variation.
   */
  structureVariant?: MolecularSequenceStructureVariant[];
}

/**
 * An experimental feature attribute that defines the quality of the
 * feature in a quantitative way, such as a phred quality score
 * ([SO:0001686](http://www.sequenceontology.org/browser/current_svn/term/SO:0001686)).
 */
export interface MolecularSequenceQuality {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * INDEL / SNP / Undefined variant.
   */
  type: 'indel' | 'snp' | 'unknown';

  /**
   * INDEL / SNP / Undefined variant.
   */
  _type?: PrimitiveExtension;

  /**
   * Gold standard sequence used for comparing against.
   */
  standardSequence?: CodeableConcept;

  /**
   * Start position of the sequence. If the coordinate system is either
   * 0-based or 1-based, then start position is inclusive.
   */
  start?: number;

  /**
   * Start position of the sequence. If the coordinate system is either
   * 0-based or 1-based, then start position is inclusive.
   */
  _start?: PrimitiveExtension;

  /**
   * End position of the sequence. If the coordinate system is 0-based then
   * end is exclusive and does not include the last position. If the
   * coordinate system is 1-base, then end is inclusive and includes the
   * last position.
   */
  end?: number;

  /**
   * End position of the sequence. If the coordinate system is 0-based then
   * end is exclusive and does not include the last position. If the
   * coordinate system is 1-base, then end is inclusive and includes the
   * last position.
   */
  _end?: PrimitiveExtension;

  /**
   * The score of an experimentally derived feature such as a p-value
   * ([SO:0001685](http://www.sequenceontology.org/browser/current_svn/term/SO:0001685)).
   */
  score?: Quantity;

  /**
   * Which method is used to get sequence quality.
   */
  method?: CodeableConcept;

  /**
   * True positives, from the perspective of the truth data, i.e. the
   * number of sites in the Truth Call Set for which there are paths
   * through the Query Call Set that are consistent with all of the alleles
   * at this site, and for which there is an accurate genotype call for the
   * event.
   */
  truthTP?: number;

  /**
   * True positives, from the perspective of the truth data, i.e. the
   * number of sites in the Truth Call Set for which there are paths
   * through the Query Call Set that are consistent with all of the alleles
   * at this site, and for which there is an accurate genotype call for the
   * event.
   */
  _truthTP?: PrimitiveExtension;

  /**
   * True positives, from the perspective of the query data, i.e. the
   * number of sites in the Query Call Set for which there are paths
   * through the Truth Call Set that are consistent with all of the alleles
   * at this site, and for which there is an accurate genotype call for the
   * event.
   */
  queryTP?: number;

  /**
   * True positives, from the perspective of the query data, i.e. the
   * number of sites in the Query Call Set for which there are paths
   * through the Truth Call Set that are consistent with all of the alleles
   * at this site, and for which there is an accurate genotype call for the
   * event.
   */
  _queryTP?: PrimitiveExtension;

  /**
   * False negatives, i.e. the number of sites in the Truth Call Set for
   * which there is no path through the Query Call Set that is consistent
   * with all of the alleles at this site, or sites for which there is an
   * inaccurate genotype call for the event. Sites with correct variant but
   * incorrect genotype are counted here.
   */
  truthFN?: number;

  /**
   * False negatives, i.e. the number of sites in the Truth Call Set for
   * which there is no path through the Query Call Set that is consistent
   * with all of the alleles at this site, or sites for which there is an
   * inaccurate genotype call for the event. Sites with correct variant but
   * incorrect genotype are counted here.
   */
  _truthFN?: PrimitiveExtension;

  /**
   * False positives, i.e. the number of sites in the Query Call Set for
   * which there is no path through the Truth Call Set that is consistent
   * with this site. Sites with correct variant but incorrect genotype are
   * counted here.
   */
  queryFP?: number;

  /**
   * False positives, i.e. the number of sites in the Query Call Set for
   * which there is no path through the Truth Call Set that is consistent
   * with this site. Sites with correct variant but incorrect genotype are
   * counted here.
   */
  _queryFP?: PrimitiveExtension;

  /**
   * The number of false positives where the non-REF alleles in the Truth
   * and Query Call Sets match (i.e. cases where the truth is 1/1 and the
   * query is 0/1 or similar).
   */
  gtFP?: number;

  /**
   * The number of false positives where the non-REF alleles in the Truth
   * and Query Call Sets match (i.e. cases where the truth is 1/1 and the
   * query is 0/1 or similar).
   */
  _gtFP?: PrimitiveExtension;

  /**
   * QUERY.TP / (QUERY.TP + QUERY.FP).
   */
  precision?: number;

  /**
   * QUERY.TP / (QUERY.TP + QUERY.FP).
   */
  _precision?: PrimitiveExtension;

  /**
   * TRUTH.TP / (TRUTH.TP + TRUTH.FN).
   */
  recall?: number;

  /**
   * TRUTH.TP / (TRUTH.TP + TRUTH.FN).
   */
  _recall?: PrimitiveExtension;

  /**
   * Harmonic mean of Recall and Precision, computed as: 2 * precision *
   * recall / (precision + recall).
   */
  fScore?: number;

  /**
   * Harmonic mean of Recall and Precision, computed as: 2 * precision *
   * recall / (precision + recall).
   */
  _fScore?: PrimitiveExtension;

  /**
   * Receiver Operator Characteristic (ROC) Curve  to give
   * sensitivity/specificity tradeoff.
   */
  roc?: MolecularSequenceQualityRoc;
}

/**
 * Receiver Operator Characteristic (ROC) Curve  to give
 * sensitivity/specificity tradeoff.
 */
export interface MolecularSequenceQualityRoc {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Invidual data point representing the GQ (genotype quality) score
   * threshold.
   */
  score?: number[];

  /**
   * Invidual data point representing the GQ (genotype quality) score
   * threshold.
   */
  _score?: (PrimitiveExtension | null)[];

  /**
   * The number of true positives if the GQ score threshold was set to
   * &quot;score&quot; field value.
   */
  numTP?: number[];

  /**
   * The number of true positives if the GQ score threshold was set to
   * &quot;score&quot; field value.
   */
  _numTP?: (PrimitiveExtension | null)[];

  /**
   * The number of false positives if the GQ score threshold was set to
   * &quot;score&quot; field value.
   */
  numFP?: number[];

  /**
   * The number of false positives if the GQ score threshold was set to
   * &quot;score&quot; field value.
   */
  _numFP?: (PrimitiveExtension | null)[];

  /**
   * The number of false negatives if the GQ score threshold was set to
   * &quot;score&quot; field value.
   */
  numFN?: number[];

  /**
   * The number of false negatives if the GQ score threshold was set to
   * &quot;score&quot; field value.
   */
  _numFN?: (PrimitiveExtension | null)[];

  /**
   * Calculated precision if the GQ score threshold was set to &quot;score&quot;
   * field value.
   */
  precision?: number[];

  /**
   * Calculated precision if the GQ score threshold was set to &quot;score&quot;
   * field value.
   */
  _precision?: (PrimitiveExtension | null)[];

  /**
   * Calculated sensitivity if the GQ score threshold was set to &quot;score&quot;
   * field value.
   */
  sensitivity?: number[];

  /**
   * Calculated sensitivity if the GQ score threshold was set to &quot;score&quot;
   * field value.
   */
  _sensitivity?: (PrimitiveExtension | null)[];

  /**
   * Calculated fScore if the GQ score threshold was set to &quot;score&quot; field
   * value.
   */
  fMeasure?: number[];

  /**
   * Calculated fScore if the GQ score threshold was set to &quot;score&quot; field
   * value.
   */
  _fMeasure?: (PrimitiveExtension | null)[];
}

/**
 * A sequence that is used as a reference to describe variants that are
 * present in a sequence analyzed.
 */
export interface MolecularSequenceReferenceSeq {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Structural unit composed of a nucleic acid molecule which controls its
   * own replication through the interaction of specific proteins at one or
   * more origins of replication
   * ([SO:0000340](http://www.sequenceontology.org/browser/current_svn/term/SO:0000340)).
   */
  chromosome?: CodeableConcept;

  /**
   * The Genome Build used for reference, following GRCh build versions
   * e.g. 'GRCh 37'.  Version number must be included if a versioned
   * release of a primary build was used.
   */
  genomeBuild?: string;

  /**
   * The Genome Build used for reference, following GRCh build versions
   * e.g. 'GRCh 37'.  Version number must be included if a versioned
   * release of a primary build was used.
   */
  _genomeBuild?: PrimitiveExtension;

  /**
   * A relative reference to a DNA strand based on gene orientation. The
   * strand that contains the open reading frame of the gene is the &quot;sense&quot;
   * strand, and the opposite complementary strand is the &quot;antisense&quot;
   * strand.
   */
  orientation?: 'sense' | 'antisense';

  /**
   * A relative reference to a DNA strand based on gene orientation. The
   * strand that contains the open reading frame of the gene is the &quot;sense&quot;
   * strand, and the opposite complementary strand is the &quot;antisense&quot;
   * strand.
   */
  _orientation?: PrimitiveExtension;

  /**
   * Reference identifier of reference sequence submitted to NCBI. It must
   * match the type in the MolecularSequence.type field. For example, the
   * prefix, &ldquo;NG_&rdquo; identifies reference sequence for genes, &ldquo;NM_&rdquo; for
   * messenger RNA transcripts, and &ldquo;NP_&rdquo; for amino acid sequences.
   */
  referenceSeqId?: CodeableConcept;

  /**
   * A pointer to another MolecularSequence entity as reference sequence.
   */
  referenceSeqPointer?: Reference<MolecularSequence>;

  /**
   * A string like &quot;ACGT&quot;.
   */
  referenceSeqString?: string;

  /**
   * A string like &quot;ACGT&quot;.
   */
  _referenceSeqString?: PrimitiveExtension;

  /**
   * An absolute reference to a strand. The Watson strand is the strand
   * whose 5'-end is on the short arm of the chromosome, and the Crick
   * strand as the one whose 5'-end is on the long arm.
   */
  strand?: 'watson' | 'crick';

  /**
   * An absolute reference to a strand. The Watson strand is the strand
   * whose 5'-end is on the short arm of the chromosome, and the Crick
   * strand as the one whose 5'-end is on the long arm.
   */
  _strand?: PrimitiveExtension;

  /**
   * Start position of the window on the reference sequence. If the
   * coordinate system is either 0-based or 1-based, then start position is
   * inclusive.
   */
  windowStart?: number;

  /**
   * Start position of the window on the reference sequence. If the
   * coordinate system is either 0-based or 1-based, then start position is
   * inclusive.
   */
  _windowStart?: PrimitiveExtension;

  /**
   * End position of the window on the reference sequence. If the
   * coordinate system is 0-based then end is exclusive and does not
   * include the last position. If the coordinate system is 1-base, then
   * end is inclusive and includes the last position.
   */
  windowEnd?: number;

  /**
   * End position of the window on the reference sequence. If the
   * coordinate system is 0-based then end is exclusive and does not
   * include the last position. If the coordinate system is 1-base, then
   * end is inclusive and includes the last position.
   */
  _windowEnd?: PrimitiveExtension;
}

/**
 * Configurations of the external repository. The repository shall store
 * target's observedSeq or records related with target's observedSeq.
 */
export interface MolecularSequenceRepository {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Click and see / RESTful API / Need login to see / RESTful API with
   * authentication / Other ways to see resource.
   */
  type: 'directlink' | 'openapi' | 'login' | 'oauth' | 'other';

  /**
   * Click and see / RESTful API / Need login to see / RESTful API with
   * authentication / Other ways to see resource.
   */
  _type?: PrimitiveExtension;

  /**
   * URI of an external repository which contains further details about the
   * genetics data.
   */
  url?: string;

  /**
   * URI of an external repository which contains further details about the
   * genetics data.
   */
  _url?: PrimitiveExtension;

  /**
   * URI of an external repository which contains further details about the
   * genetics data.
   */
  name?: string;

  /**
   * URI of an external repository which contains further details about the
   * genetics data.
   */
  _name?: PrimitiveExtension;

  /**
   * Id of the variant in this external repository. The server will
   * understand how to use this id to call for more info about datasets in
   * external repository.
   */
  datasetId?: string;

  /**
   * Id of the variant in this external repository. The server will
   * understand how to use this id to call for more info about datasets in
   * external repository.
   */
  _datasetId?: PrimitiveExtension;

  /**
   * Id of the variantset in this external repository. The server will
   * understand how to use this id to call for more info about variantsets
   * in external repository.
   */
  variantsetId?: string;

  /**
   * Id of the variantset in this external repository. The server will
   * understand how to use this id to call for more info about variantsets
   * in external repository.
   */
  _variantsetId?: PrimitiveExtension;

  /**
   * Id of the read in this external repository.
   */
  readsetId?: string;

  /**
   * Id of the read in this external repository.
   */
  _readsetId?: PrimitiveExtension;
}

/**
 * Information about chromosome structure variation.
 */
export interface MolecularSequenceStructureVariant {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Information about chromosome structure variation DNA change type.
   */
  variantType?: CodeableConcept;

  /**
   * Used to indicate if the outer and inner start-end values have the same
   * meaning.
   */
  exact?: boolean;

  /**
   * Used to indicate if the outer and inner start-end values have the same
   * meaning.
   */
  _exact?: PrimitiveExtension;

  /**
   * Length of the variant chromosome.
   */
  length?: number;

  /**
   * Length of the variant chromosome.
   */
  _length?: PrimitiveExtension;

  /**
   * Structural variant outer.
   */
  outer?: MolecularSequenceStructureVariantOuter;

  /**
   * Structural variant inner.
   */
  inner?: MolecularSequenceStructureVariantInner;
}

/**
 * Structural variant inner.
 */
export interface MolecularSequenceStructureVariantInner {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Structural variant inner start. If the coordinate system is either
   * 0-based or 1-based, then start position is inclusive.
   */
  start?: number;

  /**
   * Structural variant inner start. If the coordinate system is either
   * 0-based or 1-based, then start position is inclusive.
   */
  _start?: PrimitiveExtension;

  /**
   * Structural variant inner end. If the coordinate system is 0-based then
   * end is exclusive and does not include the last position. If the
   * coordinate system is 1-base, then end is inclusive and includes the
   * last position.
   */
  end?: number;

  /**
   * Structural variant inner end. If the coordinate system is 0-based then
   * end is exclusive and does not include the last position. If the
   * coordinate system is 1-base, then end is inclusive and includes the
   * last position.
   */
  _end?: PrimitiveExtension;
}

/**
 * Structural variant outer.
 */
export interface MolecularSequenceStructureVariantOuter {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Structural variant outer start. If the coordinate system is either
   * 0-based or 1-based, then start position is inclusive.
   */
  start?: number;

  /**
   * Structural variant outer start. If the coordinate system is either
   * 0-based or 1-based, then start position is inclusive.
   */
  _start?: PrimitiveExtension;

  /**
   * Structural variant outer end. If the coordinate system is 0-based then
   * end is exclusive and does not include the last position. If the
   * coordinate system is 1-base, then end is inclusive and includes the
   * last position.
   */
  end?: number;

  /**
   * Structural variant outer end. If the coordinate system is 0-based then
   * end is exclusive and does not include the last position. If the
   * coordinate system is 1-base, then end is inclusive and includes the
   * last position.
   */
  _end?: PrimitiveExtension;
}

/**
 * The definition of variant here originates from Sequence ontology
 * ([variant_of](http://www.sequenceontology.org/browser/current_svn/term/variant_of)).
 * This element can represent amino acid or nucleic sequence
 * change(including insertion,deletion,SNP,etc.)  It can represent some
 * complex mutation or segment variation with the assist of CIGAR string.
 */
export interface MolecularSequenceVariant {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  _id?: PrimitiveExtension;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and manageable, there is a strict set of governance
   * applied to the definition and use of extensions. Though any
   * implementer can define an extension, there is a set of requirements
   * that SHALL be met as part of the definition of the extension.
   * Applications processing a resource are required to check for modifier
   * extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * Start position of the variant on the  reference sequence. If the
   * coordinate system is either 0-based or 1-based, then start position is
   * inclusive.
   */
  start?: number;

  /**
   * Start position of the variant on the  reference sequence. If the
   * coordinate system is either 0-based or 1-based, then start position is
   * inclusive.
   */
  _start?: PrimitiveExtension;

  /**
   * End position of the variant on the reference sequence. If the
   * coordinate system is 0-based then end is exclusive and does not
   * include the last position. If the coordinate system is 1-base, then
   * end is inclusive and includes the last position.
   */
  end?: number;

  /**
   * End position of the variant on the reference sequence. If the
   * coordinate system is 0-based then end is exclusive and does not
   * include the last position. If the coordinate system is 1-base, then
   * end is inclusive and includes the last position.
   */
  _end?: PrimitiveExtension;

  /**
   * An allele is one of a set of coexisting sequence variants of a gene
   * ([SO:0001023](http://www.sequenceontology.org/browser/current_svn/term/SO:0001023)).
   * Nucleotide(s)/amino acids from start position of sequence to stop
   * position of sequence on the positive (+) strand of the observed
   * sequence. When the sequence  type is DNA, it should be the sequence on
   * the positive (+) strand. This will lay in the range between
   * variant.start and variant.end.
   */
  observedAllele?: string;

  /**
   * An allele is one of a set of coexisting sequence variants of a gene
   * ([SO:0001023](http://www.sequenceontology.org/browser/current_svn/term/SO:0001023)).
   * Nucleotide(s)/amino acids from start position of sequence to stop
   * position of sequence on the positive (+) strand of the observed
   * sequence. When the sequence  type is DNA, it should be the sequence on
   * the positive (+) strand. This will lay in the range between
   * variant.start and variant.end.
   */
  _observedAllele?: PrimitiveExtension;

  /**
   * An allele is one of a set of coexisting sequence variants of a gene
   * ([SO:0001023](http://www.sequenceontology.org/browser/current_svn/term/SO:0001023)).
   * Nucleotide(s)/amino acids from start position of sequence to stop
   * position of sequence on the positive (+) strand of the reference
   * sequence. When the sequence  type is DNA, it should be the sequence on
   * the positive (+) strand. This will lay in the range between
   * variant.start and variant.end.
   */
  referenceAllele?: string;

  /**
   * An allele is one of a set of coexisting sequence variants of a gene
   * ([SO:0001023](http://www.sequenceontology.org/browser/current_svn/term/SO:0001023)).
   * Nucleotide(s)/amino acids from start position of sequence to stop
   * position of sequence on the positive (+) strand of the reference
   * sequence. When the sequence  type is DNA, it should be the sequence on
   * the positive (+) strand. This will lay in the range between
   * variant.start and variant.end.
   */
  _referenceAllele?: PrimitiveExtension;

  /**
   * Extended CIGAR string for aligning the sequence with reference bases.
   * See detailed documentation
   * [here](http://support.illumina.com/help/SequencingAnalysisWorkflow/Content/Vault/Informatics/Sequencing_Analysis/CASAVA/swSEQ_mCA_ExtendedCIGARFormat.htm).
   */
  cigar?: string;

  /**
   * Extended CIGAR string for aligning the sequence with reference bases.
   * See detailed documentation
   * [here](http://support.illumina.com/help/SequencingAnalysisWorkflow/Content/Vault/Informatics/Sequencing_Analysis/CASAVA/swSEQ_mCA_ExtendedCIGARFormat.htm).
   */
  _cigar?: PrimitiveExtension;

  /**
   * A pointer to an Observation containing variant information.
   */
  variantPointer?: Reference<Observation>;
}
