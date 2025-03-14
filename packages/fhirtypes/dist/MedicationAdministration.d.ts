/*
 * This is a generated file
 * Do not edit manually.
 */

import { Annotation } from './Annotation';
import { CodeableConcept } from './CodeableConcept';
import { Condition } from './Condition';
import { Device } from './Device';
import { DiagnosticReport } from './DiagnosticReport';
import { Encounter } from './Encounter';
import { EpisodeOfCare } from './EpisodeOfCare';
import { Extension } from './Extension';
import { Group } from './Group';
import { Identifier } from './Identifier';
import { Medication } from './Medication';
import { MedicationRequest } from './MedicationRequest';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { Observation } from './Observation';
import { Patient } from './Patient';
import { Period } from './Period';
import { Practitioner } from './Practitioner';
import { PractitionerRole } from './PractitionerRole';
import { Procedure } from './Procedure';
import { Provenance } from './Provenance';
import { Quantity } from './Quantity';
import { Ratio } from './Ratio';
import { Reference } from './Reference';
import { RelatedPerson } from './RelatedPerson';
import { Resource } from './Resource';

/**
 * Describes the event of a patient consuming or otherwise being
 * administered a medication.  This may be as simple as swallowing a
 * tablet or it may be a long running infusion.  Related resources tie
 * this event to the authorizing prescription, and the specific encounter
 * between patient and health care practitioner.
 */
export interface MedicationAdministration {

  /**
   * This is a MedicationAdministration resource
   */
  readonly resourceType: 'MedicationAdministration';

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
   * Identifiers associated with this Medication Administration that are
   * defined by business processes and/or used to refer to it when a direct
   * URL reference to the resource itself is not appropriate. They are
   * business identifiers assigned to this resource by the performer or
   * other systems and remain constant as the resource is updated and
   * propagates from server to server.
   */
  identifier?: Identifier[];

  /**
   * A protocol, guideline, orderset, or other definition that was adhered
   * to in whole or in part by this event.
   */
  instantiates?: string[];

  /**
   * A larger event of which this particular event is a component or step.
   */
  partOf?: Reference<MedicationAdministration | Procedure>[];

  /**
   * Will generally be set to show that the administration has been
   * completed.  For some long running administrations such as infusions,
   * it is possible for an administration to be started but not completed
   * or it may be paused while some other process is under way.
   */
  status: 'in-progress' | 'not-done' | 'on-hold' | 'completed' | 'entered-in-error' | 'stopped' | 'unknown';

  /**
   * A code indicating why the administration was not performed.
   */
  statusReason?: CodeableConcept[];

  /**
   * Indicates where the medication is expected to be consumed or
   * administered.
   */
  category?: CodeableConcept;

  /**
   * Identifies the medication that was administered. This is either a link
   * to a resource representing the details of the medication or a simple
   * attribute carrying a code that identifies the medication from a known
   * list of medications.
   */
  medicationCodeableConcept?: CodeableConcept;

  /**
   * Identifies the medication that was administered. This is either a link
   * to a resource representing the details of the medication or a simple
   * attribute carrying a code that identifies the medication from a known
   * list of medications.
   */
  medicationReference?: Reference<Medication>;

  /**
   * The person or animal or group receiving the medication.
   */
  subject: Reference<Patient | Group>;

  /**
   * The visit, admission, or other contact between patient and health care
   * provider during which the medication administration was performed.
   */
  context?: Reference<Encounter | EpisodeOfCare>;

  /**
   * Additional information (for example, patient height and weight) that
   * supports the administration of the medication.
   */
  supportingInformation?: Reference<Resource>[];

  /**
   * A specific date/time or interval of time during which the
   * administration took place (or did not take place, when the 'notGiven'
   * attribute is true). For many administrations, such as swallowing a
   * tablet the use of dateTime is more appropriate.
   */
  effectiveDateTime?: string;

  /**
   * A specific date/time or interval of time during which the
   * administration took place (or did not take place, when the 'notGiven'
   * attribute is true). For many administrations, such as swallowing a
   * tablet the use of dateTime is more appropriate.
   */
  effectivePeriod?: Period;

  /**
   * Indicates who or what performed the medication administration and how
   * they were involved.
   */
  performer?: MedicationAdministrationPerformer[];

  /**
   * A code indicating why the medication was given.
   */
  reasonCode?: CodeableConcept[];

  /**
   * Condition or observation that supports why the medication was
   * administered.
   */
  reasonReference?: Reference<Condition | Observation | DiagnosticReport>[];

  /**
   * The original request, instruction or authority to perform the
   * administration.
   */
  request?: Reference<MedicationRequest>;

  /**
   * The device used in administering the medication to the patient.  For
   * example, a particular infusion pump.
   */
  device?: Reference<Device>[];

  /**
   * Extra information about the medication administration that is not
   * conveyed by the other attributes.
   */
  note?: Annotation[];

  /**
   * Describes the medication dosage information details e.g. dose, rate,
   * site, route, etc.
   */
  dosage?: MedicationAdministrationDosage;

  /**
   * A summary of the events of interest that have occurred, such as when
   * the administration was verified.
   */
  eventHistory?: Reference<Provenance>[];
}

/**
 * Identifies the medication that was administered. This is either a link
 * to a resource representing the details of the medication or a simple
 * attribute carrying a code that identifies the medication from a known
 * list of medications.
 */
export type MedicationAdministrationMedication = CodeableConcept | Reference<Medication>;

/**
 * A specific date/time or interval of time during which the
 * administration took place (or did not take place, when the 'notGiven'
 * attribute is true). For many administrations, such as swallowing a
 * tablet the use of dateTime is more appropriate.
 */
export type MedicationAdministrationEffective = Period | string;

/**
 * Describes the medication dosage information details e.g. dose, rate,
 * site, route, etc.
 */
export interface MedicationAdministrationDosage {

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
   * Free text dosage can be used for cases where the dosage administered
   * is too complex to code. When coded dosage is present, the free text
   * dosage may still be present for display to humans.The dosage
   * instructions should reflect the dosage of the medication that was
   * administered.
   */
  text?: string;

  /**
   * A coded specification of the anatomic site where the medication first
   * entered the body.  For example, &quot;left arm&quot;.
   */
  site?: CodeableConcept;

  /**
   * A code specifying the route or physiological path of administration of
   * a therapeutic agent into or onto the patient.  For example, topical,
   * intravenous, etc.
   */
  route?: CodeableConcept;

  /**
   * A coded value indicating the method by which the medication is
   * intended to be or was introduced into or on the body.  This attribute
   * will most often NOT be populated.  It is most commonly used for
   * injections.  For example, Slow Push, Deep IV.
   */
  method?: CodeableConcept;

  /**
   * The amount of the medication given at one administration event.   Use
   * this value when the administration is essentially an instantaneous
   * event such as a swallowing a tablet or giving an injection.
   */
  dose?: Quantity;

  /**
   * Identifies the speed with which the medication was or will be
   * introduced into the patient.  Typically, the rate for an infusion e.g.
   * 100 ml per 1 hour or 100 ml/hr.  May also be expressed as a rate per
   * unit of time, e.g. 500 ml per 2 hours.  Other examples:  200 mcg/min
   * or 200 mcg/1 minute; 1 liter/8 hours.
   */
  rateRatio?: Ratio;

  /**
   * Identifies the speed with which the medication was or will be
   * introduced into the patient.  Typically, the rate for an infusion e.g.
   * 100 ml per 1 hour or 100 ml/hr.  May also be expressed as a rate per
   * unit of time, e.g. 500 ml per 2 hours.  Other examples:  200 mcg/min
   * or 200 mcg/1 minute; 1 liter/8 hours.
   */
  rateQuantity?: Quantity;
}

/**
 * Identifies the speed with which the medication was or will be
 * introduced into the patient.  Typically, the rate for an infusion e.g.
 * 100 ml per 1 hour or 100 ml/hr.  May also be expressed as a rate per
 * unit of time, e.g. 500 ml per 2 hours.  Other examples:  200 mcg/min
 * or 200 mcg/1 minute; 1 liter/8 hours.
 */
export type MedicationAdministrationDosageRate = Quantity | Ratio;

/**
 * Indicates who or what performed the medication administration and how
 * they were involved.
 */
export interface MedicationAdministrationPerformer {

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
   * Distinguishes the type of involvement of the performer in the
   * medication administration.
   */
  function?: CodeableConcept;

  /**
   * Indicates who or what performed the medication administration.
   */
  actor: Reference<Practitioner | PractitionerRole | Patient | RelatedPerson | Device>;
}
