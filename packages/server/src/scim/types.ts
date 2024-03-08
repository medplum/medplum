/**
 * A complex attribute containing resource metadata.  All "meta"
 * sub-attributes are assigned by the service provider (have a
 * "mutability" of "readOnly"), and all of these sub-attributes have
 * a "returned" characteristic of "default".  This attribute SHALL be
 * ignored when provided by clients.
 *
 * See SCIM 3.1 - Common Attributes
 * https://www.rfc-editor.org/rfc/rfc7643#section-3.1
 */
export interface ScimMeta {
  resourceType?: string;
  created?: string;
  lastModified?: string;
  location?: string;
  version?: string;
}

/**
 * The components of the user's name.  Service providers MAY return
 * just the full name as a single string in the formatted
 * sub-attribute, or they MAY return just the individual component
 * attributes using the other sub-attributes, or they MAY return
 * both.  If both variants are returned, they SHOULD be describing
 * the same name, with the formatted name indicating how the
 * component attributes should be combined.
 *
 * See SCIM 4.1 - User Resource
 * https://www.rfc-editor.org/rfc/rfc7643#section-4.1
 */
export interface ScimName {
  formatted?: string;
  familyName?: string;
  givenName?: string;
  middleName?: string;
  honorificPrefix?: string;
  honorificSuffix?: string;
}

/**
 * Phone numbers for the user.  The value SHOULD be specified
 * according to the format defined in [RFC3966], e.g.,
 * 'tel:+1-201-555-0123'.  Service providers SHOULD canonicalize the
 * value according to [RFC3966] format, when appropriate.  The
 * "display" sub-attribute MAY be used to return the canonicalized
 * representation of the phone number value.  The sub-attribute
 * "type" often has typical values of "work", "home", "mobile",
 * "fax", "pager", and "other" and MAY allow more types to be defined
 * by the SCIM clients.
 *
 * See SCIM 4.1 - User Resource
 * https://www.rfc-editor.org/rfc/rfc7643#section-4.1
 */
export interface ScimPhoneNumber {
  type?: string;
  value?: string;
}

/**
 * Email addresses for the User.  The value SHOULD be specified
 * according to [RFC5321].  Service providers SHOULD canonicalize the
 * value according to [RFC5321], e.g., "bjensen@example.com" instead
 * of "bjensen@EXAMPLE.COM".  The "display" sub-attribute MAY be used
 * to return the canonicalized representation of the email value.
 * The "type" sub-attribute is used to provide a classification
 * meaningful to the (human) user.  The user interface should
 * encourage the use of basic values of "work", "home", and "other"
 * and MAY allow additional type values to be used at the discretion
 * of SCIM clients.
 *
 * See SCIM 4.1 - User Resource
 * https://www.rfc-editor.org/rfc/rfc7643#section-4.1
 */
export interface ScimEmail {
  type?: string;
  value?: string;
  primary?: boolean;
}

/**
 * SCIM provides a resource type for "User" resources.  The core schema
 * for "User" is identified using the following schema URI:
 * "urn:ietf:params:scim:schemas:core:2.0:User".  The following
 * attributes are defined in addition to the core schema attributes.
 *
 * See SCIM 4.1 - User Resource
 * https://www.rfc-editor.org/rfc/rfc7643#section-4.1
 */
export interface ScimUser {
  schemas?: string[];
  id?: string;
  externalId?: string;
  userType?: string;
  userName?: string;
  meta?: ScimMeta;
  name?: ScimName;
  phoneNumbers?: ScimPhoneNumber[];
  emails?: ScimEmail[];
  active?: boolean;
}

/**
 * Responses MUST be identified using the following URI:
 * "urn:ietf:params:scim:api:messages:2.0:ListResponse".  The following
 * attributes are defined for responses.
 *
 * See SCIM 3.4.2 - List Response
 * https://www.rfc-editor.org/rfc/rfc7644#section-3.4.2
 */
export interface ScimListResponse<T> {
  schemas?: string[];
  totalResults?: number;
  itemsPerPage?: number;
  startIndex?: number;
  Resources: T[];
}
