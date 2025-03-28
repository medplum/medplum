/*
 * This is a generated file
 * Do not edit manually.
 */

import { Extension } from './Extension';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { Resource } from './Resource';

/**
 * User specific configuration for the Medplum application.
 */
export interface UserConfiguration {

  /**
   * This is a UserConfiguration resource
   */
  readonly resourceType: 'UserConfiguration';

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
   * A name associated with the UserConfiguration.
   */
  name?: string;

  /**
   * Optional menu of shortcuts to URLs.
   */
  menu?: UserConfigurationMenu[];

  /**
   * Shortcut links to URLs.
   */
  search?: UserConfigurationSearch[];

  /**
   * User options that control the display of the application.
   */
  option?: UserConfigurationOption[];
}

/**
 * Optional menu of shortcuts to URLs.
 */
export interface UserConfigurationMenu {

  /**
   * Title of the menu.
   */
  title: string;

  /**
   * Shortcut links to URLs.
   */
  link?: UserConfigurationMenuLink[];
}

/**
 * Shortcut links to URLs.
 */
export interface UserConfigurationMenuLink {

  /**
   * The human friendly name of the link.
   */
  name: string;

  /**
   * The URL target of the link.
   */
  target: string;
}

/**
 * User options that control the display of the application.
 */
export interface UserConfigurationOption {

  /**
   * The unique identifier of the option.
   */
  id: string;

  /**
   * Value of option - must be one of a constrained set of the data types
   * (see [Extensibility](extensibility.html) for a list).
   */
  valueBoolean?: boolean;

  /**
   * Value of option - must be one of a constrained set of the data types
   * (see [Extensibility](extensibility.html) for a list).
   */
  valueCode?: string;

  /**
   * Value of option - must be one of a constrained set of the data types
   * (see [Extensibility](extensibility.html) for a list).
   */
  valueDecimal?: number;

  /**
   * Value of option - must be one of a constrained set of the data types
   * (see [Extensibility](extensibility.html) for a list).
   */
  valueInteger?: number;

  /**
   * Value of option - must be one of a constrained set of the data types
   * (see [Extensibility](extensibility.html) for a list).
   */
  valueString?: string;
}

/**
 * Value of option - must be one of a constrained set of the data types
 * (see [Extensibility](extensibility.html) for a list).
 */
export type UserConfigurationOptionValue = boolean | number | string;

/**
 * Shortcut links to URLs.
 */
export interface UserConfigurationSearch {

  /**
   * The human friendly name of the link.
   */
  name: string;

  /**
   * The rules that the server should use to determine which resources to
   * return.
   */
  criteria: string;
}
