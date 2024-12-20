/*
 * This is a generated file
 * Do not edit manually.
 */

import { Annotation } from './Annotation';
import { CodeableConcept } from './CodeableConcept';
import { Condition } from './Condition';
import { Duration } from './Duration';
import { Extension } from './Extension';
import { Group } from './Group';
import { Identifier } from './Identifier';
import { MedicationStatement } from './MedicationStatement';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { NutritionOrder } from './NutritionOrder';
import { Observation } from './Observation';
import { Organization } from './Organization';
import { Patient } from './Patient';
import { Practitioner } from './Practitioner';
import { PractitionerRole } from './PractitionerRole';
import { Quantity } from './Quantity';
import { Range } from './Range';
import { Ratio } from './Ratio';
import { Reference } from './Reference';
import { RelatedPerson } from './RelatedPerson';
import { Resource } from './Resource';
import { RiskAssessment } from './RiskAssessment';
import { ServiceRequest } from './ServiceRequest';

/**
 * Describes the intended objective(s) for a patient, group or
 * organization care, for example, weight loss, restoring an activity of
 * daily living, obtaining herd immunity via immunization, meeting a
 * process improvement objective, etc.
 */
export interface Goal {

  /**
   * This is a Goal resource
   */
  readonly resourceType: 'Goal';

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
   * Business identifiers assigned to this goal by the performer or other
   * systems which remain constant as the resource is updated and
   * propagates from server to server.
   */
  identifier?: Identifier[];

  /**
   * The state of the goal throughout its lifecycle.
   */
  lifecycleStatus: 'proposed' | 'planned' | 'accepted' | 'active' | 'on-hold' | 'completed' | 'cancelled' | 'entered-in-error' | 'rejected';

  /**
   * Describes the progression, or lack thereof, towards the goal against
   * the target.
   */
  achievementStatus?: CodeableConcept;

  /**
   * Indicates a category the goal falls within.
   */
  category?: CodeableConcept[];

  /**
   * Identifies the mutually agreed level of importance associated with
   * reaching/sustaining the goal.
   */
  priority?: CodeableConcept;

  /**
   * Human-readable and/or coded description of a specific desired
   * objective of care, such as &quot;control blood pressure&quot; or &quot;negotiate an
   * obstacle course&quot; or &quot;dance with child at wedding&quot;.
   */
  description: CodeableConcept;

  /**
   * Identifies the patient, group or organization for whom the goal is
   * being established.
   */
  subject: Reference<Patient | Group | Organization>;

  /**
   * The date or event after which the goal should begin being pursued.
   */
  startDate?: string;

  /**
   * The date or event after which the goal should begin being pursued.
   */
  startCodeableConcept?: CodeableConcept;

  /**
   * Indicates what should be done by when.
   */
  target?: GoalTarget[];

  /**
   * Identifies when the current status.  I.e. When initially created, when
   * achieved, when cancelled, etc.
   */
  statusDate?: string;

  /**
   * Captures the reason for the current status.
   */
  statusReason?: string;

  /**
   * Indicates whose goal this is - patient goal, practitioner goal, etc.
   */
  expressedBy?: Reference<Patient | Practitioner | PractitionerRole | RelatedPerson>;

  /**
   * The identified conditions and other health record elements that are
   * intended to be addressed by the goal.
   */
  addresses?: Reference<Condition | Observation | MedicationStatement | NutritionOrder | ServiceRequest | RiskAssessment>[];

  /**
   * Any comments related to the goal.
   */
  note?: Annotation[];

  /**
   * Identifies the change (or lack of change) at the point when the status
   * of the goal is assessed.
   */
  outcomeCode?: CodeableConcept[];

  /**
   * Details of what's changed (or not changed).
   */
  outcomeReference?: Reference<Observation>[];
}

/**
 * The date or event after which the goal should begin being pursued.
 */
export type GoalStart = CodeableConcept | string;

/**
 * Indicates what should be done by when.
 */
export interface GoalTarget {

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
   * The parameter whose value is being tracked, e.g. body weight, blood
   * pressure, or hemoglobin A1c level.
   */
  measure?: CodeableConcept;

  /**
   * The target value of the focus to be achieved to signify the
   * fulfillment of the goal, e.g. 150 pounds, 7.0%. Either the high or low
   * or both values of the range can be specified. When a low value is
   * missing, it indicates that the goal is achieved at any focus value at
   * or below the high value. Similarly, if the high value is missing, it
   * indicates that the goal is achieved at any focus value at or above the
   * low value.
   */
  detailQuantity?: Quantity;

  /**
   * The target value of the focus to be achieved to signify the
   * fulfillment of the goal, e.g. 150 pounds, 7.0%. Either the high or low
   * or both values of the range can be specified. When a low value is
   * missing, it indicates that the goal is achieved at any focus value at
   * or below the high value. Similarly, if the high value is missing, it
   * indicates that the goal is achieved at any focus value at or above the
   * low value.
   */
  detailRange?: Range;

  /**
   * The target value of the focus to be achieved to signify the
   * fulfillment of the goal, e.g. 150 pounds, 7.0%. Either the high or low
   * or both values of the range can be specified. When a low value is
   * missing, it indicates that the goal is achieved at any focus value at
   * or below the high value. Similarly, if the high value is missing, it
   * indicates that the goal is achieved at any focus value at or above the
   * low value.
   */
  detailCodeableConcept?: CodeableConcept;

  /**
   * The target value of the focus to be achieved to signify the
   * fulfillment of the goal, e.g. 150 pounds, 7.0%. Either the high or low
   * or both values of the range can be specified. When a low value is
   * missing, it indicates that the goal is achieved at any focus value at
   * or below the high value. Similarly, if the high value is missing, it
   * indicates that the goal is achieved at any focus value at or above the
   * low value.
   */
  detailString?: string;

  /**
   * The target value of the focus to be achieved to signify the
   * fulfillment of the goal, e.g. 150 pounds, 7.0%. Either the high or low
   * or both values of the range can be specified. When a low value is
   * missing, it indicates that the goal is achieved at any focus value at
   * or below the high value. Similarly, if the high value is missing, it
   * indicates that the goal is achieved at any focus value at or above the
   * low value.
   */
  detailBoolean?: boolean;

  /**
   * The target value of the focus to be achieved to signify the
   * fulfillment of the goal, e.g. 150 pounds, 7.0%. Either the high or low
   * or both values of the range can be specified. When a low value is
   * missing, it indicates that the goal is achieved at any focus value at
   * or below the high value. Similarly, if the high value is missing, it
   * indicates that the goal is achieved at any focus value at or above the
   * low value.
   */
  detailInteger?: number;

  /**
   * The target value of the focus to be achieved to signify the
   * fulfillment of the goal, e.g. 150 pounds, 7.0%. Either the high or low
   * or both values of the range can be specified. When a low value is
   * missing, it indicates that the goal is achieved at any focus value at
   * or below the high value. Similarly, if the high value is missing, it
   * indicates that the goal is achieved at any focus value at or above the
   * low value.
   */
  detailRatio?: Ratio;

  /**
   * Indicates either the date or the duration after start by which the
   * goal should be met.
   */
  dueDate?: string;

  /**
   * Indicates either the date or the duration after start by which the
   * goal should be met.
   */
  dueDuration?: Duration;
}

/**
 * The target value of the focus to be achieved to signify the
 * fulfillment of the goal, e.g. 150 pounds, 7.0%. Either the high or low
 * or both values of the range can be specified. When a low value is
 * missing, it indicates that the goal is achieved at any focus value at
 * or below the high value. Similarly, if the high value is missing, it
 * indicates that the goal is achieved at any focus value at or above the
 * low value.
 */
export type GoalTargetDetail = boolean | CodeableConcept | number | Quantity | Range | Ratio | string;

/**
 * Indicates either the date or the duration after start by which the
 * goal should be met.
 */
export type GoalTargetDue = Duration | string;
