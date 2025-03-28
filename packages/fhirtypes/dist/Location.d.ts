/*
 * This is a generated file
 * Do not edit manually.
 */

import { Address } from './Address';
import { CodeableConcept } from './CodeableConcept';
import { Coding } from './Coding';
import { ContactPoint } from './ContactPoint';
import { Endpoint } from './Endpoint';
import { Extension } from './Extension';
import { Identifier } from './Identifier';
import { Meta } from './Meta';
import { Narrative } from './Narrative';
import { Organization } from './Organization';
import { Reference } from './Reference';
import { Resource } from './Resource';

/**
 * Details and position information for a physical place where services
 * are provided and resources and participants may be stored, found,
 * contained, or accommodated.
 */
export interface Location {

  /**
   * This is a Location resource
   */
  readonly resourceType: 'Location';

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
   * Unique code or number identifying the location to its users.
   */
  identifier?: Identifier[];

  /**
   * The status property covers the general availability of the resource,
   * not the current value which may be covered by the operationStatus, or
   * by a schedule/slots if they are configured for the location.
   */
  status?: 'active' | 'suspended' | 'inactive';

  /**
   * The operational status covers operation values most relevant to beds
   * (but can also apply to rooms/units/chairs/etc. such as an isolation
   * unit/dialysis chair). This typically covers concepts such as
   * contamination, housekeeping, and other activities like maintenance.
   */
  operationalStatus?: Coding;

  /**
   * Name of the location as used by humans. Does not need to be unique.
   */
  name?: string;

  /**
   * A list of alternate names that the location is known as, or was known
   * as, in the past.
   */
  alias?: string[];

  /**
   * Description of the Location, which helps in finding or referencing the
   * place.
   */
  description?: string;

  /**
   * Indicates whether a resource instance represents a specific location
   * or a class of locations.
   */
  mode?: 'instance' | 'kind';

  /**
   * Indicates the type of function performed at the location.
   */
  type?: CodeableConcept[];

  /**
   * The contact details of communication devices available at the
   * location. This can include phone numbers, fax numbers, mobile numbers,
   * email addresses and web sites.
   */
  telecom?: ContactPoint[];

  /**
   * Physical location.
   */
  address?: Address;

  /**
   * Physical form of the location, e.g. building, room, vehicle, road.
   */
  physicalType?: CodeableConcept;

  /**
   * The absolute geographic location of the Location, expressed using the
   * WGS84 datum (This is the same co-ordinate system used in KML).
   */
  position?: LocationPosition;

  /**
   * The organization responsible for the provisioning and upkeep of the
   * location.
   */
  managingOrganization?: Reference<Organization>;

  /**
   * Another Location of which this Location is physically a part of.
   */
  partOf?: Reference<Location>;

  /**
   * What days/times during a week is this location usually open.
   */
  hoursOfOperation?: LocationHoursOfOperation[];

  /**
   * A description of when the locations opening ours are different to
   * normal, e.g. public holiday availability. Succinctly describing all
   * possible exceptions to normal site availability as detailed in the
   * opening hours Times.
   */
  availabilityExceptions?: string;

  /**
   * Technical endpoints providing access to services operated for the
   * location.
   */
  endpoint?: Reference<Endpoint>[];
}

/**
 * What days/times during a week is this location usually open.
 */
export interface LocationHoursOfOperation {

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
   * Indicates which days of the week are available between the start and
   * end Times.
   */
  daysOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];

  /**
   * The Location is open all day.
   */
  allDay?: boolean;

  /**
   * Time that the Location opens.
   */
  openingTime?: string;

  /**
   * Time that the Location closes.
   */
  closingTime?: string;
}

/**
 * The absolute geographic location of the Location, expressed using the
 * WGS84 datum (This is the same co-ordinate system used in KML).
 */
export interface LocationPosition {

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
   * Longitude. The value domain and the interpretation are the same as for
   * the text of the longitude element in KML (see notes below).
   */
  longitude: number;

  /**
   * Latitude. The value domain and the interpretation are the same as for
   * the text of the latitude element in KML (see notes below).
   */
  latitude: number;

  /**
   * Altitude. The value domain and the interpretation are the same as for
   * the text of the altitude element in KML (see notes below).
   */
  altitude?: number;
}
