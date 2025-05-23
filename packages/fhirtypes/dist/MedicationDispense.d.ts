/*
 * This is a generated file
 * Do not edit manually.
 */

import { Annotation } from './Annotation';
import { CodeableConcept } from './CodeableConcept';
import { DetectedIssue } from './DetectedIssue';
import { Device } from './Device';
import { Dosage } from './Dosage';
import { Encounter } from './Encounter';
import { EpisodeOfCare } from './EpisodeOfCare';
import { Extension } from './Extension';
import { Group } from './Group';
import { Identifier } from './Identifier';
import { Location } from './Location';
import { Medication } from './Medication';
import { MedicationRequest } from './MedicationRequest';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { Organization } from './Organization';
import { Patient } from './Patient';
import { Practitioner } from './Practitioner';
import { PractitionerRole } from './PractitionerRole';
import { Procedure } from './Procedure';
import { Provenance } from './Provenance';
import { Quantity } from './Quantity';
import { Reference } from './Reference';
import { RelatedPerson } from './RelatedPerson';
import { Resource } from './Resource';

/**
 * Indicates that a medication product is to be or has been dispensed for
 * a named person/patient.  This includes a description of the medication
 * product (supply) provided and the instructions for administering the
 * medication.  The medication dispense is the result of a pharmacy
 * system responding to a medication order.
 */
export interface MedicationDispense {

  /**
   * This is a MedicationDispense resource
   */
  readonly resourceType: 'MedicationDispense';

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
   * Identifiers associated with this Medication Dispense that are defined
   * by business processes and/or used to refer to it when a direct URL
   * reference to the resource itself is not appropriate. They are business
   * identifiers assigned to this resource by the performer or other
   * systems and remain constant as the resource is updated and propagates
   * from server to server.
   */
  identifier?: Identifier[];

  /**
   * The procedure that trigger the dispense.
   */
  partOf?: Reference<Procedure>[];

  /**
   * A code specifying the state of the set of dispense events.
   */
  status: 'preparation' | 'in-progress' | 'cancelled' | 'on-hold' | 'completed' | 'entered-in-error' | 'stopped' | 'declined' | 'unknown';

  /**
   * Indicates the reason why a dispense was not performed.
   */
  statusReasonCodeableConcept?: CodeableConcept;

  /**
   * Indicates the reason why a dispense was not performed.
   */
  statusReasonReference?: Reference<DetectedIssue>;

  /**
   * Indicates the type of medication dispense (for example, where the
   * medication is expected to be consumed or administered (i.e. inpatient
   * or outpatient)).
   */
  category?: CodeableConcept;

  /**
   * Identifies the medication being administered. This is either a link to
   * a resource representing the details of the medication or a simple
   * attribute carrying a code that identifies the medication from a known
   * list of medications.
   */
  medicationCodeableConcept?: CodeableConcept;

  /**
   * Identifies the medication being administered. This is either a link to
   * a resource representing the details of the medication or a simple
   * attribute carrying a code that identifies the medication from a known
   * list of medications.
   */
  medicationReference?: Reference<Medication>;

  /**
   * A link to a resource representing the person or the group to whom the
   * medication will be given.
   */
  subject?: Reference<Patient | Group>;

  /**
   * The encounter or episode of care that establishes the context for this
   * event.
   */
  context?: Reference<Encounter | EpisodeOfCare>;

  /**
   * Additional information that supports the medication being dispensed.
   */
  supportingInformation?: Reference<Resource>[];

  /**
   * Indicates who or what performed the event.
   */
  performer?: MedicationDispensePerformer[];

  /**
   * The principal physical location where the dispense was performed.
   */
  location?: Reference<Location>;

  /**
   * Indicates the medication order that is being dispensed against.
   */
  authorizingPrescription?: Reference<MedicationRequest>[];

  /**
   * Indicates the type of dispensing event that is performed. For example,
   * Trial Fill, Completion of Trial, Partial Fill, Emergency Fill,
   * Samples, etc.
   */
  type?: CodeableConcept;

  /**
   * The amount of medication that has been dispensed. Includes unit of
   * measure.
   */
  quantity?: Quantity;

  /**
   * The amount of medication expressed as a timing amount.
   */
  daysSupply?: Quantity;

  /**
   * The time when the dispensed product was packaged and reviewed.
   */
  whenPrepared?: string;

  /**
   * The time the dispensed product was provided to the patient or their
   * representative.
   */
  whenHandedOver?: string;

  /**
   * Identification of the facility/location where the medication was
   * shipped to, as part of the dispense event.
   */
  destination?: Reference<Location>;

  /**
   * Identifies the person who picked up the medication.  This will usually
   * be a patient or their caregiver, but some cases exist where it can be
   * a healthcare professional.
   */
  receiver?: Reference<Patient | Practitioner>[];

  /**
   * Extra information about the dispense that could not be conveyed in the
   * other attributes.
   */
  note?: Annotation[];

  /**
   * Indicates how the medication is to be used by the patient.
   */
  dosageInstruction?: Dosage[];

  /**
   * Indicates whether or not substitution was made as part of the
   * dispense.  In some cases, substitution will be expected but does not
   * happen, in other cases substitution is not expected but does happen.
   * This block explains what substitution did or did not happen and why.
   * If nothing is specified, substitution was not done.
   */
  substitution?: MedicationDispenseSubstitution;

  /**
   * Indicates an actual or potential clinical issue with or between one or
   * more active or proposed clinical actions for a patient; e.g. drug-drug
   * interaction, duplicate therapy, dosage alert etc.
   */
  detectedIssue?: Reference<DetectedIssue>[];

  /**
   * A summary of the events of interest that have occurred, such as when
   * the dispense was verified.
   */
  eventHistory?: Reference<Provenance>[];
}

/**
 * Indicates the reason why a dispense was not performed.
 */
export type MedicationDispenseStatusReason = CodeableConcept | Reference<DetectedIssue>;

/**
 * Identifies the medication being administered. This is either a link to
 * a resource representing the details of the medication or a simple
 * attribute carrying a code that identifies the medication from a known
 * list of medications.
 */
export type MedicationDispenseMedication = CodeableConcept | Reference<Medication>;

/**
 * Indicates who or what performed the event.
 */
export interface MedicationDispensePerformer {

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
   * Distinguishes the type of performer in the dispense.  For example,
   * date enterer, packager, final checker.
   */
  function?: CodeableConcept;

  /**
   * The device, practitioner, etc. who performed the action.  It should be
   * assumed that the actor is the dispenser of the medication.
   */
  actor: Reference<Practitioner | PractitionerRole | Organization | Patient | Device | RelatedPerson>;
}

/**
 * Indicates whether or not substitution was made as part of the
 * dispense.  In some cases, substitution will be expected but does not
 * happen, in other cases substitution is not expected but does happen.
 * This block explains what substitution did or did not happen and why.
 * If nothing is specified, substitution was not done.
 */
export interface MedicationDispenseSubstitution {

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
   * True if the dispenser dispensed a different drug or product from what
   * was prescribed.
   */
  wasSubstituted: boolean;

  /**
   * A code signifying whether a different drug was dispensed from what was
   * prescribed.
   */
  type?: CodeableConcept;

  /**
   * Indicates the reason for the substitution (or lack of substitution)
   * from what was prescribed.
   */
  reason?: CodeableConcept[];

  /**
   * The person or organization that has primary responsibility for the
   * substitution.
   */
  responsibleParty?: Reference<Practitioner | PractitionerRole>[];
}
