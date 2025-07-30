/*
 * This is a generated file
 * Do not edit manually.
 */

import { ContactDetail } from './ContactDetail';
import { Extension } from './Extension';
import { Identifier } from './Identifier';
import { Meta } from './Meta';
import { ResourceType } from './ResourceType';
import { UsageContext } from './UsageContext';

/**
 * View definitions represent a tabular projection of a FHIR resource,
 * where the columns and inclusion
 * criteria are defined by FHIRPath expressions.
 */
export interface ViewDefinition {

  /**
   * Canonical identifier for this view definition, represented as a URI
   * (globally unique)
   */
  url?: string;

  /**
   * Additional identifier for the view definition
   */
  identifier?: Identifier;

  /**
   * Name of the view definition, must be in a database-friendly format.
   */
  name?: string;

  /**
   * A optional human-readable description of the view.
   */
  title?: string;

  /**
   * Metadata about the view definition
   */
  meta?: Meta;

  /**
   * draft | active | retired | unknown
   */
  status: 'draft' | 'active' | 'retired' | 'unknown';

  /**
   * For testing purposes, not real usage
   */
  experimental?: boolean;

  /**
   * Name of the publisher/steward (organization or individual)
   */
  publisher?: string;

  /**
   * Contact details for the publisher
   */
  contact?: ContactDetail[];

  /**
   * Natural language description of the view definition
   */
  description?: string;

  /**
   * The context that the content is intended to support
   */
  useContext?: UsageContext[];

  /**
   * Use and/or publishing restrictions
   */
  copyright?: string;

  /**
   * The FHIR resource that the view is based upon, e.g. 'Patient' or
   * 'Observation'.
   */
  resource: ResourceType;

  /**
   * The FHIR version(s) for the FHIR resource. The value of this element
   * is the
   * formal version of the specification, without the revision number, e.g.
   * [publication].[major].[minor].
   */
  fhirVersion?: ('0.01' | '0.05' | '0.06' | '0.11' | '0.0.80' | '0.0.81' | '0.0.82' | '0.4.0' | '0.5.0' | '1.0.0' |
      '1.0.1' | '1.0.2' | '1.1.0' | '1.4.0' | '1.6.0' | '1.8.0' | '3.0.0' | '3.0.1' | '3.3.0' | '3.5.0' | '4.0.0' |
      '4.0.1')[];

  /**
   * A constant is a value that is injected into a FHIRPath expression
   * through the use of a FHIRPath
   * external constant with the same name.
   */
  constant?: ViewDefinitionConstant[];

  /**
   * The select structure defines the columns to be used in the resulting
   * view. These are expressed
   * in the `column` structure below, or in nested `select`s for nested
   * resources.
   */
  select: ViewDefinitionSelect[];

  /**
   * A series of zero or more FHIRPath constraints to filter resources for
   * the view. Every constraint
   * must evaluate to true for the resource to be included in the view.
   */
  where?: ViewDefinitionWhere[];
}

/**
 * A constant is a value that is injected into a FHIRPath expression
 * through the use of a FHIRPath
 * external constant with the same name.
 */
export interface ViewDefinitionConstant {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and managable, there is a strict set of governance applied to the
   * definition and use of extensions. Though any implementer can define an
   * extension, there is a set of requirements that SHALL be met as part of
   * the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and managable, there is a strict set of governance
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
   * Name of constant (referred to in FHIRPath as %[name])
   */
  name: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueBase64Binary?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueBoolean?: boolean;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueCanonical?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueCode?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueDate?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueDateTime?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueDecimal?: number;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueId?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueInstant?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueInteger?: number;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueInteger64?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueOid?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueString?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valuePositiveInt?: number;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueTime?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueUnsignedInt?: number;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueUri?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueUrl?: string;

  /**
   * The value that will be substituted in place of the constant reference.
   * This
   * is done by including `%your_constant_name` in a FHIRPath expression,
   * which effectively converts
   * the FHIR literal defined here to a FHIRPath literal used in the path
   * expression.
   *
   * Support for additional types may be added in the future.
   */
  valueUuid?: string;
}

/**
 * The value that will be substituted in place of the constant reference.
 * This
 * is done by including `%your_constant_name` in a FHIRPath expression,
 * which effectively converts
 * the FHIR literal defined here to a FHIRPath literal used in the path
 * expression.
 *
 * Support for additional types may be added in the future.
 */
export type ViewDefinitionConstantValue = boolean | number | string;

/**
 * The select structure defines the columns to be used in the resulting
 * view. These are expressed
 * in the `column` structure below, or in nested `select`s for nested
 * resources.
 */
export interface ViewDefinitionSelect {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and managable, there is a strict set of governance applied to the
   * definition and use of extensions. Though any implementer can define an
   * extension, there is a set of requirements that SHALL be met as part of
   * the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and managable, there is a strict set of governance
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
   * A column to be produced in the resulting table. The column is relative
   * to the select structure
   * that contains it.
   */
  column?: ViewDefinitionSelectColumn[];

  /**
   * Nested select relative to a parent expression. If the parent `select`
   * has a `forEach` or `forEachOrNull`, this child select will apply for
   * each item in that expression.
   */
  select?: ViewDefinitionSelect[];

  /**
   * A FHIRPath expression to retrieve the parent element(s) used in the
   * containing select, relative to the root resource or parent `select`,
   * if applicable. `forEach` will produce a row for each element selected
   * in the expression. For example, using forEach on `address` in Patient
   * will
   * generate a new row for each address, with columns defined in the
   * corresponding `column` structure.
   */
  forEach?: string;

  /**
   * Same as forEach, but produces a single row with null values in the
   * nested expression if the collection is empty. For example,
   * with a Patient resource, a `forEachOrNull` on address will produce a
   * row for each patient even if there are no addresses; it will
   * simply set the address columns to `null`.
   */
  forEachOrNull?: string;

  /**
   * A `unionAll` combines the results of multiple selection structures.
   * Each structure under the `unionAll` must produce the same column names
   * and types. The results from each nested selection will then have their
   * own row.
   */
  unionAll?: ViewDefinitionSelect[];
}

/**
 * A column to be produced in the resulting table. The column is relative
 * to the select structure
 * that contains it.
 */
export interface ViewDefinitionSelectColumn {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and managable, there is a strict set of governance applied to the
   * definition and use of extensions. Though any implementer can define an
   * extension, there is a set of requirements that SHALL be met as part of
   * the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and managable, there is a strict set of governance
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
   * A FHIRPath expression that evaluates to the value that will be output
   * in the column for each
   * resource. The input context is the collection of resources of the type
   * specified in the resource
   * element. Constants defined in Reference({constant}) can be referenced
   * as %[name].
   */
  path: string;

  /**
   * Name of the column produced in the output, must be in a
   * database-friendly format. The column
   * names in the output must not have any duplicates.
   */
  name: string;

  /**
   * A human-readable description of the column.
   */
  description?: string;

  /**
   * Indicates whether the column may have multiple values. Defaults to
   * `false` if unset.
   *
   * ViewDefinitions must have this set to `true` if multiple values may be
   * returned. Implementations SHALL
   * report an error if multiple values are produced when that is not the
   * case.
   */
  collection?: boolean;

  /**
   * A FHIR StructureDefinition URI for the column's type. Relative URIs
   * are implicitly given
   * the 'http://hl7.org/fhir/StructureDefinition/' prefix. The URI may
   * also use FHIR element ID notation to indicate
   * a backbone element within a structure. For instance,
   * `Observation.referenceRange` may be specified to indicate
   * the returned type is that backbone element.
   *
   * This field *must* be provided if a ViewDefinition returns a
   * non-primitive type. Implementations should report an error
   * if the returned type does not match the type set here, or if a
   * non-primitive type is returned but this field is unset.
   */
  type?: string;

  /**
   * Tags can be used to attach additional metadata to columns, such as
   * implementation-specific
   * directives or database-specific type hints.
   */
  tag?: ViewDefinitionSelectColumnTag[];
}

/**
 * Tags can be used to attach additional metadata to columns, such as
 * implementation-specific
 * directives or database-specific type hints.
 */
export interface ViewDefinitionSelectColumnTag {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and managable, there is a strict set of governance applied to the
   * definition and use of extensions. Though any implementer can define an
   * extension, there is a set of requirements that SHALL be met as part of
   * the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and managable, there is a strict set of governance
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
   * A name that identifies the meaning of the tag. A namespace should be
   * used to scope the tag to
   * a particular context. For example, 'ansi/type' could be used to
   * indicate the type that should
   * be used to represent the value within an ANSI SQL database.
   */
  name: string;

  /**
   * Value of tag
   */
  value: string;
}

/**
 * A series of zero or more FHIRPath constraints to filter resources for
 * the view. Every constraint
 * must evaluate to true for the resource to be included in the view.
 */
export interface ViewDefinitionWhere {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and managable, there is a strict set of governance applied to the
   * definition and use of extensions. Though any implementer can define an
   * extension, there is a set of requirements that SHALL be met as part of
   * the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element and that modifies the
   * understanding of the element in which it is contained and/or the
   * understanding of the containing element's descendants. Usually
   * modifier elements provide negation or qualification. To make the use
   * of extensions safe and managable, there is a strict set of governance
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
   * A FHIRPath expression that defines a filter that must evaluate to true
   * for a resource to be
   * included in the output. The input context is the collection of
   * resources of the type specified in
   * the resource element. Constants defined in Reference({constant}) can
   * be referenced as %[name].
   */
  path: string;

  /**
   * A human-readable description of the above where constraint.
   */
  description?: string;
}
