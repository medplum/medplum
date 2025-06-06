/*
 * This is a generated file
 * Do not edit manually.
 */

import { CodeableConcept } from './CodeableConcept';
import { Contract } from './Contract';
import { Device } from './Device';
import { Extension } from './Extension';
import { Identifier } from './Identifier';
import { Location } from './Location';
import { Medication } from './Medication';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { Organization } from './Organization';
import { Patient } from './Patient';
import { Period } from './Period';
import { Practitioner } from './Practitioner';
import { PractitionerRole } from './PractitionerRole';
import { Quantity } from './Quantity';
import { Reference } from './Reference';
import { Resource } from './Resource';
import { Substance } from './Substance';
import { SupplyRequest } from './SupplyRequest';
import { Timing } from './Timing';

/**
 * Record of delivery of what is supplied.
 */
export interface SupplyDelivery {

  /**
   * This is a SupplyDelivery resource
   */
  readonly resourceType: 'SupplyDelivery';

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  id?: string;

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
   * The base language in which the resource is written.
   */
  language?: string;

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
   * Identifier for the supply delivery event that is used to identify it
   * across multiple disparate systems.
   */
  identifier?: Identifier[];

  /**
   * A plan, proposal or order that is fulfilled in whole or in part by
   * this event.
   */
  basedOn?: Reference<SupplyRequest>[];

  /**
   * A larger event of which this particular event is a component or step.
   */
  partOf?: Reference<SupplyDelivery | Contract>[];

  /**
   * A code specifying the state of the dispense event.
   */
  status?: 'in-progress' | 'completed' | 'abandoned' | 'entered-in-error';

  /**
   * A link to a resource representing the person whom the delivered item
   * is for.
   */
  patient?: Reference<Patient>;

  /**
   * Indicates the type of dispensing event that is performed. Examples
   * include: Trial Fill, Completion of Trial, Partial Fill, Emergency
   * Fill, Samples, etc.
   */
  type?: CodeableConcept;

  /**
   * The item that is being delivered or has been supplied.
   */
  suppliedItem?: SupplyDeliverySuppliedItem;

  /**
   * The date or time(s) the activity occurred.
   */
  occurrenceDateTime?: string;

  /**
   * The date or time(s) the activity occurred.
   */
  occurrencePeriod?: Period;

  /**
   * The date or time(s) the activity occurred.
   */
  occurrenceTiming?: Timing;

  /**
   * The individual responsible for dispensing the medication, supplier or
   * device.
   */
  supplier?: Reference<Practitioner | PractitionerRole | Organization>;

  /**
   * Identification of the facility/location where the Supply was shipped
   * to, as part of the dispense event.
   */
  destination?: Reference<Location>;

  /**
   * Identifies the person who picked up the Supply.
   */
  receiver?: Reference<Practitioner | PractitionerRole>[];
}

/**
 * The date or time(s) the activity occurred.
 */
export type SupplyDeliveryOccurrence = Period | string | Timing;

/**
 * The item that is being delivered or has been supplied.
 */
export interface SupplyDeliverySuppliedItem {

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
   * The amount of supply that has been dispensed. Includes unit of
   * measure.
   */
  quantity?: Quantity;

  /**
   * Identifies the medication, substance or device being dispensed. This
   * is either a link to a resource representing the details of the item or
   * a code that identifies the item from a known list.
   */
  itemCodeableConcept?: CodeableConcept;

  /**
   * Identifies the medication, substance or device being dispensed. This
   * is either a link to a resource representing the details of the item or
   * a code that identifies the item from a known list.
   */
  itemReference?: Reference<Medication | Substance | Device>;
}

/**
 * Identifies the medication, substance or device being dispensed. This
 * is either a link to a resource representing the details of the item or
 * a code that identifies the item from a known list.
 */
export type SupplyDeliverySuppliedItemItem = CodeableConcept | Reference<Medication | Substance | Device>;
