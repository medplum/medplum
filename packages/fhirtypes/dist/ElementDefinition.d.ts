/*
 * This is a generated file
 * Do not edit manually.
 */

import { Address } from './Address';
import { Age } from './Age';
import { Annotation } from './Annotation';
import { Attachment } from './Attachment';
import { CodeableConcept } from './CodeableConcept';
import { Coding } from './Coding';
import { ContactDetail } from './ContactDetail';
import { ContactPoint } from './ContactPoint';
import { Contributor } from './Contributor';
import { Count } from './Count';
import { DataRequirement } from './DataRequirement';
import { Distance } from './Distance';
import { Dosage } from './Dosage';
import { Duration } from './Duration';
import { Expression } from './Expression';
import { Extension } from './Extension';
import { HumanName } from './HumanName';
import { Identifier } from './Identifier';
import { Meta } from './Meta';
import { Money } from './Money';
import { ParameterDefinition } from './ParameterDefinition';
import { Period } from './Period';
import { PrimitiveExtension } from './PrimitiveExtension';
import { Quantity } from './Quantity';
import { Range } from './Range';
import { Ratio } from './Ratio';
import { Reference } from './Reference';
import { RelatedArtifact } from './RelatedArtifact';
import { SampledData } from './SampledData';
import { Signature } from './Signature';
import { Timing } from './Timing';
import { TriggerDefinition } from './TriggerDefinition';
import { UsageContext } from './UsageContext';

/**
 * Captures constraints on each element within the resource, profile, or
 * extension.
 */
export interface ElementDefinition {

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
   * The path identifies the element and is expressed as a &quot;.&quot;-separated
   * list of ancestor elements, beginning with the name of the resource or
   * extension.
   */
  path: string;

  /**
   * The path identifies the element and is expressed as a &quot;.&quot;-separated
   * list of ancestor elements, beginning with the name of the resource or
   * extension.
   */
  _path?: PrimitiveExtension;

  /**
   * Codes that define how this element is represented in instances, when
   * the deviation varies from the normal case.
   */
  representation?: ('xmlAttr' | 'xmlText' | 'typeAttr' | 'cdaText' | 'xhtml')[];

  /**
   * Codes that define how this element is represented in instances, when
   * the deviation varies from the normal case.
   */
  _representation?: (PrimitiveExtension | null)[];

  /**
   * The name of this element definition slice, when slicing is working.
   * The name must be a token with no dots or spaces. This is a unique name
   * referring to a specific set of constraints applied to this element,
   * used to provide a name to different slices of the same element.
   */
  sliceName?: string;

  /**
   * The name of this element definition slice, when slicing is working.
   * The name must be a token with no dots or spaces. This is a unique name
   * referring to a specific set of constraints applied to this element,
   * used to provide a name to different slices of the same element.
   */
  _sliceName?: PrimitiveExtension;

  /**
   * If true, indicates that this slice definition is constraining a slice
   * definition with the same name in an inherited profile. If false, the
   * slice is not overriding any slice in an inherited profile. If missing,
   * the slice might or might not be overriding a slice in an inherited
   * profile, depending on the sliceName.
   */
  sliceIsConstraining?: boolean;

  /**
   * If true, indicates that this slice definition is constraining a slice
   * definition with the same name in an inherited profile. If false, the
   * slice is not overriding any slice in an inherited profile. If missing,
   * the slice might or might not be overriding a slice in an inherited
   * profile, depending on the sliceName.
   */
  _sliceIsConstraining?: PrimitiveExtension;

  /**
   * A single preferred label which is the text to display beside the
   * element indicating its meaning or to use to prompt for the element in
   * a user display or form.
   */
  label?: string;

  /**
   * A single preferred label which is the text to display beside the
   * element indicating its meaning or to use to prompt for the element in
   * a user display or form.
   */
  _label?: PrimitiveExtension;

  /**
   * A code that has the same meaning as the element in a particular
   * terminology.
   */
  code?: Coding[];

  /**
   * Indicates that the element is sliced into a set of alternative
   * definitions (i.e. in a structure definition, there are multiple
   * different constraints on a single element in the base resource).
   * Slicing can be used in any resource that has cardinality ..* on the
   * base resource, or any resource with a choice of types. The set of
   * slices is any elements that come after this in the element sequence
   * that have the same path, until a shorter path occurs (the shorter path
   * terminates the set).
   */
  slicing?: ElementDefinitionSlicing;

  /**
   * A concise description of what this element means (e.g. for use in
   * autogenerated summaries).
   */
  short?: string;

  /**
   * A concise description of what this element means (e.g. for use in
   * autogenerated summaries).
   */
  _short?: PrimitiveExtension;

  /**
   * Provides a complete explanation of the meaning of the data element for
   * human readability.  For the case of elements derived from existing
   * elements (e.g. constraints), the definition SHALL be consistent with
   * the base definition, but convey the meaning of the element in the
   * particular context of use of the resource. (Note: The text you are
   * reading is specified in ElementDefinition.definition).
   */
  definition?: string;

  /**
   * Provides a complete explanation of the meaning of the data element for
   * human readability.  For the case of elements derived from existing
   * elements (e.g. constraints), the definition SHALL be consistent with
   * the base definition, but convey the meaning of the element in the
   * particular context of use of the resource. (Note: The text you are
   * reading is specified in ElementDefinition.definition).
   */
  _definition?: PrimitiveExtension;

  /**
   * Explanatory notes and implementation guidance about the data element,
   * including notes about how to use the data properly, exceptions to
   * proper use, etc. (Note: The text you are reading is specified in
   * ElementDefinition.comment).
   */
  comment?: string;

  /**
   * Explanatory notes and implementation guidance about the data element,
   * including notes about how to use the data properly, exceptions to
   * proper use, etc. (Note: The text you are reading is specified in
   * ElementDefinition.comment).
   */
  _comment?: PrimitiveExtension;

  /**
   * This element is for traceability of why the element was created and
   * why the constraints exist as they do. This may be used to point to
   * source materials or specifications that drove the structure of this
   * element.
   */
  requirements?: string;

  /**
   * This element is for traceability of why the element was created and
   * why the constraints exist as they do. This may be used to point to
   * source materials or specifications that drove the structure of this
   * element.
   */
  _requirements?: PrimitiveExtension;

  /**
   * Identifies additional names by which this element might also be known.
   */
  alias?: string[];

  /**
   * Identifies additional names by which this element might also be known.
   */
  _alias?: (PrimitiveExtension | null)[];

  /**
   * The minimum number of times this element SHALL appear in the instance.
   */
  min?: number;

  /**
   * The minimum number of times this element SHALL appear in the instance.
   */
  _min?: PrimitiveExtension;

  /**
   * The maximum number of times this element is permitted to appear in the
   * instance.
   */
  max?: string;

  /**
   * The maximum number of times this element is permitted to appear in the
   * instance.
   */
  _max?: PrimitiveExtension;

  /**
   * Information about the base definition of the element, provided to make
   * it unnecessary for tools to trace the deviation of the element through
   * the derived and related profiles. When the element definition is not
   * the original definition of an element - i.g. either in a constraint on
   * another type, or for elements from a super type in a snap shot - then
   * the information in provided in the element definition may be different
   * to the base definition. On the original definition of the element, it
   * will be same.
   */
  base?: ElementDefinitionBase;

  /**
   * Identifies an element defined elsewhere in the definition whose
   * content rules should be applied to the current element.
   * ContentReferences bring across all the rules that are in the
   * ElementDefinition for the element, including definitions, cardinality
   * constraints, bindings, invariants etc.
   */
  contentReference?: string;

  /**
   * Identifies an element defined elsewhere in the definition whose
   * content rules should be applied to the current element.
   * ContentReferences bring across all the rules that are in the
   * ElementDefinition for the element, including definitions, cardinality
   * constraints, bindings, invariants etc.
   */
  _contentReference?: PrimitiveExtension;

  /**
   * The data type or resource that the value of this element is permitted
   * to be.
   */
  type?: ElementDefinitionType[];

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueBase64Binary?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueBase64Binary?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueBoolean?: boolean;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueBoolean?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueCanonical?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueCanonical?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueCode?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueCode?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueDate?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueDate?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueDateTime?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueDateTime?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueDecimal?: number;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueDecimal?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueId?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueId?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueInstant?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueInstant?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueInteger?: number;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueInteger?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueMarkdown?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueMarkdown?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueOid?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueOid?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValuePositiveInt?: number;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValuePositiveInt?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueString?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueString?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueTime?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueTime?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueUnsignedInt?: number;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueUnsignedInt?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueUri?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueUri?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueUrl?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueUrl?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueUuid?: string;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  _defaultValueUuid?: PrimitiveExtension;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueAddress?: Address;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueAge?: Age;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueAnnotation?: Annotation;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueAttachment?: Attachment;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueCodeableConcept?: CodeableConcept;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueCoding?: Coding;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueContactPoint?: ContactPoint;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueCount?: Count;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueDistance?: Distance;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueDuration?: Duration;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueHumanName?: HumanName;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueIdentifier?: Identifier;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueMoney?: Money;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValuePeriod?: Period;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueQuantity?: Quantity;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueRange?: Range;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueRatio?: Ratio;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueReference?: Reference;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueSampledData?: SampledData;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueSignature?: Signature;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueTiming?: Timing;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueContactDetail?: ContactDetail;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueContributor?: Contributor;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueDataRequirement?: DataRequirement;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueExpression?: Expression;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueParameterDefinition?: ParameterDefinition;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueRelatedArtifact?: RelatedArtifact;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueTriggerDefinition?: TriggerDefinition;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueUsageContext?: UsageContext;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueDosage?: Dosage;

  /**
   * The value that should be used if there is no value stated in the
   * instance (e.g. 'if not otherwise specified, the abstract is false').
   */
  defaultValueMeta?: Meta;

  /**
   * The Implicit meaning that is to be understood when this element is
   * missing (e.g. 'when this element is missing, the period is ongoing').
   */
  meaningWhenMissing?: string;

  /**
   * The Implicit meaning that is to be understood when this element is
   * missing (e.g. 'when this element is missing, the period is ongoing').
   */
  _meaningWhenMissing?: PrimitiveExtension;

  /**
   * If present, indicates that the order of the repeating element has
   * meaning and describes what that meaning is.  If absent, it means that
   * the order of the element has no meaning.
   */
  orderMeaning?: string;

  /**
   * If present, indicates that the order of the repeating element has
   * meaning and describes what that meaning is.  If absent, it means that
   * the order of the element has no meaning.
   */
  _orderMeaning?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedBase64Binary?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedBase64Binary?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedBoolean?: boolean;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedBoolean?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedCanonical?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedCanonical?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedCode?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedCode?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedDate?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedDate?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedDateTime?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedDateTime?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedDecimal?: number;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedDecimal?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedId?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedId?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedInstant?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedInstant?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedInteger?: number;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedInteger?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedMarkdown?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedMarkdown?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedOid?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedOid?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedPositiveInt?: number;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedPositiveInt?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedString?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedString?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedTime?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedTime?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedUnsignedInt?: number;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedUnsignedInt?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedUri?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedUri?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedUrl?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedUrl?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedUuid?: string;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  _fixedUuid?: PrimitiveExtension;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedAddress?: Address;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedAge?: Age;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedAnnotation?: Annotation;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedAttachment?: Attachment;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedCodeableConcept?: CodeableConcept;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedCoding?: Coding;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedContactPoint?: ContactPoint;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedCount?: Count;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedDistance?: Distance;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedDuration?: Duration;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedHumanName?: HumanName;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedIdentifier?: Identifier;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedMoney?: Money;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedPeriod?: Period;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedQuantity?: Quantity;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedRange?: Range;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedRatio?: Ratio;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedReference?: Reference;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedSampledData?: SampledData;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedSignature?: Signature;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedTiming?: Timing;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedContactDetail?: ContactDetail;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedContributor?: Contributor;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedDataRequirement?: DataRequirement;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedExpression?: Expression;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedParameterDefinition?: ParameterDefinition;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedRelatedArtifact?: RelatedArtifact;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedTriggerDefinition?: TriggerDefinition;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedUsageContext?: UsageContext;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedDosage?: Dosage;

  /**
   * Specifies a value that SHALL be exactly the value  for this element in
   * the instance. For purposes of comparison, non-significant whitespace
   * is ignored, and all values must be an exact match (case and accent
   * sensitive). Missing elements/attributes must also be missing.
   */
  fixedMeta?: Meta;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternBase64Binary?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternBase64Binary?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternBoolean?: boolean;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternBoolean?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternCanonical?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternCanonical?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternCode?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternCode?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternDate?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternDate?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternDateTime?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternDateTime?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternDecimal?: number;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternDecimal?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternId?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternId?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternInstant?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternInstant?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternInteger?: number;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternInteger?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternMarkdown?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternMarkdown?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternOid?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternOid?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternPositiveInt?: number;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternPositiveInt?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternString?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternString?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternTime?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternTime?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternUnsignedInt?: number;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternUnsignedInt?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternUri?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternUri?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternUrl?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternUrl?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternUuid?: string;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  _patternUuid?: PrimitiveExtension;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternAddress?: Address;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternAge?: Age;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternAnnotation?: Annotation;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternAttachment?: Attachment;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternCodeableConcept?: CodeableConcept;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternCoding?: Coding;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternContactPoint?: ContactPoint;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternCount?: Count;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternDistance?: Distance;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternDuration?: Duration;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternHumanName?: HumanName;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternIdentifier?: Identifier;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternMoney?: Money;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternPeriod?: Period;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternQuantity?: Quantity;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternRange?: Range;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternRatio?: Ratio;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternReference?: Reference;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternSampledData?: SampledData;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternSignature?: Signature;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternTiming?: Timing;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternContactDetail?: ContactDetail;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternContributor?: Contributor;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternDataRequirement?: DataRequirement;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternExpression?: Expression;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternParameterDefinition?: ParameterDefinition;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternRelatedArtifact?: RelatedArtifact;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternTriggerDefinition?: TriggerDefinition;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternUsageContext?: UsageContext;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternDosage?: Dosage;

  /**
   * Specifies a value that the value in the instance SHALL follow - that
   * is, any value in the pattern must be found in the instance. Other
   * additional values may be found too. This is effectively constraint by
   * example.
   *
   * When pattern[x] is used to constrain a primitive, it means that the
   * value provided in the pattern[x] must match the instance value
   * exactly.
   *
   * When pattern[x] is used to constrain an array, it means that each
   * element provided in the pattern[x] array must (recursively) match at
   * least one element from the instance array.
   *
   * When pattern[x] is used to constrain a complex object, it means that
   * each property in the pattern must be present in the complex object,
   * and its value must recursively match -- i.e.,
   *
   * 1. If primitive: it must match exactly the pattern value
   * 2. If a complex object: it must match (recursively) the pattern value
   * 3. If an array: it must match (recursively) the pattern value.
   */
  patternMeta?: Meta;

  /**
   * A sample value for this element demonstrating the type of information
   * that would typically be found in the element.
   */
  example?: ElementDefinitionExample[];

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValueDate?: string;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _minValueDate?: PrimitiveExtension;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValueDateTime?: string;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _minValueDateTime?: PrimitiveExtension;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValueInstant?: string;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _minValueInstant?: PrimitiveExtension;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValueTime?: string;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _minValueTime?: PrimitiveExtension;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValueDecimal?: number;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _minValueDecimal?: PrimitiveExtension;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValueInteger?: number;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _minValueInteger?: PrimitiveExtension;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValuePositiveInt?: number;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _minValuePositiveInt?: PrimitiveExtension;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValueUnsignedInt?: number;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _minValueUnsignedInt?: PrimitiveExtension;

  /**
   * The minimum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  minValueQuantity?: Quantity;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValueDate?: string;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _maxValueDate?: PrimitiveExtension;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValueDateTime?: string;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _maxValueDateTime?: PrimitiveExtension;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValueInstant?: string;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _maxValueInstant?: PrimitiveExtension;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValueTime?: string;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _maxValueTime?: PrimitiveExtension;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValueDecimal?: number;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _maxValueDecimal?: PrimitiveExtension;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValueInteger?: number;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _maxValueInteger?: PrimitiveExtension;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValuePositiveInt?: number;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _maxValuePositiveInt?: PrimitiveExtension;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValueUnsignedInt?: number;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  _maxValueUnsignedInt?: PrimitiveExtension;

  /**
   * The maximum allowed value for the element. The value is inclusive.
   * This is allowed for the types date, dateTime, instant, time, decimal,
   * integer, and Quantity.
   */
  maxValueQuantity?: Quantity;

  /**
   * Indicates the maximum length in characters that is permitted to be
   * present in conformant instances and which is expected to be supported
   * by conformant consumers that support the element.
   */
  maxLength?: number;

  /**
   * Indicates the maximum length in characters that is permitted to be
   * present in conformant instances and which is expected to be supported
   * by conformant consumers that support the element.
   */
  _maxLength?: PrimitiveExtension;

  /**
   * A reference to an invariant that may make additional statements about
   * the cardinality or value in the instance.
   */
  condition?: string[];

  /**
   * A reference to an invariant that may make additional statements about
   * the cardinality or value in the instance.
   */
  _condition?: (PrimitiveExtension | null)[];

  /**
   * Formal constraints such as co-occurrence and other constraints that
   * can be computationally evaluated within the context of the instance.
   */
  constraint?: ElementDefinitionConstraint[];

  /**
   * If true, implementations that produce or consume resources SHALL
   * provide &quot;support&quot; for the element in some meaningful way.  If false,
   * the element may be ignored and not supported. If false, whether to
   * populate or use the data element in any way is at the discretion of
   * the implementation.
   */
  mustSupport?: boolean;

  /**
   * If true, implementations that produce or consume resources SHALL
   * provide &quot;support&quot; for the element in some meaningful way.  If false,
   * the element may be ignored and not supported. If false, whether to
   * populate or use the data element in any way is at the discretion of
   * the implementation.
   */
  _mustSupport?: PrimitiveExtension;

  /**
   * If true, the value of this element affects the interpretation of the
   * element or resource that contains it, and the value of the element
   * cannot be ignored. Typically, this is used for status, negation and
   * qualification codes. The effect of this is that the element cannot be
   * ignored by systems: they SHALL either recognize the element and
   * process it, and/or a pre-determination has been made that it is not
   * relevant to their particular system.
   */
  isModifier?: boolean;

  /**
   * If true, the value of this element affects the interpretation of the
   * element or resource that contains it, and the value of the element
   * cannot be ignored. Typically, this is used for status, negation and
   * qualification codes. The effect of this is that the element cannot be
   * ignored by systems: they SHALL either recognize the element and
   * process it, and/or a pre-determination has been made that it is not
   * relevant to their particular system.
   */
  _isModifier?: PrimitiveExtension;

  /**
   * Explains how that element affects the interpretation of the resource
   * or element that contains it.
   */
  isModifierReason?: string;

  /**
   * Explains how that element affects the interpretation of the resource
   * or element that contains it.
   */
  _isModifierReason?: PrimitiveExtension;

  /**
   * Whether the element should be included if a client requests a search
   * with the parameter _summary=true.
   */
  isSummary?: boolean;

  /**
   * Whether the element should be included if a client requests a search
   * with the parameter _summary=true.
   */
  _isSummary?: PrimitiveExtension;

  /**
   * Binds to a value set if this element is coded (code, Coding,
   * CodeableConcept, Quantity), or the data types (string, uri).
   */
  binding?: ElementDefinitionBinding;

  /**
   * Identifies a concept from an external specification that roughly
   * corresponds to this element.
   */
  mapping?: ElementDefinitionMapping[];
}

/**
 * The value that should be used if there is no value stated in the
 * instance (e.g. 'if not otherwise specified, the abstract is false').
 */
export type ElementDefinitionDefaultValue = Address | Age | Annotation | Attachment | boolean | CodeableConcept | Coding
    | ContactDetail | ContactPoint | Contributor | Count | DataRequirement | Distance | Dosage | Duration | Expression |
    HumanName | Identifier | Meta | Money | number | ParameterDefinition | Period | PrimitiveExtension | Quantity | Range |
    Ratio | Reference | RelatedArtifact | SampledData | Signature | string | Timing | TriggerDefinition | UsageContext;

/**
 * Specifies a value that SHALL be exactly the value  for this element in
 * the instance. For purposes of comparison, non-significant whitespace
 * is ignored, and all values must be an exact match (case and accent
 * sensitive). Missing elements/attributes must also be missing.
 */
export type ElementDefinitionFixed = Address | Age | Annotation | Attachment | boolean | CodeableConcept | Coding |
    ContactDetail | ContactPoint | Contributor | Count | DataRequirement | Distance | Dosage | Duration | Expression |
    HumanName | Identifier | Meta | Money | number | ParameterDefinition | Period | PrimitiveExtension | Quantity | Range |
    Ratio | Reference | RelatedArtifact | SampledData | Signature | string | Timing | TriggerDefinition | UsageContext;

/**
 * Specifies a value that the value in the instance SHALL follow - that
 * is, any value in the pattern must be found in the instance. Other
 * additional values may be found too. This is effectively constraint by
 * example.
 *
 * When pattern[x] is used to constrain a primitive, it means that the
 * value provided in the pattern[x] must match the instance value
 * exactly.
 *
 * When pattern[x] is used to constrain an array, it means that each
 * element provided in the pattern[x] array must (recursively) match at
 * least one element from the instance array.
 *
 * When pattern[x] is used to constrain a complex object, it means that
 * each property in the pattern must be present in the complex object,
 * and its value must recursively match -- i.e.,
 *
 * 1. If primitive: it must match exactly the pattern value
 * 2. If a complex object: it must match (recursively) the pattern value
 * 3. If an array: it must match (recursively) the pattern value.
 */
export type ElementDefinitionPattern = Address | Age | Annotation | Attachment | boolean | CodeableConcept | Coding |
    ContactDetail | ContactPoint | Contributor | Count | DataRequirement | Distance | Dosage | Duration | Expression |
    HumanName | Identifier | Meta | Money | number | ParameterDefinition | Period | PrimitiveExtension | Quantity | Range |
    Ratio | Reference | RelatedArtifact | SampledData | Signature | string | Timing | TriggerDefinition | UsageContext;

/**
 * The minimum allowed value for the element. The value is inclusive.
 * This is allowed for the types date, dateTime, instant, time, decimal,
 * integer, and Quantity.
 */
export type ElementDefinitionMinValue = number | PrimitiveExtension | Quantity | string;

/**
 * The maximum allowed value for the element. The value is inclusive.
 * This is allowed for the types date, dateTime, instant, time, decimal,
 * integer, and Quantity.
 */
export type ElementDefinitionMaxValue = number | PrimitiveExtension | Quantity | string;

/**
 * Information about the base definition of the element, provided to make
 * it unnecessary for tools to trace the deviation of the element through
 * the derived and related profiles. When the element definition is not
 * the original definition of an element - i.g. either in a constraint on
 * another type, or for elements from a super type in a snap shot - then
 * the information in provided in the element definition may be different
 * to the base definition. On the original definition of the element, it
 * will be same.
 */
export interface ElementDefinitionBase {

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
   * The Path that identifies the base element - this matches the
   * ElementDefinition.path for that element. Across FHIR, there is only
   * one base definition of any element - that is, an element definition on
   * a [StructureDefinition](structuredefinition.html#) without a
   * StructureDefinition.base.
   */
  path: string;

  /**
   * The Path that identifies the base element - this matches the
   * ElementDefinition.path for that element. Across FHIR, there is only
   * one base definition of any element - that is, an element definition on
   * a [StructureDefinition](structuredefinition.html#) without a
   * StructureDefinition.base.
   */
  _path?: PrimitiveExtension;

  /**
   * Minimum cardinality of the base element identified by the path.
   */
  min: number;

  /**
   * Minimum cardinality of the base element identified by the path.
   */
  _min?: PrimitiveExtension;

  /**
   * Maximum cardinality of the base element identified by the path.
   */
  max: string;

  /**
   * Maximum cardinality of the base element identified by the path.
   */
  _max?: PrimitiveExtension;
}

/**
 * Binds to a value set if this element is coded (code, Coding,
 * CodeableConcept, Quantity), or the data types (string, uri).
 */
export interface ElementDefinitionBinding {

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
   * Indicates the degree of conformance expectations associated with this
   * binding - that is, the degree to which the provided value set must be
   * adhered to in the instances.
   */
  strength: 'required' | 'extensible' | 'preferred' | 'example';

  /**
   * Indicates the degree of conformance expectations associated with this
   * binding - that is, the degree to which the provided value set must be
   * adhered to in the instances.
   */
  _strength?: PrimitiveExtension;

  /**
   * Describes the intended use of this particular set of codes.
   */
  description?: string;

  /**
   * Describes the intended use of this particular set of codes.
   */
  _description?: PrimitiveExtension;

  /**
   * Refers to the value set that identifies the set of codes the binding
   * refers to.
   */
  valueSet?: string;

  /**
   * Refers to the value set that identifies the set of codes the binding
   * refers to.
   */
  _valueSet?: PrimitiveExtension;
}

/**
 * Formal constraints such as co-occurrence and other constraints that
 * can be computationally evaluated within the context of the instance.
 */
export interface ElementDefinitionConstraint {

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
   * Allows identification of which elements have their cardinalities
   * impacted by the constraint.  Will not be referenced for constraints
   * that do not affect cardinality.
   */
  key: string;

  /**
   * Allows identification of which elements have their cardinalities
   * impacted by the constraint.  Will not be referenced for constraints
   * that do not affect cardinality.
   */
  _key?: PrimitiveExtension;

  /**
   * Description of why this constraint is necessary or appropriate.
   */
  requirements?: string;

  /**
   * Description of why this constraint is necessary or appropriate.
   */
  _requirements?: PrimitiveExtension;

  /**
   * Identifies the impact constraint violation has on the conformance of
   * the instance.
   */
  severity: 'error' | 'warning';

  /**
   * Identifies the impact constraint violation has on the conformance of
   * the instance.
   */
  _severity?: PrimitiveExtension;

  /**
   * Text that can be used to describe the constraint in messages
   * identifying that the constraint has been violated.
   */
  human: string;

  /**
   * Text that can be used to describe the constraint in messages
   * identifying that the constraint has been violated.
   */
  _human?: PrimitiveExtension;

  /**
   * A [FHIRPath](fhirpath.html) expression of constraint that can be
   * executed to see if this constraint is met.
   */
  expression?: string;

  /**
   * A [FHIRPath](fhirpath.html) expression of constraint that can be
   * executed to see if this constraint is met.
   */
  _expression?: PrimitiveExtension;

  /**
   * An XPath expression of constraint that can be executed to see if this
   * constraint is met.
   */
  xpath?: string;

  /**
   * An XPath expression of constraint that can be executed to see if this
   * constraint is met.
   */
  _xpath?: PrimitiveExtension;

  /**
   * A reference to the original source of the constraint, for traceability
   * purposes.
   */
  source?: string;

  /**
   * A reference to the original source of the constraint, for traceability
   * purposes.
   */
  _source?: PrimitiveExtension;
}

/**
 * A sample value for this element demonstrating the type of information
 * that would typically be found in the element.
 */
export interface ElementDefinitionExample {

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
   * Describes the purpose of this example amoung the set of examples.
   */
  label: string;

  /**
   * Describes the purpose of this example amoung the set of examples.
   */
  _label?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueBase64Binary?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueBase64Binary?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueBoolean?: boolean;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueBoolean?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueCanonical?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueCanonical?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueCode?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueCode?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueDate?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueDate?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueDateTime?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueDateTime?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueDecimal?: number;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueDecimal?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueId?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueId?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueInstant?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueInstant?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueInteger?: number;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueInteger?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueMarkdown?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueMarkdown?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueOid?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueOid?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valuePositiveInt?: number;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valuePositiveInt?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueString?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueString?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueTime?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueTime?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueUnsignedInt?: number;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueUnsignedInt?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueUri?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueUri?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueUrl?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueUrl?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueUuid?: string;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  _valueUuid?: PrimitiveExtension;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueAddress?: Address;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueAge?: Age;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueAnnotation?: Annotation;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueAttachment?: Attachment;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueCodeableConcept?: CodeableConcept;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueCoding?: Coding;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueContactPoint?: ContactPoint;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueCount?: Count;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueDistance?: Distance;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueDuration?: Duration;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueHumanName?: HumanName;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueIdentifier?: Identifier;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueMoney?: Money;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valuePeriod?: Period;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueQuantity?: Quantity;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueRange?: Range;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueRatio?: Ratio;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueReference?: Reference;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueSampledData?: SampledData;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueSignature?: Signature;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueTiming?: Timing;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueContactDetail?: ContactDetail;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueContributor?: Contributor;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueDataRequirement?: DataRequirement;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueExpression?: Expression;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueParameterDefinition?: ParameterDefinition;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueRelatedArtifact?: RelatedArtifact;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueTriggerDefinition?: TriggerDefinition;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueUsageContext?: UsageContext;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueDosage?: Dosage;

  /**
   * The actual value for the element, which must be one of the types
   * allowed for this element.
   */
  valueMeta?: Meta;
}

/**
 * The actual value for the element, which must be one of the types
 * allowed for this element.
 */
export type ElementDefinitionExampleValue = Address | Age | Annotation | Attachment | boolean | CodeableConcept | Coding
    | ContactDetail | ContactPoint | Contributor | Count | DataRequirement | Distance | Dosage | Duration | Expression |
    HumanName | Identifier | Meta | Money | number | ParameterDefinition | Period | PrimitiveExtension | Quantity | Range |
    Ratio | Reference | RelatedArtifact | SampledData | Signature | string | Timing | TriggerDefinition | UsageContext;

/**
 * Identifies a concept from an external specification that roughly
 * corresponds to this element.
 */
export interface ElementDefinitionMapping {

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
   * An internal reference to the definition of a mapping.
   */
  identity: string;

  /**
   * An internal reference to the definition of a mapping.
   */
  _identity?: PrimitiveExtension;

  /**
   * Identifies the computable language in which mapping.map is expressed.
   */
  language?: string;

  /**
   * Identifies the computable language in which mapping.map is expressed.
   */
  _language?: PrimitiveExtension;

  /**
   * Expresses what part of the target specification corresponds to this
   * element.
   */
  map: string;

  /**
   * Expresses what part of the target specification corresponds to this
   * element.
   */
  _map?: PrimitiveExtension;

  /**
   * Comments that provide information about the mapping or its use.
   */
  comment?: string;

  /**
   * Comments that provide information about the mapping or its use.
   */
  _comment?: PrimitiveExtension;
}

/**
 * Indicates that the element is sliced into a set of alternative
 * definitions (i.e. in a structure definition, there are multiple
 * different constraints on a single element in the base resource).
 * Slicing can be used in any resource that has cardinality ..* on the
 * base resource, or any resource with a choice of types. The set of
 * slices is any elements that come after this in the element sequence
 * that have the same path, until a shorter path occurs (the shorter path
 * terminates the set).
 */
export interface ElementDefinitionSlicing {

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
   * Designates which child elements are used to discriminate between the
   * slices when processing an instance. If one or more discriminators are
   * provided, the value of the child elements in the instance data SHALL
   * completely distinguish which slice the element in the resource matches
   * based on the allowed values for those elements in each of the slices.
   */
  discriminator?: ElementDefinitionSlicingDiscriminator[];

  /**
   * A human-readable text description of how the slicing works. If there
   * is no discriminator, this is required to be present to provide
   * whatever information is possible about how the slices can be
   * differentiated.
   */
  description?: string;

  /**
   * A human-readable text description of how the slicing works. If there
   * is no discriminator, this is required to be present to provide
   * whatever information is possible about how the slices can be
   * differentiated.
   */
  _description?: PrimitiveExtension;

  /**
   * If the matching elements have to occur in the same order as defined in
   * the profile.
   */
  ordered?: boolean;

  /**
   * If the matching elements have to occur in the same order as defined in
   * the profile.
   */
  _ordered?: PrimitiveExtension;

  /**
   * Whether additional slices are allowed or not. When the slices are
   * ordered, profile authors can also say that additional slices are only
   * allowed at the end.
   */
  rules: 'closed' | 'open' | 'openAtEnd';

  /**
   * Whether additional slices are allowed or not. When the slices are
   * ordered, profile authors can also say that additional slices are only
   * allowed at the end.
   */
  _rules?: PrimitiveExtension;
}

/**
 * Designates which child elements are used to discriminate between the
 * slices when processing an instance. If one or more discriminators are
 * provided, the value of the child elements in the instance data SHALL
 * completely distinguish which slice the element in the resource matches
 * based on the allowed values for those elements in each of the slices.
 */
export interface ElementDefinitionSlicingDiscriminator {

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
   * How the element value is interpreted when discrimination is evaluated.
   */
  type: 'value' | 'exists' | 'pattern' | 'type' | 'profile';

  /**
   * How the element value is interpreted when discrimination is evaluated.
   */
  _type?: PrimitiveExtension;

  /**
   * A FHIRPath expression, using [the simple subset of
   * FHIRPath](fhirpath.html#simple), that is used to identify the element
   * on which discrimination is based.
   */
  path: string;

  /**
   * A FHIRPath expression, using [the simple subset of
   * FHIRPath](fhirpath.html#simple), that is used to identify the element
   * on which discrimination is based.
   */
  _path?: PrimitiveExtension;
}

/**
 * The data type or resource that the value of this element is permitted
 * to be.
 */
export interface ElementDefinitionType {

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
   * URL of Data type or Resource that is a(or the) type used for this
   * element. References are URLs that are relative to
   * http://hl7.org/fhir/StructureDefinition e.g. &quot;string&quot; is a reference
   * to http://hl7.org/fhir/StructureDefinition/string. Absolute URLs are
   * only allowed in logical models.
   */
  code: string;

  /**
   * URL of Data type or Resource that is a(or the) type used for this
   * element. References are URLs that are relative to
   * http://hl7.org/fhir/StructureDefinition e.g. &quot;string&quot; is a reference
   * to http://hl7.org/fhir/StructureDefinition/string. Absolute URLs are
   * only allowed in logical models.
   */
  _code?: PrimitiveExtension;

  /**
   * Identifies a profile structure or implementation Guide that applies to
   * the datatype this element refers to. If any profiles are specified,
   * then the content must conform to at least one of them. The URL can be
   * a local reference - to a contained StructureDefinition, or a reference
   * to another StructureDefinition or Implementation Guide by a canonical
   * URL. When an implementation guide is specified, the type SHALL conform
   * to at least one profile defined in the implementation guide.
   */
  profile?: string[];

  /**
   * Identifies a profile structure or implementation Guide that applies to
   * the datatype this element refers to. If any profiles are specified,
   * then the content must conform to at least one of them. The URL can be
   * a local reference - to a contained StructureDefinition, or a reference
   * to another StructureDefinition or Implementation Guide by a canonical
   * URL. When an implementation guide is specified, the type SHALL conform
   * to at least one profile defined in the implementation guide.
   */
  _profile?: (PrimitiveExtension | null)[];

  /**
   * Used when the type is &quot;Reference&quot; or &quot;canonical&quot;, and identifies a
   * profile structure or implementation Guide that applies to the target
   * of the reference this element refers to. If any profiles are
   * specified, then the content must conform to at least one of them. The
   * URL can be a local reference - to a contained StructureDefinition, or
   * a reference to another StructureDefinition or Implementation Guide by
   * a canonical URL. When an implementation guide is specified, the target
   * resource SHALL conform to at least one profile defined in the
   * implementation guide.
   */
  targetProfile?: string[];

  /**
   * Used when the type is &quot;Reference&quot; or &quot;canonical&quot;, and identifies a
   * profile structure or implementation Guide that applies to the target
   * of the reference this element refers to. If any profiles are
   * specified, then the content must conform to at least one of them. The
   * URL can be a local reference - to a contained StructureDefinition, or
   * a reference to another StructureDefinition or Implementation Guide by
   * a canonical URL. When an implementation guide is specified, the target
   * resource SHALL conform to at least one profile defined in the
   * implementation guide.
   */
  _targetProfile?: (PrimitiveExtension | null)[];

  /**
   * If the type is a reference to another resource, how the resource is or
   * can be aggregated - is it a contained resource, or a reference, and if
   * the context is a bundle, is it included in the bundle.
   */
  aggregation?: ('contained' | 'referenced' | 'bundled')[];

  /**
   * If the type is a reference to another resource, how the resource is or
   * can be aggregated - is it a contained resource, or a reference, and if
   * the context is a bundle, is it included in the bundle.
   */
  _aggregation?: (PrimitiveExtension | null)[];

  /**
   * Whether this reference needs to be version specific or version
   * independent, or whether either can be used.
   */
  versioning?: 'either' | 'independent' | 'specific';

  /**
   * Whether this reference needs to be version specific or version
   * independent, or whether either can be used.
   */
  _versioning?: PrimitiveExtension;
}
