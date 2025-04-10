/*
 * This is a generated file
 * Do not edit manually.
 */

import { CodeableConcept } from './CodeableConcept';
import { Extension } from './Extension';
import { Identifier } from './Identifier';
import { Quantity } from './Quantity';

/**
 * The shelf-life and storage information for a medicinal product item or
 * container can be described using this class.
 */
export interface ProductShelfLife {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

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
   * Unique identifier for the packaged Medicinal Product.
   */
  identifier?: Identifier;

  /**
   * This describes the shelf life, taking into account various scenarios
   * such as shelf life of the packaged Medicinal Product itself, shelf
   * life after transformation where necessary and shelf life after the
   * first opening of a bottle, etc. The shelf life type shall be specified
   * using an appropriate controlled vocabulary The controlled term and the
   * controlled term identifier shall be specified.
   */
  type: CodeableConcept;

  /**
   * The shelf life time period can be specified using a numerical value
   * for the period of time and its unit of time measurement The unit of
   * measurement shall be specified in accordance with ISO 11240 and the
   * resulting terminology The symbol and the symbol identifier shall be
   * used.
   */
  period: Quantity;

  /**
   * Special precautions for storage, if any, can be specified using an
   * appropriate controlled vocabulary The controlled term and the
   * controlled term identifier shall be specified.
   */
  specialPrecautionsForStorage?: CodeableConcept[];
}
