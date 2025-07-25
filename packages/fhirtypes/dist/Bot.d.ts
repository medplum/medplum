/*
 * This is a generated file
 * Do not edit manually.
 */

import { Attachment } from './Attachment';
import { CodeableConcept } from './CodeableConcept';
import { Extension } from './Extension';
import { Identifier } from './Identifier';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { Resource } from './Resource';
import { Timing } from './Timing';

/**
 * Bot account for automated actions.
 */
export interface Bot {

  /**
   * This is a Bot resource
   */
  readonly resourceType: 'Bot';

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
   * An identifier for this bot.
   */
  identifier?: Identifier[];

  /**
   * A name associated with the Bot.
   */
  name?: string;

  /**
   * A summary, characterization or explanation of the Bot.
   */
  description?: string;

  /**
   * The identifier of the bot runtime environment (i.e., vmcontext,
   * awslambda, etc).
   */
  runtimeVersion?: 'awslambda' | 'vmcontext' | 'fission';

  /**
   * The maximum allowed execution time of the bot in seconds.
   */
  timeout?: number;

  /**
   * Image of the bot.
   */
  photo?: Attachment;

  /**
   * A schedule for the bot to be executed.
   */
  cronTiming?: Timing;

  /**
   * A schedule for the bot to be executed.
   */
  cronString?: string;

  /**
   * A code that classifies the service for searching, sorting and display
   * purposes (e.g. &quot;Surgical Procedure&quot;).
   */
  category?: CodeableConcept[];

  /**
   * Optional flag to indicate that the bot is a system bot and therefore
   * has access to system secrets.
   */
  system?: boolean;

  /**
   * Optional flag to indicate that the bot should be run as the user.
   */
  runAsUser?: boolean;

  /**
   * Optional flag to indicate that the bot can be used as an
   * unauthenticated public webhook. Note that this is a security risk and
   * should only be used for public bots that do not require
   * authentication.
   */
  publicWebhook?: boolean;

  /**
   * Criteria for creating an AuditEvent as a result of the bot invocation.
   * Possible values are 'always', 'never', 'on-error', or 'on-output'.
   * Default value is 'always'.
   */
  auditEventTrigger?: 'always' | 'never' | 'on-error' | 'on-output';

  /**
   * The destination system in which the AuditEvent is to be sent. Possible
   * values are 'log' or 'resource'. Default value is 'resource'.
   */
  auditEventDestination?: ('log' | 'resource')[];

  /**
   * Bot logic in original source code form written by developers.
   */
  sourceCode?: Attachment;

  /**
   * Bot logic in executable form as a result of compiling and bundling
   * source code.
   */
  executableCode?: Attachment;

  /**
   * @deprecated Bot logic script. Use Bot.sourceCode or Bot.executableCode
   * instead.
   */
  code?: string;
}

/**
 * A schedule for the bot to be executed.
 */
export type BotCron = string | Timing;
