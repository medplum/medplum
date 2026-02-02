// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import { AccessPolicy } from './AccessPolicy';
import { Extension } from './Extension';
import { Identifier } from './Identifier';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { Reference } from './Reference';
import { Resource } from './Resource';
import { ResourceType } from './ResourceType';
import { User } from './User';

/**
 * Encapsulation of resources for a specific project or organization.
 */
export interface Project {

  /**
   * This is a Project resource
   */
  readonly resourceType: 'Project';

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
   * An identifier for this project.
   */
  identifier?: Identifier[];

  /**
   * A name associated with the Project.
   */
  name?: string;

  /**
   * A summary, characterization or explanation of the Project.
   */
  description?: string;

  /**
   * Whether this project is the super administrator project. A super
   * administrator is a user who has complete access to all resources in
   * all projects.
   */
  superAdmin?: boolean;

  /**
   * Whether this project uses strict FHIR validation.  This setting has
   * been deprecated, and can only be set by a super admin.
   */
  strictMode?: boolean;

  /**
   * Whether this project uses referential integrity on write operations
   * such as 'create' and 'update'.
   */
  checkReferencesOnWrite?: boolean;

  /**
   * The user who owns the project.
   */
  owner?: Reference<User>;

  /**
   * A list of optional features that are enabled for the project.
   */
  features?: ('ai' | 'aws-comprehend' | 'aws-textract' | 'bots' | 'cron' | 'email' | 'google-auth-required' |
      'graphql-introspection' | 'websocket-subscriptions' | 'transaction-bundles' | 'validate-terminology')[];

  /**
   * The default access policy for patients using open registration.
   */
  defaultPatientAccessPolicy?: Reference<AccessPolicy>;

  /**
   * Option or parameter that can be adjusted within the Medplum Project to
   * customize its behavior.
   */
  setting?: ProjectSetting[];

  /**
   * Option or parameter that can be adjusted within the Medplum Project to
   * customize its behavior, only visible to project administrators.
   */
  secret?: ProjectSetting[];

  /**
   * Option or parameter that can be adjusted within the Medplum Project to
   * customize its behavior, only modifiable by system administrators.
   */
  systemSetting?: ProjectSetting[];

  /**
   * Option or parameter that can be adjusted within the Medplum Project to
   * customize its behavior, only visible to system administrators.
   */
  systemSecret?: ProjectSetting[];

  /**
   * Web application or web site that is associated with the project.
   */
  site?: ProjectSite[];

  /**
   * Linked Projects whose contents are made available to this one
   */
  link?: ProjectLink[];

  /**
   * Default profiles to apply to resources in this project that do not
   * individually specify profiles
   */
  defaultProfile?: ProjectDefaultProfile[];

  /**
   * The resource types exported by the project when linked
   */
  exportedResourceType?: ResourceType[];

  /**
   * The shards associated with this Project
   */
  shard?: ProjectShard[];
}

/**
 * Default profiles to apply to resources in this project that do not
 * individually specify profiles
 */
export interface ProjectDefaultProfile {

  /**
   * The resource type onto which to apply the default profiles
   */
  resourceType: ResourceType;

  /**
   * The profiles to add by default
   */
  profile: string[];
}

/**
 * Linked Projects whose contents are made available to this one
 */
export interface ProjectLink {

  /**
   * A reference to the Project to be linked into this one
   */
  project: Reference<Project>;
}

/**
 * Option or parameter that can be adjusted within the Medplum Project to
 * customize its behavior.
 */
export interface ProjectSetting {

  /**
   * The secret name.
   */
  name: string;

  /**
   * The secret value.
   */
  valueString?: string;

  /**
   * The secret value.
   */
  valueBoolean?: boolean;

  /**
   * The secret value.
   */
  valueDecimal?: number;

  /**
   * The secret value.
   */
  valueInteger?: number;
}

/**
 * The secret value.
 */
export type ProjectSettingValue = boolean | number | string;

/**
 * The shards associated with this Project
 */
export interface ProjectShard {

  /**
   * The sahrd id
   */
  id?: string;
}

/**
 * Web application or web site that is associated with the project.
 */
export interface ProjectSite {

  /**
   * Friendly name that will make it easy for you to identify the site in
   * the future.
   */
  name: string;

  /**
   * The list of domain names associated with the site. User authentication
   * will be restricted to the domains you enter here, plus any subdomains.
   * In other words, a registration for example.com also registers
   * subdomain.example.com. A valid domain requires a host and must not
   * include any path, port, query or fragment.
   */
  domain: string[];

  /**
   * The publicly visible Google Client ID for the site. This is used to
   * authenticate users with Google. This value is available in the Google
   * Developer Console.
   */
  googleClientId?: string;

  /**
   * The private Google Client Secret for the site. This value is available
   * in the Google Developer Console.
   */
  googleClientSecret?: string;

  /**
   * The publicly visible reCAPTCHA site key. This value is generated when
   * you create a new reCAPTCHA site in the reCAPTCHA admin console. Use
   * this site key in the HTML code your site serves to users.
   */
  recaptchaSiteKey?: string;

  /**
   * The private reCAPTCHA secret key. This value is generated when you
   * create a new reCAPTCHA site in the reCAPTCHA admin console. Use this
   * secret key for communication between your site and reCAPTCHA.
   */
  recaptchaSecretKey?: string;
}
