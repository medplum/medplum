/*
 * This is a generated file
 * Do not edit manually.
 */

import { Extension } from './Extension';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { PrimitiveExtension } from './PrimitiveExtension';
import { Resource } from './Resource';

/**
 * A JSON object that represents a cryptographic key. The members of the
 * object represent properties of the key, including its value.
 */
export interface JsonWebKey {

  /**
   * This is a JsonWebKey resource
   */
  readonly resourceType: 'JsonWebKey';

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  id?: string;

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  _id?: PrimitiveExtension;

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
   * A reference to a set of rules that were followed when the resource was
   * constructed, and which must be understood when processing the content.
   * Often, this is a reference to an implementation guide that defines the
   * special rules along with other profiles etc.
   */
  _implicitRules?: PrimitiveExtension;

  /**
   * The base language in which the resource is written.
   */
  language?: string;

  /**
   * The base language in which the resource is written.
   */
  _language?: PrimitiveExtension;

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
   * Whether this key is in active use.
   */
  active?: boolean;

  /**
   * Whether this key is in active use.
   */
  _active?: PrimitiveExtension;

  /**
   * The specific cryptographic algorithm used with the key.
   */
  alg?: string;

  /**
   * The specific cryptographic algorithm used with the key.
   */
  _alg?: PrimitiveExtension;

  /**
   * The family of cryptographic algorithms used with the key.
   */
  kty?: string;

  /**
   * The family of cryptographic algorithms used with the key.
   */
  _kty?: PrimitiveExtension;

  /**
   * How the key was meant to be used; sig represents the signature.
   */
  use?: string;

  /**
   * How the key was meant to be used; sig represents the signature.
   */
  _use?: PrimitiveExtension;

  /**
   * The operation(s) for which the key is intended to be used.
   */
  key_ops?: string[];

  /**
   * The operation(s) for which the key is intended to be used.
   */
  _key_ops?: (PrimitiveExtension | null)[];

  /**
   * The x.509 certificate chain. The first entry in the array is the
   * certificate to use for token verification; the other certificates can
   * be used to verify this first certificate.
   */
  x5c?: string[];

  /**
   * The x.509 certificate chain. The first entry in the array is the
   * certificate to use for token verification; the other certificates can
   * be used to verify this first certificate.
   */
  _x5c?: (PrimitiveExtension | null)[];

  /**
   * The modulus for the RSA public key.
   */
  n?: string;

  /**
   * The modulus for the RSA public key.
   */
  _n?: PrimitiveExtension;

  /**
   * The exponent for the RSA public key.
   */
  e?: string;

  /**
   * The exponent for the RSA public key.
   */
  _e?: PrimitiveExtension;

  /**
   * The unique identifier for the key.
   */
  kid?: string;

  /**
   * The unique identifier for the key.
   */
  _kid?: PrimitiveExtension;

  /**
   * The thumbprint of the x.509 cert (SHA-1 thumbprint).
   */
  x5t?: string;

  /**
   * The thumbprint of the x.509 cert (SHA-1 thumbprint).
   */
  _x5t?: PrimitiveExtension;

  /**
   * The exponent for the RSA private key.
   */
  d?: string;

  /**
   * The exponent for the RSA private key.
   */
  _d?: PrimitiveExtension;

  /**
   * The first prime factor.
   */
  p?: string;

  /**
   * The first prime factor.
   */
  _p?: PrimitiveExtension;

  /**
   * The second prime factor.
   */
  q?: string;

  /**
   * The second prime factor.
   */
  _q?: PrimitiveExtension;

  /**
   * The first factor CRT exponent.
   */
  dp?: string;

  /**
   * The first factor CRT exponent.
   */
  _dp?: PrimitiveExtension;

  /**
   * The second factor CRT exponent.
   */
  dq?: string;

  /**
   * The second factor CRT exponent.
   */
  _dq?: PrimitiveExtension;

  /**
   * The first CRT coefficient.
   */
  qi?: string;

  /**
   * The first CRT coefficient.
   */
  _qi?: PrimitiveExtension;
}
