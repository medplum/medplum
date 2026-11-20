// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { Bot } from './Bot.d.ts';
import type { ClientApplication } from './ClientApplication.d.ts';
import type { Extension } from './Extension.d.ts';
import type { Identifier } from './Identifier.d.ts';
import type { Meta } from './Meta.d.ts';
import type { Narrative } from './Narrative.d.ts';
import type { Organization } from './Organization.d.ts';
import type { Patient } from './Patient.d.ts';
import type { Practitioner } from './Practitioner.d.ts';
import type { Reference } from './Reference.d.ts';
import type { RelatedPerson } from './RelatedPerson.d.ts';
import type { Resource } from './Resource.d.ts';

/**
 * A third-party credential, such as an API key, client secret, or OAuth
 * refresh token, stored encrypted.
 */
export interface EncryptedSecret {

  /**
   * This is a EncryptedSecret resource
   */
  readonly resourceType: 'EncryptedSecret';

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
   * Business identifiers for this secret, such as an external account ID.
   */
  identifier?: Identifier[];

  /**
   * The status of the secret. Only an active secret returns its value.
   * Revoked is terminal: the server clears the value and the secret cannot
   * be reactivated.
   */
  status: 'active' | 'inactive' | 'revoked';

  /**
   * The kind of secret, such as google-calendar-token. Namespace by
   * convention, such as medplum/surescripts-key. Immutable after create,
   * and bound into the encryption context.
   */
  code: string;

  /**
   * A human-readable label for the secret.
   */
  name?: string;

  /**
   * A description of the purpose of the secret and how it is used.
   */
  description?: string;

  /**
   * The person, organization, or application the secret belongs to.
   * Immutable after create, and bound into the encryption context.
   */
  owner?: Reference<Patient | Practitioner | RelatedPerson | Organization | Bot | ClientApplication>;

  /**
   * The time after which the secret is no longer valid and its value is
   * not returned.
   */
  expires?: string;

  /**
   * The encrypted value. Written only by the server through $set-value;
   * any client-supplied value is ignored.
   */
  encryptedValue?: string;
}
