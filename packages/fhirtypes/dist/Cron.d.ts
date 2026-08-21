// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { Address } from './Address.d.ts';
import type { Age } from './Age.d.ts';
import type { Annotation } from './Annotation.d.ts';
import type { Attachment } from './Attachment.d.ts';
import type { Bot } from './Bot.d.ts';
import type { CodeableConcept } from './CodeableConcept.d.ts';
import type { Coding } from './Coding.d.ts';
import type { ContactDetail } from './ContactDetail.d.ts';
import type { ContactPoint } from './ContactPoint.d.ts';
import type { Contributor } from './Contributor.d.ts';
import type { Count } from './Count.d.ts';
import type { DataRequirement } from './DataRequirement.d.ts';
import type { Distance } from './Distance.d.ts';
import type { Dosage } from './Dosage.d.ts';
import type { Duration } from './Duration.d.ts';
import type { Expression } from './Expression.d.ts';
import type { Extension } from './Extension.d.ts';
import type { HumanName } from './HumanName.d.ts';
import type { Identifier } from './Identifier.d.ts';
import type { Meta } from './Meta.d.ts';
import type { Money } from './Money.d.ts';
import type { Narrative } from './Narrative.d.ts';
import type { ParameterDefinition } from './ParameterDefinition.d.ts';
import type { Period } from './Period.d.ts';
import type { ProjectMembership } from './ProjectMembership.d.ts';
import type { Quantity } from './Quantity.d.ts';
import type { Range } from './Range.d.ts';
import type { Ratio } from './Ratio.d.ts';
import type { Reference } from './Reference.d.ts';
import type { RelatedArtifact } from './RelatedArtifact.d.ts';
import type { Resource } from './Resource.d.ts';
import type { SampledData } from './SampledData.d.ts';
import type { Signature } from './Signature.d.ts';
import type { Timing } from './Timing.d.ts';
import type { TriggerDefinition } from './TriggerDefinition.d.ts';
import type { UsageContext } from './UsageContext.d.ts';

/**
 * A scheduled job that executes a Bot on a recurring schedule.
 */
export interface Cron {

  /**
   * This is a Cron resource
   */
  readonly resourceType: 'Cron';

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
   * The status of the scheduled job. Only a job with status 'active' is
   * registered with the scheduler; any other status removes it while
   * leaving the schedule itself intact, so the job can be turned back on
   * without redefining it.
   */
  status: 'requested' | 'active' | 'error' | 'off';

  /**
   * The project membership whose identity and access policy the scheduled
   * job assumes when it runs.
   */
  onBehalfOf: Reference<ProjectMembership>;

  /**
   * Input passed to the target each time the scheduled job runs, with the
   * same structure as Parameters.parameter. When absent, the Cron resource
   * itself is passed as the input.
   */
  parameter?: CronParameter[];

  /**
   * A schedule for the job to be executed, as a cron expression. An
   * expression that is not a valid five-field cron expression is rejected
   * on write. When absent, the job has no schedule and never runs; to
   * pause a job that has one, set status to something other than active.
   */
  cronString?: string;

  /**
   * The point in time after which the job no longer runs. A job whose end
   * time has already passed is never scheduled, and a running one is
   * removed once the time passes. When absent, the job runs until it is
   * disabled or deleted.
   */
  endTime?: string;

  /**
   * The target invoked each time the scheduled job runs.
   */
  targetReference: Reference<Bot>;
}

/**
 * Input passed to the target each time the scheduled job runs, with the
 * same structure as Parameters.parameter. When absent, the Cron resource
 * itself is passed as the input.
 */
export interface CronParameter {

  /**
   * The name of the parameter (reference to the operation definition).
   */
  name: string;

  /**
   * If the parameter is a data type.
   */
  valueBase64Binary?: string;

  /**
   * If the parameter is a data type.
   */
  valueBoolean?: boolean;

  /**
   * If the parameter is a data type.
   */
  valueCanonical?: string;

  /**
   * If the parameter is a data type.
   */
  valueCode?: string;

  /**
   * If the parameter is a data type.
   */
  valueDate?: string;

  /**
   * If the parameter is a data type.
   */
  valueDateTime?: string;

  /**
   * If the parameter is a data type.
   */
  valueDecimal?: number;

  /**
   * If the parameter is a data type.
   */
  valueId?: string;

  /**
   * If the parameter is a data type.
   */
  valueInstant?: string;

  /**
   * If the parameter is a data type.
   */
  valueInteger?: number;

  /**
   * If the parameter is a data type.
   */
  valueMarkdown?: string;

  /**
   * If the parameter is a data type.
   */
  valueOid?: string;

  /**
   * If the parameter is a data type.
   */
  valuePositiveInt?: number;

  /**
   * If the parameter is a data type.
   */
  valueString?: string;

  /**
   * If the parameter is a data type.
   */
  valueTime?: string;

  /**
   * If the parameter is a data type.
   */
  valueUnsignedInt?: number;

  /**
   * If the parameter is a data type.
   */
  valueUri?: string;

  /**
   * If the parameter is a data type.
   */
  valueUrl?: string;

  /**
   * If the parameter is a data type.
   */
  valueUuid?: string;

  /**
   * If the parameter is a data type.
   */
  valueAddress?: Address;

  /**
   * If the parameter is a data type.
   */
  valueAge?: Age;

  /**
   * If the parameter is a data type.
   */
  valueAnnotation?: Annotation;

  /**
   * If the parameter is a data type.
   */
  valueAttachment?: Attachment;

  /**
   * If the parameter is a data type.
   */
  valueCodeableConcept?: CodeableConcept;

  /**
   * If the parameter is a data type.
   */
  valueCoding?: Coding;

  /**
   * If the parameter is a data type.
   */
  valueContactPoint?: ContactPoint;

  /**
   * If the parameter is a data type.
   */
  valueCount?: Count;

  /**
   * If the parameter is a data type.
   */
  valueDistance?: Distance;

  /**
   * If the parameter is a data type.
   */
  valueDuration?: Duration;

  /**
   * If the parameter is a data type.
   */
  valueHumanName?: HumanName;

  /**
   * If the parameter is a data type.
   */
  valueIdentifier?: Identifier;

  /**
   * If the parameter is a data type.
   */
  valueMoney?: Money;

  /**
   * If the parameter is a data type.
   */
  valuePeriod?: Period;

  /**
   * If the parameter is a data type.
   */
  valueQuantity?: Quantity;

  /**
   * If the parameter is a data type.
   */
  valueRange?: Range;

  /**
   * If the parameter is a data type.
   */
  valueRatio?: Ratio;

  /**
   * If the parameter is a data type.
   */
  valueReference?: Reference;

  /**
   * If the parameter is a data type.
   */
  valueSampledData?: SampledData;

  /**
   * If the parameter is a data type.
   */
  valueSignature?: Signature;

  /**
   * If the parameter is a data type.
   */
  valueTiming?: Timing;

  /**
   * If the parameter is a data type.
   */
  valueContactDetail?: ContactDetail;

  /**
   * If the parameter is a data type.
   */
  valueContributor?: Contributor;

  /**
   * If the parameter is a data type.
   */
  valueDataRequirement?: DataRequirement;

  /**
   * If the parameter is a data type.
   */
  valueExpression?: Expression;

  /**
   * If the parameter is a data type.
   */
  valueParameterDefinition?: ParameterDefinition;

  /**
   * If the parameter is a data type.
   */
  valueRelatedArtifact?: RelatedArtifact;

  /**
   * If the parameter is a data type.
   */
  valueTriggerDefinition?: TriggerDefinition;

  /**
   * If the parameter is a data type.
   */
  valueUsageContext?: UsageContext;

  /**
   * If the parameter is a data type.
   */
  valueDosage?: Dosage;

  /**
   * If the parameter is a data type.
   */
  valueMeta?: Meta;

  /**
   * If the parameter is a whole resource.
   */
  resource?: Resource;

  /**
   * A named part of a multi-part parameter.
   */
  part?: CronParameter[];
}

/**
 * If the parameter is a data type.
 */
export type CronParameterValue = Address | Age | Annotation | Attachment | boolean | CodeableConcept | Coding |
    ContactDetail | ContactPoint | Contributor | Count | DataRequirement | Distance | Dosage | Duration | Expression |
    HumanName | Identifier | Meta | Money | number | ParameterDefinition | Period | Quantity | Range | Ratio | Reference |
    RelatedArtifact | SampledData | Signature | string | Timing | TriggerDefinition | UsageContext;
