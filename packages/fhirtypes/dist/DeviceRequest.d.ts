// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { Annotation } from './Annotation.d.ts';
import type { CareTeam } from './CareTeam.d.ts';
import type { ClaimResponse } from './ClaimResponse.d.ts';
import type { CodeableConcept } from './CodeableConcept.d.ts';
import type { Condition } from './Condition.d.ts';
import type { Coverage } from './Coverage.d.ts';
import type { Device } from './Device.d.ts';
import type { DiagnosticReport } from './DiagnosticReport.d.ts';
import type { DocumentReference } from './DocumentReference.d.ts';
import type { Encounter } from './Encounter.d.ts';
import type { Extension } from './Extension.d.ts';
import type { Group } from './Group.d.ts';
import type { HealthcareService } from './HealthcareService.d.ts';
import type { Identifier } from './Identifier.d.ts';
import type { Location } from './Location.d.ts';
import type { Meta } from './Meta.d.ts';
import type { Narrative } from './Narrative.d.ts';
import type { Observation } from './Observation.d.ts';
import type { Organization } from './Organization.d.ts';
import type { Patient } from './Patient.d.ts';
import type { Period } from './Period.d.ts';
import type { Practitioner } from './Practitioner.d.ts';
import type { PractitionerRole } from './PractitionerRole.d.ts';
import type { Provenance } from './Provenance.d.ts';
import type { Quantity } from './Quantity.d.ts';
import type { Range } from './Range.d.ts';
import type { Reference } from './Reference.d.ts';
import type { RelatedPerson } from './RelatedPerson.d.ts';
import type { Resource } from './Resource.d.ts';
import type { Timing } from './Timing.d.ts';

/**
 * Represents a request for a patient to employ a medical device. The
 * device may be an implantable device, or an external assistive device,
 * such as a walker.
 */
export interface DeviceRequest {

  /**
   * This is a DeviceRequest resource
   */
  readonly resourceType: 'DeviceRequest';

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
   * Identifiers assigned to this order by the orderer or by the receiver.
   */
  identifier?: Identifier[];

  /**
   * The URL pointing to a FHIR-defined protocol, guideline, orderset or
   * other definition that is adhered to in whole or in part by this
   * DeviceRequest.
   */
  instantiatesCanonical?: string[];

  /**
   * The URL pointing to an externally maintained protocol, guideline,
   * orderset or other definition that is adhered to in whole or in part by
   * this DeviceRequest.
   */
  instantiatesUri?: string[];

  /**
   * Plan/proposal/order fulfilled by this request.
   */
  basedOn?: Reference<Resource>[];

  /**
   * The request takes the place of the referenced completed or terminated
   * request(s).
   */
  priorRequest?: Reference<Resource>[];

  /**
   * Composite request this is part of.
   */
  groupIdentifier?: Identifier;

  /**
   * The status of the request.
   */
  status?: 'draft' | 'active' | 'on-hold' | 'revoked' | 'completed' | 'entered-in-error' | 'unknown';

  /**
   * Whether the request is a proposal, plan, an original order or a reflex
   * order.
   */
  intent: 'proposal' | 'plan' | 'directive' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';

  /**
   * Indicates how quickly the {{title}} should be addressed with respect
   * to other requests.
   */
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';

  /**
   * The details of the device to be used.
   */
  codeReference?: Reference<Device>;

  /**
   * The details of the device to be used.
   */
  codeCodeableConcept?: CodeableConcept;

  /**
   * Specific parameters for the ordered item.  For example, the prism
   * value for lenses.
   */
  parameter?: DeviceRequestParameter[];

  /**
   * The patient who will use the device.
   */
  subject: Reference<Patient | Group | Location | Device>;

  /**
   * An encounter that provides additional context in which this request is
   * made.
   */
  encounter?: Reference<Encounter>;

  /**
   * The timing schedule for the use of the device. The Schedule data type
   * allows many different expressions, for example. &quot;Every 8 hours&quot;;
   * &quot;Three times a day&quot;; &quot;1/2 an hour before breakfast for 10 days from
   * 23-Dec 2011:&quot;; &quot;15 Oct 2013, 17 Oct 2013 and 1 Nov 2013&quot;.
   */
  occurrenceDateTime?: string;

  /**
   * The timing schedule for the use of the device. The Schedule data type
   * allows many different expressions, for example. &quot;Every 8 hours&quot;;
   * &quot;Three times a day&quot;; &quot;1/2 an hour before breakfast for 10 days from
   * 23-Dec 2011:&quot;; &quot;15 Oct 2013, 17 Oct 2013 and 1 Nov 2013&quot;.
   */
  occurrencePeriod?: Period;

  /**
   * The timing schedule for the use of the device. The Schedule data type
   * allows many different expressions, for example. &quot;Every 8 hours&quot;;
   * &quot;Three times a day&quot;; &quot;1/2 an hour before breakfast for 10 days from
   * 23-Dec 2011:&quot;; &quot;15 Oct 2013, 17 Oct 2013 and 1 Nov 2013&quot;.
   */
  occurrenceTiming?: Timing;

  /**
   * When the request transitioned to being actionable.
   */
  authoredOn?: string;

  /**
   * The individual who initiated the request and has responsibility for
   * its activation.
   */
  requester?: Reference<Device | Practitioner | PractitionerRole | Organization>;

  /**
   * Desired type of performer for doing the diagnostic testing.
   */
  performerType?: CodeableConcept;

  /**
   * The desired performer for doing the diagnostic testing.
   */
  performer?: Reference<Practitioner | PractitionerRole | Organization | CareTeam | HealthcareService | Patient | Device | RelatedPerson>;

  /**
   * Reason or justification for the use of this device.
   */
  reasonCode?: CodeableConcept[];

  /**
   * Reason or justification for the use of this device.
   */
  reasonReference?: Reference<Condition | Observation | DiagnosticReport | DocumentReference>[];

  /**
   * Insurance plans, coverage extensions, pre-authorizations and/or
   * pre-determinations that may be required for delivering the requested
   * service.
   */
  insurance?: Reference<Coverage | ClaimResponse>[];

  /**
   * Additional clinical information about the patient that may influence
   * the request fulfilment.  For example, this may include where on the
   * subject's body the device will be used (i.e. the target site).
   */
  supportingInfo?: Reference<Resource>[];

  /**
   * Details about this request that were not represented at all or
   * sufficiently in one of the attributes provided in a class. These may
   * include for example a comment, an instruction, or a note associated
   * with the statement.
   */
  note?: Annotation[];

  /**
   * Key events in the history of the request.
   */
  relevantHistory?: Reference<Provenance>[];
}

/**
 * The details of the device to be used.
 */
export type DeviceRequestCode = CodeableConcept | Reference<Device>;

/**
 * The timing schedule for the use of the device. The Schedule data type
 * allows many different expressions, for example. &quot;Every 8 hours&quot;;
 * &quot;Three times a day&quot;; &quot;1/2 an hour before breakfast for 10 days from
 * 23-Dec 2011:&quot;; &quot;15 Oct 2013, 17 Oct 2013 and 1 Nov 2013&quot;.
 */
export type DeviceRequestOccurrence = Period | string | Timing;

/**
 * Specific parameters for the ordered item.  For example, the prism
 * value for lenses.
 */
export interface DeviceRequestParameter {

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
   * A code or string that identifies the device detail being asserted.
   */
  code?: CodeableConcept;

  /**
   * The value of the device detail.
   */
  valueCodeableConcept?: CodeableConcept;

  /**
   * The value of the device detail.
   */
  valueQuantity?: Quantity;

  /**
   * The value of the device detail.
   */
  valueRange?: Range;

  /**
   * The value of the device detail.
   */
  valueBoolean?: boolean;
}

/**
 * The value of the device detail.
 */
export type DeviceRequestParameterValue = boolean | CodeableConcept | Quantity | Range;
