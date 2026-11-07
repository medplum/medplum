// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

/**
 * A derivative of the RIM Act class, to be used when the other more
 * specific classes aren't appropriate.
 *
 * Act.negationInd, when set to &quot;true&quot;, is a positive assertion that the
 * Act as a whole is negated. Some properties such as Act.id,
 * Act.moodCode, and the participations are not affected. These
 * properties always have the same meaning: i.e., the author remains the
 * author of the negative Act. An act statement with negationInd is still
 * a statement about the specific fact described by the Act. For
 * instance, a negated &quot;finding of wheezing on July 1&quot; means that the
 * author positively denies that there was wheezing on July 1, and that
 * he takes the same responsibility for such statement and the same
 * requirement to have evidence for such statement than if he had not
 * used negation.
 */
export interface CdaAct {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaActTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  '@_negationInd'?: string;

  id?: CdaII[];

  code: CdaCD;

  text?: CdaED | string;

  statusCode?: CdaCS;

  effectiveTime?: CdaIVL_TS;

  priorityCode?: CdaCE;

  languageCode?: CdaCS;

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  entryRelationship?: CdaEntryRelationship[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:precondition2'?: CdaPrecondition2[];

  'sdtc:inFulfillmentOf1'?: CdaInFulfillmentOf1[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaActTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Mailing and home or office addresses. A sequence of address parts,
 * such as street or post office Box, city, postal code, country, etc.
 */
export interface CdaAD {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A boolean value specifying whether the order of the address parts is
   * known or not. While the address parts are always a Sequence, the order
   * in which they are presented may or may not be known. Where this
   * matters, the isNotOrdered property can be used to convey this
   * information.
   */
  '@_isNotOrdered'?: string;

  /**
   * A set of codes advising a system or user which address in a set of
   * like addresses to select for a given purpose.
   */
  '@_use'?: string;

  /**
   * Delimiters are printed without framing white space. If no value
   * component is provided, the delimiter appears as a line break.
   */
  delimiter?: (CdaADItemDelimiter | string)[];

  /**
   * Country
   */
  country?: (CdaADItemCountry | string)[];

  /**
   * A sub-unit of a country with limited sovereignty in a federally
   * organized country.
   */
  state?: (CdaADItemState | string)[];

  /**
   * A sub-unit of a state or province. (49 of the United States of America
   * use the term &quot;county;&quot; Louisiana uses the term &quot;parish&quot;.)
   */
  county?: (CdaADItemCounty | string)[];

  /**
   * The name of the city, town, village, or other community or delivery
   * center
   */
  city?: (CdaADItemCity | string)[];

  /**
   * A postal code designating a region defined by the postal service.
   */
  postalCode?: (CdaADItemPostalCode | string)[];

  /**
   * Street address line
   */
  streetAddressLine?: (CdaADItemStreetAddressLine | string)[];

  /**
   * The number of a building, house or lot alongside the street. Also
   * known as &quot;primary street number&quot;. This does not number the street but
   * rather the building.
   */
  houseNumber?: (CdaADItemHouseNumber | string)[];

  /**
   * The numeric portion of a building number
   */
  houseNumberNumeric?: (CdaADItemHouseNumberNumeric | string)[];

  /**
   * Direction (e.g., N, S, W, E)
   */
  direction?: (CdaADItemDirection | string)[];

  /**
   * Name of a roadway or artery recognized by a municipality (including
   * street type and direction)
   */
  streetName?: (CdaADItemStreetName | string)[];

  /**
   * The base name of a roadway or artery recognized by a municipality
   * (excluding street type and direction)
   */
  streetNameBase?: (CdaADItemStreetNameBase | string)[];

  /**
   * The designation given to the street. (e.g. Street, Avenue, Crescent,
   * etc.)
   */
  streetNameType?: (CdaADItemStreetNameType | string)[];

  /**
   * This can be a unit designator, such as apartment number, suite number,
   * or floor. There may be several unit designators in an address (e.g.,
   * &quot;3rd floor, Appt. 342&quot;). This can also be a designator pointing away
   * from the location, rather than specifying a smaller location within
   * some larger one (e.g., Dutch &quot;t.o.&quot; means &quot;opposite to&quot; for house
   * boats located across the street facing houses).
   */
  additionalLocator?: (CdaADItemAdditionalLocator | string)[];

  /**
   * The number or name of a specific unit contained within a building or
   * complex, as assigned by that building or complex.
   */
  unitID?: (CdaADItemUnitID | string)[];

  /**
   * Indicates the type of specific unit contained within a building or
   * complex. E.g. Appartment, Floor
   */
  unitType?: (CdaADItemUnitType | string)[];

  /**
   * The name of the party who will take receipt at the specified address,
   * and will take on responsibility for ensuring delivery to the target
   * recipient
   */
  careOf?: (CdaADItemCareOf | string)[];

  /**
   * A geographic sub-unit delineated for demographic purposes.
   */
  censusTract?: (CdaADItemCensusTract | string)[];

  /**
   * A delivery address line is frequently used instead of breaking out
   * delivery mode, delivery installation, etc. An address generally has
   * only a delivery address line or a street address line, but not both.
   */
  deliveryAddressLine?: (CdaADItemDeliveryAddressLine | string)[];

  /**
   * Indicates the type of delivery installation (the facility to which the
   * mail will be delivered prior to final shipping via the delivery mode.)
   * Example: post office, letter carrier depot, community mail center,
   * station, etc.
   */
  deliveryInstallationType?: (CdaADItemDeliveryInstallationType | string)[];

  /**
   * The location of the delivery installation, usually a town or city, and
   * is only required if the area is different from the municipality. Area
   * to which mail delivery service is provided from any postal facility or
   * service such as an individual letter carrier, rural route, or postal
   * route.
   */
  deliveryInstallationArea?: (CdaADItemDeliveryInstallationArea | string)[];

  /**
   * A number, letter or name identifying a delivery installation. E.g.,
   * for Station A, the delivery installation qualifier would be 'A'.
   */
  deliveryInstallationQualifier?: (CdaADItemDeliveryInstallationQualifier | string)[];

  /**
   * Indicates the type of service offered, method of delivery. For
   * example: post office box, rural route, general delivery, etc.
   */
  deliveryMode?: (CdaADItemDeliveryMode | string)[];

  /**
   * Represents the routing information such as a letter carrier route
   * number. It is the identifying number of the designator (the box number
   * or rural route number).
   */
  deliveryModeIdentifier?: (CdaADItemDeliveryModeIdentifier | string)[];

  /**
   * Any alphabetic character, fraction or other text that may appear after
   * the numeric portion of a building number
   */
  buildingNumberSuffix?: (CdaADItemBuildingNumberSuffix | string)[];

  /**
   * A numbered box located in a post station.
   */
  postBox?: (CdaADItemPostBox | string)[];

  /**
   * A subsection of a municipality
   */
  precinct?: (CdaADItemPrecinct | string)[];

  '#text'?: string[];

  /**
   * A General Timing Specification (GTS) specifying the periods of time
   * during which the address can be used. This is used to specify
   * different addresses for different times of the week or year.
   */
  useablePeriod?: (CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];
}

/**
 * A General Timing Specification (GTS) specifying the periods of time
 * during which the address can be used. This is used to specify
 * different addresses for different times of the week or year.
 */
export type CdaADUseablePeriod = (CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];

/**
 * This can be a unit designator, such as apartment number, suite number,
 * or floor. There may be several unit designators in an address (e.g.,
 * &quot;3rd floor, Appt. 342&quot;). This can also be a designator pointing away
 * from the location, rather than specifying a smaller location within
 * some larger one (e.g., Dutch &quot;t.o.&quot; means &quot;opposite to&quot; for house
 * boats located across the street facing houses).
 */
export interface CdaADItemAdditionalLocator {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Any alphabetic character, fraction or other text that may appear after
 * the numeric portion of a building number
 */
export interface CdaADItemBuildingNumberSuffix {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The name of the party who will take receipt at the specified address,
 * and will take on responsibility for ensuring delivery to the target
 * recipient
 */
export interface CdaADItemCareOf {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A geographic sub-unit delineated for demographic purposes.
 */
export interface CdaADItemCensusTract {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The name of the city, town, village, or other community or delivery
 * center
 */
export interface CdaADItemCity {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Country
 */
export interface CdaADItemCountry {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A sub-unit of a state or province. (49 of the United States of America
 * use the term &quot;county;&quot; Louisiana uses the term &quot;parish&quot;.)
 */
export interface CdaADItemCounty {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Delimiters are printed without framing white space. If no value
 * component is provided, the delimiter appears as a line break.
 */
export interface CdaADItemDelimiter {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A delivery address line is frequently used instead of breaking out
 * delivery mode, delivery installation, etc. An address generally has
 * only a delivery address line or a street address line, but not both.
 */
export interface CdaADItemDeliveryAddressLine {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The location of the delivery installation, usually a town or city, and
 * is only required if the area is different from the municipality. Area
 * to which mail delivery service is provided from any postal facility or
 * service such as an individual letter carrier, rural route, or postal
 * route.
 */
export interface CdaADItemDeliveryInstallationArea {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A number, letter or name identifying a delivery installation. E.g.,
 * for Station A, the delivery installation qualifier would be 'A'.
 */
export interface CdaADItemDeliveryInstallationQualifier {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Indicates the type of delivery installation (the facility to which the
 * mail will be delivered prior to final shipping via the delivery mode.)
 * Example: post office, letter carrier depot, community mail center,
 * station, etc.
 */
export interface CdaADItemDeliveryInstallationType {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Indicates the type of service offered, method of delivery. For
 * example: post office box, rural route, general delivery, etc.
 */
export interface CdaADItemDeliveryMode {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Represents the routing information such as a letter carrier route
 * number. It is the identifying number of the designator (the box number
 * or rural route number).
 */
export interface CdaADItemDeliveryModeIdentifier {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Direction (e.g., N, S, W, E)
 */
export interface CdaADItemDirection {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The number of a building, house or lot alongside the street. Also
 * known as &quot;primary street number&quot;. This does not number the street but
 * rather the building.
 */
export interface CdaADItemHouseNumber {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The numeric portion of a building number
 */
export interface CdaADItemHouseNumberNumeric {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A postal code designating a region defined by the postal service.
 */
export interface CdaADItemPostalCode {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A numbered box located in a post station.
 */
export interface CdaADItemPostBox {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A subsection of a municipality
 */
export interface CdaADItemPrecinct {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A sub-unit of a country with limited sovereignty in a federally
 * organized country.
 */
export interface CdaADItemState {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Street address line
 */
export interface CdaADItemStreetAddressLine {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Name of a roadway or artery recognized by a municipality (including
 * street type and direction)
 */
export interface CdaADItemStreetName {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The base name of a roadway or artery recognized by a municipality
 * (excluding street type and direction)
 */
export interface CdaADItemStreetNameBase {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The designation given to the street. (e.g. Street, Avenue, Crescent,
 * etc.)
 */
export interface CdaADItemStreetNameType {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The number or name of a specific unit contained within a building or
 * complex, as assigned by that building or complex.
 */
export interface CdaADItemUnitID {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * Indicates the type of specific unit contained within a building or
 * complex. E.g. Appartment, Floor
 */
export interface CdaADItemUnitType {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * A character string that may have a type-tag signifying its role in the
 * address. Typical parts that exist in about every address are street,
 * house number, or post box, postal code, city, country but other roles
 * may be defined regionally, nationally, or on an enterprise level (e.g.
 * in military addresses). Addresses are usually broken up into lines,
 * which are indicated by special line-breaking delimiter elements (e.g.,
 * DEL).
 */
export interface CdaADXP {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Specifies the type of the address part
   */
  '@_partType'?: string;
}

/**
 * The alternateIdentification extension provides additional information
 * about an identifier found in the linked role. The extensions augment
 * the id information in the linked role.  The id in the
 * alternateIdentification extension SHALL match an id in the linked
 * role. The alternateIdentification provides additional information
 * about a particular identifier, such as its type. As an extension it
 * needs to be safe for implementers to ignore this additional
 * information.
 */
export interface CdaAlternateIdentification {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  '@_classCode': string;

  id: CdaII;

  code?: CdaCD;

  statusCode?: CdaCS;

  effectiveTime?: CdaIVL_TS;
}

/**
 * Defines the basic properties of every data value. This is an abstract
 * type, meaning that no value can be just a data value without belonging
 * to any concrete type. Every concrete type is a specialization of this
 * general abstract DataValue type.
 */
export interface CdaANY {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;
}

/**
 * An author is a person in the role of an assigned author
 * (AssignedAuthor class).
 */
export interface CdaAssignedAuthor {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaAssignedAuthorTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  code?: CdaCE;

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  assignedPerson?: CdaPerson;

  assignedAuthoringDevice?: CdaAuthoringDevice;

  representedOrganization?: CdaOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaAssignedAuthorTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A custodian is a scoping organization in the role of an assigned
 * custodian (AssignedCustodian class).
 */
export interface CdaAssignedCustodian {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaAssignedCustodianTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  representedCustodianOrganization: CdaCustodianOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaAssignedCustodianTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * AssignedEntity (CDA Class)
 */
export interface CdaAssignedEntity {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaAssignedEntityTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  code?: CdaCE;

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  assignedPerson?: CdaPerson;

  representedOrganization?: CdaOrganization;

  'sdtc:patient'?: CdaAssignedEntitySdtcPatient;
}

export interface CdaAssignedEntitySdtcPatient {
  'sdtc:id': CdaII;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaAssignedEntityTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A participant is a person or organization in the role of a
 * participating entity (AssociatedEntity class).
 */
export interface CdaAssociatedEntity {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaAssociatedEntityTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  id?: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  code?: CdaCE;

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  associatedPerson?: CdaPerson;

  scopingOrganization?: CdaOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaAssociatedEntityTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Represents a participant who has attested to the accuracy of the
 * document, but who does not have privileges to legally authenticate the
 * document. An example would be a resident physician who sees a patient
 * and dictates a note, then later signs it. A clinical document can have
 * zero to many authenticators. While electronic signatures are not
 * captured in a CDA document, both authentication and legal
 * authentication require that a document has been signed manually or
 * electronically by the responsible individual. An authenticator has a
 * required authenticator.time indicating the time of authentication, and
 * a required authenticator.signatureCode, indicating that a signature
 * has been obtained and is on file.
 */
export interface CdaAuthenticator {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaAuthenticatorTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  time: CdaTS;

  signatureCode: CdaCS;

  /**
   * A textual or multimedia depiction of the signature by which the
   * participant endorses his or her participation in the Act as specified
   * in the Participation.typeCode and that he or she agrees to assume the
   * associated accountability.
   */
  'sdtc:signatureText'?: CdaED | string;

  assignedEntity: CdaAssignedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaAuthenticatorTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Represents the humans and/or machines that authored the document. In
 * some cases, the role or function of the author is inherent in the
 * ClinicalDocument.code, such as where ClinicalDocument.code is &quot;Medical
 * Student Progress Note&quot;. The role of the author can also be recorded in
 * the Author.functionCode or AssignedAuthor.code attribute. If either of
 * these attributes is included, they should be equivalent to or further
 * specialize the role inherent in the ClinicalDocument.code (such as
 * where the ClinicalDocument.code is simply &quot;Physician Progress Note&quot;
 * and the value of Author.functionCode is &quot;rounding physician&quot;), and
 * shall not conflict with the role inherent in the
 * ClinicalDocument.code, as such a conflict would constitute an
 * ambiguous situation.
 */
export interface CdaAuthor {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaAuthorTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextControlCode'?: string;

  functionCode?: CdaCE;

  time: CdaTS;

  assignedAuthor: CdaAssignedAuthor;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaAuthorTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * AuthoringDevice (CDA Class)
 */
export interface CdaAuthoringDevice {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaAuthoringDeviceTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  code?: CdaCE;

  manufacturerModelName?: CdaSC | string;

  softwareName?: CdaSC | string;

  asMaintainedEntity?: CdaMaintainedEntity[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaAuthoringDeviceTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Authorization (CDA Class)
 */
export interface CdaAuthorization {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaAuthorizationTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  consent: CdaConsent;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaAuthorizationTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A Patient's birthplace is represented as a relationship between a
 * patient and a place. The Birthplace class is played by a place (Place
 * class), and scoped by the patient (Patient class).
 */
export interface CdaBirthplace {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaBirthplaceTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  place: CdaPlace;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaBirthplaceTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The Boolean type stands for the values of two-valued logic. A Boolean
 * value can be either true or false, or, as any other value may be NULL.
 */
export interface CdaBL {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The Boolean type stands for the values of two-valued logic. A Boolean
   * value can be either true or false, or, as any other value may be NULL.
   */
  '@_value'?: string;
}

/**
 * A concept descriptor represents any kind of concept usually by giving
 * a code defined in a code system. A concept descriptor can contain the
 * original text or phrase that served as the basis of the coding and one
 * or more translations into different coding systems. A concept
 * descriptor can also contain qualifiers to describe, e.g., the concept
 * of a &quot;left foot&quot; as a postcoordinated term built from the primary code
 * &quot;FOOT&quot; and the qualifier &quot;LEFT&quot;. In cases of an exceptional value, the
 * concept descriptor need not contain a code but only the original text
 * describing that concept.
 */
export interface CdaCD {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The plain code symbol defined by the code system. For example, &quot;784.0&quot;
   * is the code symbol of the ICD-9 code &quot;784.0&quot; for headache.
   */
  '@_code'?: string;

  /**
   * Specifies the code system that defines the code.
   */
  '@_codeSystem'?: string;

  /**
   * The common name of the coding system.
   */
  '@_codeSystemName'?: string;

  /**
   * If applicable, a version descriptor defined specifically for the given
   * code system.
   */
  '@_codeSystemVersion'?: string;

  /**
   * A name or title for the code, under which the sending system shows the
   * code value to its users.
   */
  '@_displayName'?: string;

  /**
   * The valueSet extension adds an attribute for elements with a CD
   * dataType which indicates the particular value set constraining the
   * coded concept.
   */
  '@_sdtc:valueSet'?: string;

  /**
   * The valueSetVersion extension adds an attribute for elements with a CD
   * dataType which indicates the version of the particular value set
   * constraining the coded concept.
   */
  '@_sdtc:valueSetVersion'?: string;

  /**
   * The text or phrase used as the basis for the coding.
   */
  originalText?: CdaED | string;

  /**
   * Specifies additional codes that increase the specificity of the the
   * primary code.
   */
  qualifier?: CdaCR[];

  /**
   * A set of other concept descriptors that translate this concept
   * descriptor into other code systems.
   */
  translation?: CdaCD[];
}

/**
 * Coded data that consists of a coded value (CV) and, optionally, coded
 * value(s) from other coding systems that identify the same concept.
 * Used when alternative codes may exist.
 */
export interface CdaCE {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The plain code symbol defined by the code system. For example, &quot;784.0&quot;
   * is the code symbol of the ICD-9 code &quot;784.0&quot; for headache.
   */
  '@_code'?: string;

  /**
   * Specifies the code system that defines the code.
   */
  '@_codeSystem'?: string;

  /**
   * The common name of the coding system.
   */
  '@_codeSystemName'?: string;

  /**
   * If applicable, a version descriptor defined specifically for the given
   * code system.
   */
  '@_codeSystemVersion'?: string;

  /**
   * A name or title for the code, under which the sending system shows the
   * code value to its users.
   */
  '@_displayName'?: string;

  /**
   * The valueSet extension adds an attribute for elements with a CD
   * dataType which indicates the particular value set constraining the
   * coded concept.
   */
  '@_sdtc:valueSet'?: string;

  /**
   * The valueSetVersion extension adds an attribute for elements with a CD
   * dataType which indicates the version of the particular value set
   * constraining the coded concept.
   */
  '@_sdtc:valueSetVersion'?: string;

  /**
   * The text or phrase used as the basis for the coding.
   */
  originalText?: CdaED | string;

  /**
   * A set of other concept descriptors that translate this concept
   * descriptor into other code systems.
   */
  translation?: CdaCD[];
}

/**
 * This is a generated StructureDefinition that describes CDA - that is,
 * CDA as it actually is for R2. The intent of this StructureDefinition
 * is to enable CDA to be a FHIR resource. That enables the FHIR
 * infrastructure - API, conformance, query - to be used directly against
 * CDA
 */
export interface CdaClinicalDocument {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  '@_classCode'?: string;

  '@_moodCode'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * ClinicalDocument.typeId is a technology-neutral explicit reference to
   * this CDA, Release Two specification, and must be valued as follows:
   * ClinicalDocument.typeId.root = &quot;2.16.840.1.113883.1.3&quot; (which is the
   * OID for HL7 Registered models); ClinicalDocument.typeId.extension =
   * &quot;POCD_HD000040&quot; (which is the unique identifier for the CDA, Release
   * Two Hierarchical Description).
   */
  typeId?: CdaClinicalDocumentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  id: CdaII;

  code: CdaCE;

  title?: CdaST | string;

  /**
   * The statusCode extension attribute allows the implementer to identify
   * a ClinicalDocument that is in other than the completed state. It was
   * created to support the Structured Form Definition IG to identify that
   * the document itself is an unfinished product currently being completed
   * for a patient.
   */
  'sdtc:statusCode'?: CdaCS;

  effectiveTime: CdaTS;

  confidentialityCode: CdaCE;

  languageCode?: CdaCS;

  setId?: CdaII;

  versionNumber?: CdaINT;

  copyTime?: CdaTS;

  recordTarget: CdaRecordTarget[];

  author: CdaAuthor[];

  dataEnterer?: CdaDataEnterer;

  informant?: CdaInformant[];

  custodian: CdaCustodian;

  informationRecipient?: CdaInformationRecipient[];

  legalAuthenticator?: CdaLegalAuthenticator;

  authenticator?: CdaAuthenticator[];

  participant?: CdaParticipant1[];

  inFulfillmentOf?: CdaInFulfillmentOf[];

  documentationOf?: CdaDocumentationOf[];

  relatedDocument?: CdaRelatedDocument[];

  authorization?: CdaAuthorization[];

  componentOf?: CdaComponentOf;

  component: CdaComponent;
}

/**
 * ClinicalDocument.typeId is a technology-neutral explicit reference to
 * this CDA, Release Two specification, and must be valued as follows:
 * ClinicalDocument.typeId.root = &quot;2.16.840.1.113883.1.3&quot; (which is the
 * OID for HL7 Registered models); ClinicalDocument.typeId.extension =
 * &quot;POCD_HD000040&quot; (which is the unique identifier for the CDA, Release
 * Two Hierarchical Description).
 */
export interface CdaClinicalDocumentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Coded data, where the coding system from which the code comes is
 * ordered
 */
export interface CdaCO {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The plain code symbol defined by the code system. For example, &quot;784.0&quot;
   * is the code symbol of the ICD-9 code &quot;784.0&quot; for headache.
   */
  '@_code'?: string;

  /**
   * Specifies the code system that defines the code.
   */
  '@_codeSystem'?: string;

  /**
   * The common name of the coding system.
   */
  '@_codeSystemName'?: string;

  /**
   * If applicable, a version descriptor defined specifically for the given
   * code system.
   */
  '@_codeSystemVersion'?: string;

  /**
   * A name or title for the code, under which the sending system shows the
   * code value to its users.
   */
  '@_displayName'?: string;

  /**
   * The valueSet extension adds an attribute for elements with a CD
   * dataType which indicates the particular value set constraining the
   * coded concept.
   */
  '@_sdtc:valueSet'?: string;

  /**
   * The valueSetVersion extension adds an attribute for elements with a CD
   * dataType which indicates the version of the particular value set
   * constraining the coded concept.
   */
  '@_sdtc:valueSetVersion'?: string;

  /**
   * The text or phrase used as the basis for the coding.
   */
  originalText?: CdaED | string;
}

/**
 * Component (CDA Class)
 */
export interface CdaComponent {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaComponentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextConductionInd'?: string;

  nonXMLBody?: CdaNonXMLBody;

  structuredBody?: CdaStructuredBody;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaComponentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * ComponentOf (CDA Class)
 */
export interface CdaComponentOf {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaComponentOfTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  encompassingEncounter: CdaEncompassingEncounter;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaComponentOfTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * This class references the consents associated with this document. The
 * type of consent (e.g. a consent to perform the related ServiceEvent, a
 * consent for the information contained in the document to be released
 * to a third party) is conveyed in Consent.code. Consents referenced in
 * the CDA Header have been finalized (Consent.statusCode must equal
 * &quot;completed&quot;) and should be on file.
 */
export interface CdaConsent {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaConsentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id?: CdaII[];

  code?: CdaCE;

  statusCode: CdaConsentStatusCode;
}

export interface CdaConsentStatusCode {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The plain code symbol defined by the code system. For example, &quot;784.0&quot;
   * is the code symbol of the ICD-9 code &quot;784.0&quot; for headache.
   */
  '@_code': string;

  /**
   * The valueSet extension adds an attribute for elements with a CD
   * dataType which indicates the particular value set constraining the
   * coded concept.
   */
  '@_sdtc:valueSet'?: string;

  /**
   * The valueSetVersion extension adds an attribute for elements with a CD
   * dataType which indicates the version of the particular value set
   * constraining the coded concept.
   */
  '@_sdtc:valueSetVersion'?: string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaConsentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A concept qualifier code with optionally named role. Both qualifier
 * role and value codes must be defined by the coding system of the CD
 * containing the concept qualifier. For example, if SNOMED RT defines a
 * concept &quot;leg&quot;, a role relation &quot;has-laterality&quot;, and another concept
 * &quot;left&quot;, the concept role relation allows to add the qualifier
 * &quot;has-laterality: left&quot; to a primary code &quot;leg&quot; to construct the
 * meaning &quot;left leg&quot;.
 */
export interface CdaCR {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Indicates if the sense of the role name is inverted. This can be used
   * in cases where the underlying code system defines inversion but does
   * not provide reciprocal pairs of role names. By default, inverted is
   * false.
   */
  '@_inverted'?: string;

  /**
   * Specifies the manner in which the concept role value contributes to
   * the meaning of a code phrase. For example, if SNOMED RT defines a
   * concept &quot;leg&quot;, a role relation &quot;has-laterality&quot;, and another concept
   * &quot;left&quot;, the concept role relation allows to add the qualifier
   * &quot;has-laterality: left&quot; to a primary code &quot;leg&quot; to construct the
   * meaning &quot;left leg&quot;. In this example &quot;has-laterality&quot; is the CR.name.
   */
  name?: CdaCV;

  /**
   * The concept that modifies the primary code of a code phrase through
   * the role relation. For example, if SNOMED RT defines a concept &quot;leg&quot;,
   * a role relation &quot;has-laterality&quot;, and another concept &quot;left&quot;, the
   * concept role relation allows adding the qualifier &quot;has-laterality:
   * left&quot; to a primary code &quot;leg&quot; to construct the meaning &quot;left leg&quot;. In
   * this example &quot;left&quot; is the CR.value.
   */
  value?: CdaCD;
}

/**
 * Criterion (CDA Class)
 */
export interface CdaCriterion {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaCriterionTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  code?: CdaCD;

  text?: CdaED | string;

  value?:
    | CdaBL
    | CdaED
    | string
    | CdaST
    | CdaCD
    | CdaCV
    | CdaCE
    | CdaSC
    | CdaII
    | CdaTEL
    | CdaAD
    | CdaTN
    | CdaINT
    | CdaREAL
    | CdaPQ
    | CdaMO
    | CdaTS
    | CdaIVL_PQ
    | CdaIVL_TS
    | CdaPIVL_TS
    | CdaEIVL_TS
    | CdaSXPR_TS;
}

export type CdaCriterionValue =
  | CdaBL
  | CdaED
  | string
  | CdaST
  | CdaCD
  | CdaCV
  | CdaCE
  | CdaSC
  | CdaII
  | CdaTEL
  | CdaAD
  | CdaTN
  | CdaINT
  | CdaREAL
  | CdaPQ
  | CdaMO
  | CdaTS
  | CdaIVL_PQ
  | CdaIVL_TS
  | CdaPIVL_TS
  | CdaEIVL_TS
  | CdaSXPR_TS;

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaCriterionTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Coded data in its simplest form, where only the code is not
 * predetermined. The code system and code system version are fixed by
 * the context in which the CS value occurs. CS is used for coded
 * attributes that have a single HL7-defined value set.
 */
export interface CdaCS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The plain code symbol defined by the code system. For example, &quot;784.0&quot;
   * is the code symbol of the ICD-9 code &quot;784.0&quot; for headache.
   */
  '@_code'?: string;

  /**
   * The valueSet extension adds an attribute for elements with a CD
   * dataType which indicates the particular value set constraining the
   * coded concept.
   */
  '@_sdtc:valueSet'?: string;

  /**
   * The valueSetVersion extension adds an attribute for elements with a CD
   * dataType which indicates the version of the particular value set
   * constraining the coded concept.
   */
  '@_sdtc:valueSetVersion'?: string;
}

/**
 * Represents the organization that is in charge of maintaining the
 * document. The custodian is the steward that is entrusted with the care
 * of the document. Every CDA document has exactly one custodian.The
 * custodian participation satisfies the CDA definition of Stewardship
 * (see What is the CDA (§ 1.1 )). Because CDA is an exchange standard
 * and may not represent the original form of the authenticated document,
 * the custodian represents the steward of the original source document.
 */
export interface CdaCustodian {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaCustodianTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  assignedCustodian: CdaAssignedCustodian;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaCustodianTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The steward organization (CustodianOrganization class) is an entity
 * scoping the role of AssignedCustodian, and has a required
 * CustodianOrganization.id.
 */
export interface CdaCustodianOrganization {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaCustodianOrganizationTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  id: CdaII[];

  name?: CdaON | string;

  telecom?: CdaTEL;

  'sdtc:telecom'?: CdaTEL[];

  addr?: CdaAD | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaCustodianOrganizationTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Coded data, specifying only a code, code system, and optionally
 * display name and original text. Used only as the data type for other
 * data types' properties.
 */
export interface CdaCV {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The plain code symbol defined by the code system. For example, &quot;784.0&quot;
   * is the code symbol of the ICD-9 code &quot;784.0&quot; for headache.
   */
  '@_code'?: string;

  /**
   * Specifies the code system that defines the code.
   */
  '@_codeSystem'?: string;

  /**
   * The common name of the coding system.
   */
  '@_codeSystemName'?: string;

  /**
   * If applicable, a version descriptor defined specifically for the given
   * code system.
   */
  '@_codeSystemVersion'?: string;

  /**
   * A name or title for the code, under which the sending system shows the
   * code value to its users.
   */
  '@_displayName'?: string;

  /**
   * The valueSet extension adds an attribute for elements with a CD
   * dataType which indicates the particular value set constraining the
   * coded concept.
   */
  '@_sdtc:valueSet'?: string;

  /**
   * The valueSetVersion extension adds an attribute for elements with a CD
   * dataType which indicates the version of the particular value set
   * constraining the coded concept.
   */
  '@_sdtc:valueSetVersion'?: string;

  /**
   * The text or phrase used as the basis for the coding.
   */
  originalText?: CdaED | string;
}

/**
 * Represents the participant who has transformed a dictated note into
 * text.
 */
export interface CdaDataEnterer {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaDataEntererTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextControlCode'?: string;

  time?: CdaTS;

  assignedEntity: CdaAssignedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaDataEntererTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A ManufacturedMaterial used in an activity without being substantially
 * changed through that activity.
 *
 * This includes durable (reusable) medical equipment as well as
 * disposable equipment. The kind of device is identified by the code
 * attribute inherited from Entity.
 */
export interface CdaDevice {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaDeviceTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  code?: CdaCE;

  manufacturerModelName?: CdaSC | string;

  softwareName?: CdaSC | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaDeviceTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * TODO
 */
export interface CdaDocumentationOf {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaDocumentationOfTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  serviceEvent: CdaServiceEvent;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaDocumentationOfTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Data that is primarily intended for human interpretation or for
 * further machine processing outside the scope of HL7. This includes
 * unformatted or formatted written language, multimedia data, or
 * structured information in as defined by a different standard (e.g.,
 * XML-signatures.) Instead of the data itself, an may contain only a
 * reference (see .) Note that the data type is a specialization of the
 * data type when the media type is text/plain.
 */
export interface CdaED {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Indicates whether the raw byte data is compressed, and what
   * compression algorithm was used.
   */
  '@_compression'?: string;

  /**
   * The integrity check is a short binary value representing a
   * cryptographically strong checksum that is calculated over the binary
   * data. The purpose of this property, when communicated with a reference
   * is for anyone to validate later whether the reference still resolved
   * to the same data that the reference resolved to when the encapsulated
   * data value with reference was created.
   */
  '@_integrityCheck'?: string;

  /**
   * Specifies the algorithm used to compute the integrityCheck value. The
   * cryptographically strong checksum algorithm Secure Hash Algorithm-1
   * (SHA-1) is currently the industry standard. It has superseded the MD5
   * algorithm only a couple of years ago, when certain flaws in the
   * security of MD5 were discovered. Currently the SHA-1 hash algorithm is
   * the default choice for the integrity check algorithm. Note that
   * SHA-256 is also entering widespread usage.
   */
  '@_integrityCheckAlgorithm'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  '@_representation'?: string;

  /**
   * Data that is primarily intended for human interpretation or for
   * further machine processing is outside the scope of HL7. This includes
   * unformatted or formatted written language, multimedia data, or
   * structured information as defined by a different standard (e.g.,
   * XML-signatures.)
   */
  '#text'?: string;

  /**
   * A telecommunication address (TEL), such as a URL for HTTP or FTP,
   * which will resolve to precisely the same binary data that could as
   * well have been provided as inline data.
   */
  reference?: CdaTEL;

  /**
   * An abbreviated rendition of the full data. A thumbnail requires
   * significantly fewer resources than the full data, while still
   * maintaining some distinctive similarity with the full data. A
   * thumbnail is typically used with by-reference encapsulated data. It
   * allows a user to select data more efficiently before actually
   * downloading through the reference.
   */
  thumbnail?: CdaED | string;
}

/**
 * Specifies a periodic interval of time where the recurrence is based on
 * activities of daily living or other important events that are
 * time-related but not fully determined by time.
 */
export interface CdaEIVL_TS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A code specifying whether the set component is included (union) or
   * excluded (set-difference) from the set, or other set operations with
   * the current set component and the set as constructed from the
   * representation stream up to the current point.
   */
  '@_operator'?: string;

  /**
   * A code for a common (periodical) activity of daily living based on
   * which the event related periodic interval is specified.
   */
  event?: CdaCE;

  /**
   * An interval of elapsed time (duration, not absolute point in time)
   * that marks the offsets for the beginning, width and end of the
   * event-related periodic interval measured from the time each such event
   * actually occurred.
   */
  offset?: CdaIVL_PQ;
}

/**
 * A name for a person, organization, place or thing. A sequence of name
 * parts, such as given name or family name, prefix, suffix, etc.
 * Examples for entity name values are &quot;Jim Bob Walton, Jr.&quot;, &quot;Health
 * Level Seven, Inc.&quot;, &quot;Lake Tahoe&quot;, etc. An entity name may be as simple
 * as a character string or may consist of several entity name parts,
 * such as, &quot;Jim&quot;, &quot;Bob&quot;, &quot;Walton&quot;, and &quot;Jr.&quot;, &quot;Health Level Seven&quot; and
 * &quot;Inc.&quot;, &quot;Lake&quot; and &quot;Tahoe&quot;.
 */
export interface CdaEN {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A set of codes advising a system or user which name in a set of like
   * names to select for a given purpose. A name without specific use code
   * might be a default name useful for any purpose, but a name with a
   * specific use code would be preferred for that respective purpose
   */
  '@_use'?: string;

  delimiter?: (CdaENXP | string)[];

  family?: (CdaENXP | string)[];

  given?: (CdaENXP | string)[];

  prefix?: (CdaENXP | string)[];

  suffix?: (CdaENXP | string)[];

  '#text'?: string[];

  /**
   * An interval of time specifying the time during which the name is or
   * was used for the entity. This accomodates the fact that people change
   * names for people, places and things.
   */
  validTime?: CdaIVL_TS;
}

/**
 * This optional class represents the setting of the clinical encounter
 * during which the documented act(s) or ServiceEvent occurred. Documents
 * are not necessarily generated during an encounter, such as when a
 * clinician, in response to an abnormal lab result, attempts to contact
 * the patient but can't, and writes a Progress Note.
 *
 * In some cases, the setting of the encounter is inherent in the
 * ClinicalDocument.code, such as where ClinicalDocument.code is
 * &quot;Diabetes Clinic Progress Note&quot;. The setting of an encounter can also
 * be transmitted in the HealthCareFacility.code attribute. If
 * HealthCareFacility.code is sent, it should be equivalent to or further
 * specialize the value inherent in the ClinicalDocument.code (such as
 * where the ClinicalDocument.code is simply &quot;Clinic Progress Note&quot; and
 * the value of HealthCareFacility.code is &quot;cardiology clinic&quot;), and
 * shall not conflict with the value inherent in the
 * ClinicalDocument.code, as such a conflict would constitute an
 * ambiguous situation.
 *
 * EncompassingEncounter.dischargeDispositionCode can be used to depict
 * the disposition of the patient at the time of hospital discharge
 * (e.g., discharged to home, expired, against medical advice, etc.).
 */
export interface CdaEncompassingEncounter {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaEncompassingEncounterTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id?: CdaII[];

  code?: CdaCE;

  effectiveTime: CdaIVL_TS;

  /**
   * This element is a coded concept that represents the type of referral.
   * Its RIM source class is PatientEncounter.
   */
  'sdtc:admissionReferralSourceCode'?: CdaCE;

  dischargeDispositionCode?: CdaCE;

  /**
   * The responsibleParty participant represents the participant having
   * primary legal responsibility for the encounter. This differs from the
   * legalAuthenticator participant in that the legalAuthenticator may or
   * may not be the responsible party, and is serving a medical records
   * function by signing off on the document, moving it into a completed
   * state.
   */
  responsibleParty?: CdaEncompassingEncounterResponsibleParty;

  encounterParticipant?: CdaEncounterParticipant[];

  /**
   * The location participant (location class) relates a healthcare
   * facility (HealthCareFacility class) to the encounter to indicate where
   * the encounter took place. The entity playing the role of
   * HealthCareFacility is a place (Place class). The entity scoping the
   * HealthCareFacility role is an organization (Organization class).
   *
   * The setting of an encounter (e.g. cardiology clinic, primary care
   * clinic, rehabilitation hospital, skilled nursing facility) can be
   * expressed in HealthCareFacility.code. Note that setting and physical
   * location are not the same. There is a many-to-many relationship
   * between setting and the physical location where care is delivered.
   * Thus, a particular room can provide the location for cardiology clinic
   * one day, and for primary care clinic another day; and cardiology
   * clinic today might be held in one physical location, but in another
   * physical location tomorrow.
   *
   * When the location is an organization, this is indicated by the
   * presence of a scoping Organization, without a playing Place.
   */
  location?: CdaEncompassingEncounterLocation;
}

/**
 * The location participant (location class) relates a healthcare
 * facility (HealthCareFacility class) to the encounter to indicate where
 * the encounter took place. The entity playing the role of
 * HealthCareFacility is a place (Place class). The entity scoping the
 * HealthCareFacility role is an organization (Organization class).
 *
 * The setting of an encounter (e.g. cardiology clinic, primary care
 * clinic, rehabilitation hospital, skilled nursing facility) can be
 * expressed in HealthCareFacility.code. Note that setting and physical
 * location are not the same. There is a many-to-many relationship
 * between setting and the physical location where care is delivered.
 * Thus, a particular room can provide the location for cardiology clinic
 * one day, and for primary care clinic another day; and cardiology
 * clinic today might be held in one physical location, but in another
 * physical location tomorrow.
 *
 * When the location is an organization, this is indicated by the
 * presence of a scoping Organization, without a playing Place.
 */
export interface CdaEncompassingEncounterLocation {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaEncompassingEncounterLocationTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  healthCareFacility: CdaHealthCareFacility;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaEncompassingEncounterLocationTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The responsibleParty participant represents the participant having
 * primary legal responsibility for the encounter. This differs from the
 * legalAuthenticator participant in that the legalAuthenticator may or
 * may not be the responsible party, and is serving a medical records
 * function by signing off on the document, moving it into a completed
 * state.
 */
export interface CdaEncompassingEncounterResponsibleParty {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaEncompassingEncounterResponsiblePartyTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  assignedEntity: CdaAssignedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaEncompassingEncounterResponsiblePartyTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaEncompassingEncounterTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A derivative of the RIM PatientEncounter class, used to represent
 * related encounters, such as follow-up visits or referenced past
 * encounters.
 *
 * NOTE: The EncompassingEncounter class in the CDA Header (see Header
 * Relationships (§ 4.2.3 )) represents the setting of the clinical
 * encounter during which the documented act occurred. The Encounter
 * class in the CDA Body is used to represent other related encounters.
 */
export interface CdaEncounter {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaEncounterTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  id?: CdaII[];

  code?: CdaCD;

  text?: CdaED | string;

  statusCode?: CdaCS;

  effectiveTime?: CdaIVL_TS;

  'sdtc:dischargeDispositionCode'?: CdaCE;

  priorityCode?: CdaCE;

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  entryRelationship?: CdaEntryRelationship[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:precondition2'?: CdaPrecondition2[];

  'sdtc:inFulfillmentOf1'?: CdaInFulfillmentOf1[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaEncounterTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * TODO
 */
export interface CdaEncounterParticipant {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaEncounterParticipantTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode': string;

  time?: CdaIVL_TS;

  assignedEntity?: CdaAssignedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaEncounterParticipantTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A physical thing, group of physical things or an organization capable
 * of participating in Acts while in a role.
 *
 * An entity is a physical object that has, had or will have existence.
 * The only exception to this is Organization, which while not having a
 * physical presence, fulfills the other characteristics of an Entity.
 * Entity stipulates the thing itself, not the Roles it may play: the
 * Role of Patient, e.g., is played by the Person Entity.
 *
 * Living subjects (including human beings), organizations, materials,
 * places and their specializations.
 */
export interface CdaEntity {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaEntityTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  id?: CdaII[];

  code?: CdaCE;

  desc?: CdaED | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaEntityTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * CDA entries represent the structured computer-processable components
 * within a document section. Each section can contain zero to many
 * entries.
 */
export interface CdaEntry {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaEntryTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextConductionInd'?: string;

  act?: CdaAct;

  encounter?: CdaEncounter;

  observation?: CdaObservation;

  observationMedia?: CdaObservationMedia;

  organizer?: CdaOrganizer;

  procedure?: CdaProcedure;

  regionOfInterest?: CdaRegionOfInterest;

  substanceAdministration?: CdaSubstanceAdministration;

  supply?: CdaSupply;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaEntryTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * CDA entries represent the structured computer-processable components
 * within a document section. Each section can contain zero to many
 * entries.
 */
export interface CdaEntryRelationship {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaEntryRelationshipTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode': string;

  /**
   * The entryRelationship.inversionInd can be set to &quot;true&quot; to indicate
   * that the relationship should be interpreted as if the roles of the
   * source and target entries were reversed.
   */
  '@_inversionInd'?: string;

  /**
   * The entryRelationship.contextConductionInd differs from the otherwise
   * common use of this attribute in that in all other cases where this
   * attribute is used, the value is fixed at &quot;true&quot;, whereas here the
   * value is defaulted to &quot;true&quot;, and can be changed to &quot;false&quot; when
   * referencing an entry in the same document. Setting the context
   * conduction to false when referencing an entry in the same document
   * keeps clear the fact that the referenced object retains its original
   * context.
   */
  '@_contextConductionInd'?: string;

  '@_negationInd'?: string;

  sequenceNumber?: CdaINT;

  seperatableInd?: CdaBL;

  act?: CdaAct;

  encounter?: CdaEncounter;

  observation?: CdaObservation;

  observationMedia?: CdaObservationMedia;

  organizer?: CdaOrganizer;

  procedure?: CdaProcedure;

  regionOfInterest?: CdaRegionOfInterest;

  substanceAdministration?: CdaSubstanceAdministration;

  supply?: CdaSupply;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaEntryRelationshipTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A character string token representing a part of a name. May have a
 * type code signifying the role of the part in the whole entity name,
 * and a qualifier code for more detail about the name part type. Typical
 * name parts for person names are given names, and family names, titles,
 * etc.
 */
export interface CdaENXP {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  /**
   * Indicates whether the name part is a given name, family name, prefix,
   * suffix, etc.
   */
  '@_partType'?: string;

  /**
   * qualifier is a set of codes each of which specifies a certain
   * subcategory of the name part in addition to the main name part type.
   * For example, a given name may be flagged as a nickname, a family name
   * may be a pseudonym or a name of public records.
   */
  '@_qualifier'?: string;
}

/**
 * ExternalAct is a derivative of the RIM Act class, to be used when the
 * other more specific classes are not appropriate.
 */
export interface CdaExternalAct {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaExternalActTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id?: CdaII[];

  code?: CdaCD;

  text?: CdaED | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaExternalActTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * ExternalDocument is a derivative of the RIM Document class, used for
 * representing external documents. ExternalDocument.text is modeled as
 * an ED data type - allowing for the expression of the MIME type of the
 * external document.
 */
export interface CdaExternalDocument {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaExternalDocumentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id?: CdaII[];

  code?: CdaCD;

  text?: CdaED | string;

  setId?: CdaII;

  versionNumber?: CdaINT;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaExternalDocumentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * ExternalObservation is a derivative of the RIM Observation class, used
 * for representing external coded and other observations.
 */
export interface CdaExternalObservation {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaExternalObservationTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id?: CdaII[];

  code?: CdaCD;

  text?: CdaED | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaExternalObservationTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * ExternalProcedure is a derivative of the RIM Procedure class, used for
 * representing external procedures.
 */
export interface CdaExternalProcedure {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaExternalProcedureTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id?: CdaII[];

  code?: CdaCD;

  text?: CdaED | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaExternalProcedureTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A patient's guardian is a person or organization in the role of
 * guardian (Guardian class). The entity playing the role of guardian is
 * a person (Person class) or organization (Organization class). The
 * entity scoping the role is the patient (Patient class).
 *
 * Where a guardian is not explicitly stated, the value should default to
 * local business practice (e.g. the patient makes their own health care
 * decisions unless incapacitated in which case healthcare decisions are
 * made by the patient's spouse).
 */
export interface CdaGuardian {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaGuardianTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id?: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  code?: CdaCE;

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  guardianPerson?: CdaPerson;

  guardianOrganization?: CdaOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaGuardianTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * HealthCareFacility (CDA Class)
 */
export interface CdaHealthCareFacility {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaHealthCareFacilityTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id?: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  code?: CdaCE;

  location?: CdaPlace;

  serviceProviderOrganization?: CdaOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaHealthCareFacilityTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The alternateIdentification extension provides additional information
 * about an identifier found in the linked role. The extensions augment
 * the id information in the linked role.  The id in the
 * alternateIdentification extension SHALL match an id in the linked
 * role. The alternateIdentification provides additional information
 * about a particular identifier, such as its type. As an extension it
 * needs to be safe for implementers to ignore this additional
 * information.
 */
export interface CdaIdentifiedBy {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  '@_typeCode': string;

  'sdtc:alternateIdentification': CdaAlternateIdentification;
}

/**
 * An identifier that uniquely identifies a thing or object. Examples are
 * object identifier for HL7 RIM objects, medical record number, order
 * id, service catalog item id, Vehicle Identification Number (VIN), etc.
 * Instance identifiers are defined based on ISO object identifiers.
 */
export interface CdaII {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * A unique identifier that guarantees the global uniqueness of the
   * instance identifier. The root alone may be the entire instance
   * identifier.
   */
  '@_root'?: string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension'?: string;
}

/**
 * An informant (or source of information) is a person that provides
 * relevant information, such as the parent of a comatose patient who
 * describes the patient's behavior prior to the onset of coma.
 */
export interface CdaInformant {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaInformantTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextControlCode'?: string;

  assignedEntity?: CdaAssignedEntity;

  relatedEntity?: CdaRelatedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaInformantTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Represents the participant who has transformed a dictated note into
 * text.
 */
export interface CdaInformationRecipient {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaInformationRecipientTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  intendedRecipient: CdaIntendedRecipient;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaInformationRecipientTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Defines the base elements and attributes on all CDA elements (other
 * than data types)
 */
export interface CdaInfrastructureRoot {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaInfrastructureRootTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaInfrastructureRootTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * This class represents those orders that are fulfilled by this
 * document. For instance, a provider orders an X-Ray. The X-Ray is
 * performed. A radiologist reads the X-Ray and generates a report. The
 * X-Ray order identifier is transmitted in the Order class, the
 * performed X-Ray procedure is transmitted in the ServiceEvent class,
 * and the ClinicalDocument.code would be valued with &quot;Diagnostic Imaging
 * Report&quot;.
 */
export interface CdaInFulfillmentOf {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaInFulfillmentOfTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  order: CdaOrder;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaInFulfillmentOfTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * This is an actRelationship called inFulfillmentOf1 that represents the
 * Fulfills General Relationship Operator in QDM 4.1.x in QDM-Base QRDA
 * Category 1, R3.
 */
export interface CdaInFulfillmentOf1 {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaInFulfillmentOf1TypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode': string;

  /**
   * Can be set to &quot;true&quot; to indicate that the relationship should be
   * interpreted as if the roles of the source and target entries were
   * reversed.
   */
  '@_inversionInd'?: string;

  '@_negationInd'?: string;

  'sdtc:actReference': CdaInFulfillmentOf1ActReference;
}

export interface CdaInFulfillmentOf1ActReference {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaInFulfillmentOf1ActReferenceTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  '@_determinerCode'?: string;

  'sdtc:id'?: CdaII[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaInFulfillmentOf1ActReferenceTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaInFulfillmentOf1TypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Integer numbers (-1,0,1,2, 100, 3398129, etc.) are precise numbers
 * that are results of counting and enumerating. Integer numbers are
 * discrete, the set of integers is infinite but countable. No arbitrary
 * limit is imposed on the range of integer numbers. Two NULL flavors are
 * defined for the positive and negative infinity.
 */
export interface CdaINT {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  '@_value'?: string;
}

/**
 * Positive integer numbers.
 */
export interface CdaINT_POS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  '@_value'?: string;
}

/**
 * IntendedRecipient (CDA Class)
 */
export interface CdaIntendedRecipient {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaIntendedRecipientTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id?: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  informationRecipient?: CdaPerson;

  receivedOrganization?: CdaOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaIntendedRecipientTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A set of consecutive values of an ordered base data type.
 */
export interface CdaIVL_INT {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  '@_value'?: string;

  /**
   * A code specifying whether the set component is included (union) or
   * excluded (set-difference) from the set, or other set operations with
   * the current set component and the set as constructed from the
   * representation stream up to the current point.
   */
  '@_operator'?: string;

  /**
   * This is the low limit of the interval.
   */
  low?: CdaIVXB_INT;

  /**
   * The arithmetic mean of the interval (low plus high divided by 2). The
   * purpose of distinguishing the center as a semantic property is for
   * conversions of intervals from and to point values.
   */
  center?: CdaINT;

  /**
   * The difference between high and low boundary. The purpose of
   * distinguishing a width property is to handle all cases of incomplete
   * information symmetrically. In any interval representation only two of
   * the three properties high, low, and width need to be stated and the
   * third can be derived.
   */
  width?: CdaINT;

  /**
   * This is the high limit of the interval.
   */
  high?: CdaIVXB_INT;
}

/**
 * A set of consecutive values of an ordered base data type.
 */
export interface CdaIVL_PQ {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The unit of measure specified in the Unified Code for Units of Measure
   * (UCUM) [].
   */
  '@_unit'?: string;

  /**
   * The magnitude of the quantity measured in terms of the unit.
   */
  '@_value'?: string;

  /**
   * An alternative representation of the same physical quantity expressed
   * in a different unit, of a different unit code system and possibly with
   * a different value.
   */
  translation?: CdaPQR[];

  /**
   * A code specifying whether the set component is included (union) or
   * excluded (set-difference) from the set, or other set operations with
   * the current set component and the set as constructed from the
   * representation stream up to the current point.
   */
  '@_operator'?: string;

  /**
   * This is the low limit of the interval.
   */
  low?: CdaIVXB_PQ;

  /**
   * The arithmetic mean of the interval (low plus high divided by 2). The
   * purpose of distinguishing the center as a semantic property is for
   * conversions of intervals from and to point values.
   */
  center?: CdaPQ;

  /**
   * The difference between high and low boundary. The purpose of
   * distinguishing a width property is to handle all cases of incomplete
   * information symmetrically. In any interval representation only two of
   * the three properties high, low, and width need to be stated and the
   * third can be derived.
   */
  width?: CdaPQ;

  /**
   * This is the high limit of the interval.
   */
  high?: CdaIVXB_PQ;
}

/**
 * A set of consecutive values of an ordered base data type.
 */
export interface CdaIVL_TS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A quantity specifying a point on the axis of natural time. A point in
   * time is most often represented as a calendar expression.
   */
  '@_value'?: string;

  /**
   * A code specifying whether the set component is included (union) or
   * excluded (set-difference) from the set, or other set operations with
   * the current set component and the set as constructed from the
   * representation stream up to the current point.
   */
  '@_operator'?: string;

  /**
   * This is the low limit of the interval.
   */
  low?: CdaIVXB_TS;

  /**
   * The arithmetic mean of the interval (low plus high divided by 2). The
   * purpose of distinguishing the center as a semantic property is for
   * conversions of intervals from and to point values.
   */
  center?: CdaTS;

  /**
   * The difference between high and low boundary. The purpose of
   * distinguishing a width property is to handle all cases of incomplete
   * information symmetrically. In any interval representation only two of
   * the three properties high, low, and width need to be stated and the
   * third can be derived.
   */
  width?: CdaPQ;

  /**
   * This is the high limit of the interval.
   */
  high?: CdaIVXB_TS;
}

/**
 * An integer interval boundary containing an inclusive/exclusive flag.
 */
export interface CdaIVXB_INT {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  '@_value'?: string;

  /**
   * Specifies whether the limit is included in the interval (interval is
   * closed) or excluded from the interval (interval is open).
   */
  '@_inclusive'?: string;
}

/**
 * A physical quantity interval boundary containing an
 * inclusive/exclusive flag.
 */
export interface CdaIVXB_PQ {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The unit of measure specified in the Unified Code for Units of Measure
   * (UCUM) [].
   */
  '@_unit'?: string;

  /**
   * The magnitude of the quantity measured in terms of the unit.
   */
  '@_value'?: string;

  /**
   * An alternative representation of the same physical quantity expressed
   * in a different unit, of a different unit code system and possibly with
   * a different value.
   */
  translation?: CdaPQR[];

  /**
   * Specifies whether the limit is included in the interval (interval is
   * closed) or excluded from the interval (interval is open).
   */
  '@_inclusive'?: string;
}

/**
 * A timestamp interval boundary containing an inclusive/exclusive flag.
 */
export interface CdaIVXB_TS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A quantity specifying a point on the axis of natural time. A point in
   * time is most often represented as a calendar expression.
   */
  '@_value'?: string;

  /**
   * Specifies whether the limit is included in the interval (interval is
   * closed) or excluded from the interval (interval is open).
   */
  '@_inclusive'?: string;
}

/**
 * The LabeledDrug class, which is an Entity class playing the Role of
 * Manufactured Product, identifies the drug that is consumed in the
 * substance administration. The medication is identified by means of the
 * LabeledDrug.code or the LabeledDrug.name.
 */
export interface CdaLabeledDrug {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaLabeledDrugTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  code?: CdaCE;

  name?: CdaTN | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaLabeledDrugTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The language communication capabilities of an Entity.
 *
 * While it may seem on the surface that this class would be restricted
 * in usage to only the LivingSubject subtypes, Devices also have the
 * ability to communicate, such as automated telephony devices that
 * transmit patient information to live operators on a triage line or
 * provide automated laboratory results to clinicians.
 *
 * A patient who originally came from Mexico may have fluent language
 * capabilities to speak, read and write in Spanish, and rudimentary
 * capabilities in English. A person from Russia may have the capability
 * to communicate equally well in spoken language in Russian, Armenian or
 * Ukrainian, and a preference to speak in Armenian.
 */
export interface CdaLanguageCommunication {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaLanguageCommunicationTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  languageCode?: CdaCS;

  modeCode?: CdaCE;

  proficiencyLevelCode?: CdaCE;

  preferenceInd?: CdaBL;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaLanguageCommunicationTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Represents a participant who has legally authenticated the document.
 * The CDA is a standard that specifies the structure of exchanged
 * clinical documents. In the case where a local document is transformed
 * into a CDA document for exchange, authentication occurs on the local
 * document, and that fact is reflected in the exchanged CDA document. A
 * CDA document can reflect the unauthenticated, authenticated, or
 * legally authenticated state. The unauthenticated state exists when no
 * authentication information has been recorded (i.e., it is the absence
 * of being either authenticated or legally authenticated). While
 * electronic signatures are not captured in a CDA document, both
 * authentication and legal authentication require that a document has
 * been signed manually or electronically by the responsible individual.
 * A legalAuthenticator has a required legalAuthenticator.time indicating
 * the time of authentication, and a required
 * legalAuthenticator.signatureCode, indicating that a signature has been
 * obtained and is on file.
 */
export interface CdaLegalAuthenticator {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaLegalAuthenticatorTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextControlCode'?: string;

  time: CdaTS;

  signatureCode: CdaCS;

  /**
   * A textual or multimedia depiction of the signature by which the
   * participant endorses his or her participation in the Act as specified
   * in the Participation.typeCode and that he or she agrees to assume the
   * associated accountability.
   */
  'sdtc:signatureText'?: CdaED | string;

  assignedEntity: CdaAssignedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaLegalAuthenticatorTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The MaintainedEntity class is present for backwards compatibility, and
 * its use is discouraged, except where needed to support the
 * transformation of CDA, Release One documents.
 *
 * NOTE: In CDA, Release One, it was possible to specify those
 * individuals responsible for the device. This functionality has been
 * deprecated in CDA, Release Two.
 */
export interface CdaMaintainedEntity {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaMaintainedEntityTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  effectiveTime?: CdaIVL_TS;

  maintainingPerson: CdaPerson;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaMaintainedEntityTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * ManufacturedProduct (CDA Class)
 */
export interface CdaManufacturedProduct {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaManufacturedProductTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id?: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  manufacturedLabeledDrug?: CdaLabeledDrug;

  manufacturedMaterial?: CdaMaterial;

  manufacturerOrganization?: CdaOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaManufacturedProductTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A subtype of Entity that is inanimate and locationally independent.
 *
 * Materials are entities that are neither Living Subjects nor places.
 * Manufactured or processed products are considered material, even if
 * they originate as living matter. Materials come in a wide variety of
 * physical forms and can pass through different states (ie. Gas, liquid,
 * solid) while still retaining their physical composition and material
 * characteristics.
 *
 * Clarify the meaning of &quot;locationally independent&quot;; suggest removing it
 * and supplanting with first Usage Note sentence.
 *
 * Pharmaceutical substances (including active vaccines containing
 * retarded virus), disposable supplies, durable equipment, implantable
 * devices, food items (including meat or plant products), waste, traded
 * goods.
 */
export interface CdaMaterial {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaMaterialTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  code?: CdaCE;

  name?: CdaTN | string;

  lotNumberText?: CdaST | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaMaterialTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A monetary amount is a quantity expressing the amount of money in some
 * currency. Currencies are the units in which monetary amounts are
 * denominated in different economic regions. While the monetary amount
 * is a single kind of quantity (money) the exchange rates between the
 * different units are variable. This is the principle difference between
 * physical quantity and monetary amounts, and the reason why currency
 * units are not physical units.
 */
export interface CdaMO {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The currency unit as defined in ISO 4217.
   */
  '@_currency'?: string;

  /**
   * The magnitude of the monetary amount in terms of the currency unit.
   */
  '@_value'?: string;
}

/**
 * The NonXMLBody class represents a document body that is in some format
 * other than XML. NonXMLBody.text is used to reference data that is
 * stored externally to the CDA document or to encode the data directly
 * inline.
 *
 * Rendering a referenced non-XML body requires a software tool that
 * recognizes the particular MIME media type of the blob.
 */
export interface CdaNonXMLBody {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaNonXMLBodyTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  text: CdaED | string;

  confidentialityCode?: CdaCE;

  languageCode?: CdaCS;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaNonXMLBodyTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A derivative of the RIM Observation class, used for representing coded
 * and other observations.
 *
 * Observation.negationInd, when set to &quot;true&quot;, is a positive assertion
 * that the Observation as a whole is negated. Some properties such as
 * Observation.id, Observation.moodCode, and the participations are not
 * negated. These properties always have the same meaning: i.e., the
 * author remains the author of the negative Observation. An observation
 * statement with negationInd is still a statement about the specific
 * fact described by the Observation. For instance, a negated &quot;finding of
 * wheezing on July 1&quot; means that the author positively denies that there
 * was wheezing on July 1, and that he takes the same responsibility for
 * such statement and the same requirement to have evidence for such
 * statement than if he had not used negation.
 */
export interface CdaObservation {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaObservationTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  '@_negationInd'?: string;

  id?: CdaII[];

  code: CdaCD;

  derivationExpr?: CdaST | string;

  text?: CdaED | string;

  statusCode?: CdaCS;

  effectiveTime?: CdaIVL_TS;

  priorityCode?: CdaCE;

  repeatNumber?: CdaIVL_INT;

  languageCode?: CdaCS;

  value?: (
    | CdaANY
    | CdaBL
    | CdaED
    | string
    | CdaST
    | CdaCD
    | CdaCV
    | CdaCE
    | CdaCO
    | CdaSC
    | CdaII
    | CdaTEL
    | CdaAD
    | CdaTN
    | CdaINT
    | CdaREAL
    | CdaPQ
    | CdaMO
    | CdaTS
    | CdaIVL_PQ
    | CdaIVL_TS
    | CdaPIVL_TS
    | CdaEIVL_TS
    | CdaSXPR_TS
    | CdaRTO_PQ_PQ
  )[];

  interpretationCode?: CdaCE[];

  methodCode?: CdaCE[];

  /**
   * Drawn from concept domain ActSite
   */
  targetSiteCode?: CdaCD[];

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  entryRelationship?: CdaEntryRelationship[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:precondition2'?: CdaPrecondition2[];

  /**
   * Relates an Observation to the ObservationRange class, where the
   * expected range of values for a particular observation can be
   * specified.
   */
  referenceRange?: CdaObservationReferenceRange[];

  'sdtc:inFulfillmentOf1'?: CdaInFulfillmentOf1[];
}

export type CdaObservationValue = (
  | CdaANY
  | CdaBL
  | CdaED
  | string
  | CdaST
  | CdaCD
  | CdaCV
  | CdaCE
  | CdaCO
  | CdaSC
  | CdaII
  | CdaTEL
  | CdaAD
  | CdaTN
  | CdaINT
  | CdaREAL
  | CdaPQ
  | CdaMO
  | CdaTS
  | CdaIVL_PQ
  | CdaIVL_TS
  | CdaPIVL_TS
  | CdaEIVL_TS
  | CdaSXPR_TS
  | CdaRTO_PQ_PQ
)[];

/**
 * Relates an Observation to the ObservationRange class, where the
 * expected range of values for a particular observation can be
 * specified.
 */
export interface CdaObservationReferenceRange {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaObservationReferenceRangeTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  observationRange: CdaObservationRange;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaObservationReferenceRangeTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaObservationTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A derivative of the RIM Observation class that represents multimedia
 * that is logically part of the current document. This class is only for
 * multimedia that is logically part of the attested content of the
 * document. Rendering a referenced ObservationMedia requires a software
 * tool that recognizes the particular MIME media type.
 *
 * An XML attribute &quot;ID&quot; of type XML ID, is added to ObservationMedia
 * within the CDA Schema. This attribute serves as the target of a
 * renderMultiMedia reference (see renderMultiMedia). All values of
 * attributes of type XML ID must be unique within the document (per the
 * W3C XML specification).
 *
 * The distinction between ObservationMedia and ExternalObservation is
 * that ObservationMedia entries are part of the attested content of the
 * document whereas ExternalObservations are not. For instance, when a
 * clinician draws a picture as part of a progress note, that picture is
 * represented as a CDA ObservationMedia. If that clinician is also
 * describing a finding seen on a chest-x-ray, the referenced chest-x-ray
 * is represented as a CDA ExternalObservation.
 */
export interface CdaObservationMedia {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaObservationMediaTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_ID'?: string;

  '@_classCode': string;

  '@_moodCode': string;

  id?: CdaII[];

  languageCode?: CdaCS;

  value: CdaED | string;

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  entryRelationship?: CdaEntryRelationship[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:precondition2'?: CdaPrecondition2[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaObservationMediaTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * ObservationRange (CDA Class)
 */
export interface CdaObservationRange {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaObservationRangeTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  code?: CdaCD;

  text?: CdaED | string;

  value?:
    | CdaBL
    | CdaED
    | string
    | CdaST
    | CdaCD
    | CdaCV
    | CdaCE
    | CdaCO
    | CdaSC
    | CdaII
    | CdaTEL
    | CdaAD
    | CdaTN
    | CdaINT
    | CdaREAL
    | CdaPQ
    | CdaMO
    | CdaTS
    | CdaIVL_PQ
    | CdaIVL_TS
    | CdaPIVL_TS
    | CdaEIVL_TS
    | CdaSXPR_TS;

  interpretationCode?: CdaCE;

  /**
   * The sdtc:precondition1 extension allows for the association of a
   * criterion with a reference range (ObservationRange), which allows the
   * expression in a lab report that a reference range is conditional on
   * some criterion such as patient sex or age (or a combination of
   * criterion).
   */
  'sdtc:precondition1'?: CdaObservationRangeSdtcPrecondition1[];
}

export type CdaObservationRangeValue =
  | CdaBL
  | CdaED
  | string
  | CdaST
  | CdaCD
  | CdaCV
  | CdaCE
  | CdaCO
  | CdaSC
  | CdaII
  | CdaTEL
  | CdaAD
  | CdaTN
  | CdaINT
  | CdaREAL
  | CdaPQ
  | CdaMO
  | CdaTS
  | CdaIVL_PQ
  | CdaIVL_TS
  | CdaPIVL_TS
  | CdaEIVL_TS
  | CdaSXPR_TS;

/**
 * The sdtc:precondition1 extension allows for the association of a
 * criterion with a reference range (ObservationRange), which allows the
 * expression in a lab report that a reference range is conditional on
 * some criterion such as patient sex or age (or a combination of
 * criterion).
 */
export interface CdaObservationRangeSdtcPrecondition1 {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaObservationRangeSdtcPrecondition1TypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  /**
   * A code specifying the logical conjunction of the criteria among all
   * the condition-links of Acts (e.g., and, or, exclusive-or).
   *
   * All AND criteria must be true.
   *
   * If OR and AND criteria occur together, one criterion out of the
   * OR-group must be true and all AND criteria must be true also.
   *
   * If XOR criteria occur together with OR and AND criteria, exactly one
   * of the XOR criteria must be true, and at least one of the OR criteria
   * and all AND criteria must be true.
   *
   * In other words, the sets of AND, OR, and XOR criteria are in turn
   * combined by a logical AND operator (all AND criteria and at least one
   * OR criterion and exactly one XOR criterion).
   */
  'sdtc:conjunctionCode': CdaCS;

  'sdtc:criterion1': CdaCriterion;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaObservationRangeSdtcPrecondition1TypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaObservationRangeTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A name for an organization. A sequence of name parts. Examples for
 * organization name values are &quot;Health Level Seven, Inc.&quot;, &quot;Hospital&quot;,
 * etc. An organization name may be as simple as a character string or
 * may consist of several person name parts, such as, &quot;Health Level 7&quot;,
 * &quot;Inc.&quot;. ON differs from EN because certain person related name parts
 * are not possible.
 */
export interface CdaON {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A set of codes advising a system or user which name in a set of like
   * names to select for a given purpose. A name without specific use code
   * might be a default name useful for any purpose, but a name with a
   * specific use code would be preferred for that respective purpose
   */
  '@_use'?: string;

  delimiter?: (CdaENXP | string)[];

  family?: (CdaENXP | string)[];

  given?: (CdaENXP | string)[];

  prefix?: (CdaENXP | string)[];

  suffix?: (CdaENXP | string)[];

  '#text'?: string[];

  /**
   * An interval of time specifying the time during which the name is or
   * was used for the entity. This accomodates the fact that people change
   * names for people, places and things.
   */
  validTime?: CdaIVL_TS;
}

/**
 * This class represents those orders that are fulfilled by this
 * document. For instance, a provider orders an X-Ray. The X-Ray is
 * performed. A radiologist reads the X-Ray and generates a report. The
 * X-Ray order identifier is transmitted in the Order class, the
 * performed X-Ray procedure is transmitted in the ServiceEvent class,
 * and the ClinicalDocument.code would be valued with &quot;Diagnostic Imaging
 * Report&quot;.
 */
export interface CdaOrder {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaOrderTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id: CdaII[];

  code?: CdaCE;

  priorityCode?: CdaCE;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaOrderTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * An Entity representing a formalized group of persons or other
 * organizations with a common purpose and the infrastructure to carry
 * out that purpose.
 *
 * Companies and institutions, a government department, an incorporated
 * body that is responsible for administering a facility, an insurance
 * company.
 */
export interface CdaOrganization {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaOrganizationTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  id?: CdaII[];

  name?: (CdaON | string)[];

  telecom?: CdaTEL[];

  addr?: (CdaAD | string)[];

  standardIndustryClassCode?: CdaCE;

  asOrganizationPartOf?: CdaOrganizationPartOf;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaOrganizationTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * OrganizationPartOf (CDA Class)
 */
export interface CdaOrganizationPartOf {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaOrganizationPartOfTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id?: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  code?: CdaCE;

  statusCode?: CdaCS;

  effectiveTime?: CdaIVL_TS;

  wholeOrganization?: CdaOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaOrganizationPartOfTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A derivative of the RIM Act class, which can be used to create
 * arbitrary groupings of other CDA entries that share a common context.
 * An Organizer can contain other Organizers and/or other CDA entries, by
 * traversing the component relationship. An Organizer can refer to
 * external acts by traversing the reference relationship. An Organizer
 * cannot be the source of an entryRelationship relationship.
 * NOTE: CDA entries such as Observation can also contain other CDA
 * entries by traversing the entryRelationship class. There is no
 * requirement that the Organizer entry be used in order to group CDA
 * entries.
 */
export interface CdaOrganizer {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaOrganizerTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  id?: CdaII[];

  code?: CdaCD;

  'sdtc:text'?: CdaED | string;

  statusCode: CdaCS;

  effectiveTime?: CdaIVL_TS;

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:precondition2'?: CdaPrecondition2[];

  component?: CdaOrganizerComponent[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaOrganizerTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * CDA entries represent the structured computer-processable components
 * within a document section. Each section can contain zero to many
 * entries.
 */
export interface CdaOrganizerComponent {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaOrganizerComponentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextConductionInd'?: string;

  sequenceNumber?: CdaINT;

  'sdtc:priorityNumber'?: CdaINT;

  seperatableInd?: CdaBL;

  act?: CdaAct;

  encounter?: CdaEncounter;

  observation?: CdaObservation;

  observationMedia?: CdaObservationMedia;

  organizer?: CdaOrganizer;

  procedure?: CdaProcedure;

  regionOfInterest?: CdaRegionOfInterest;

  substanceAdministration?: CdaSubstanceAdministration;

  supply?: CdaSupply;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaOrganizerComponentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The ParentDocument represents the source of a document revision,
 * addenda, or transformation. ParentDocument.text is modeled as an ED
 * data type - allowing for the expression of the MIME type of the parent
 * document. It is not to be used to embed the related document, and thus
 * ParentDocument.text.BIN is precluded from use.
 */
export interface CdaParentDocument {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaParentDocumentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id: CdaII[];

  code?: CdaCD;

  text?: CdaED | string;

  setId?: CdaII;

  versionNumber?: CdaINT;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaParentDocumentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Used to represent other participants not explicitly mentioned by other
 * classes, that were somehow involved in the documented acts.
 */
export interface CdaParticipant1 {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaParticipant1TypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode': string;

  '@_contextControlCode'?: string;

  functionCode?: CdaCE;

  time?: CdaIVL_TS;

  associatedEntity: CdaAssociatedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaParticipant1TypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Can be used to represent any other participant that cannot be
 * represented with one of the more specific participants. The
 * participant can be ascribed to a CDA entry, and propagates to nested
 * CDA entries, unless overridden.
 */
export interface CdaParticipant2 {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaParticipant2TypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode': string;

  '@_contextControlCode'?: string;

  'sdtc:functionCode'?: CdaCE;

  time?: CdaIVL_TS;

  awarenessCode?: CdaCE;

  participantRole: CdaParticipantRole;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaParticipant2TypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * ParticipantRole (CDA Class)
 */
export interface CdaParticipantRole {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaParticipantRoleTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id?: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  code?: CdaCE;

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  playingDevice?: CdaDevice;

  playingEntity?: CdaPlayingEntity;

  scopingEntity?: CdaEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaParticipantRoleTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A LivingSubject as a recipient of health care services from a
 * healthcare provider.
 * The patient is the player; the provider is the scoper.
 */
export interface CdaPatient {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPatientTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  id?: CdaII;

  name?: (CdaPN | string)[];

  /**
   * The desc extension allows multimedia depictions of patients,
   * healthcare providers, or other individuals to be included in a CDA
   * document.
   */
  'sdtc:desc'?: CdaED | string;

  administrativeGenderCode?: CdaCE;

  birthTime?: CdaTS;

  'sdtc:deceasedInd'?: CdaBL;

  'sdtc:deceasedTime'?: CdaTS;

  'sdtc:multipleBirthInd'?: CdaBL;

  'sdtc:multipleBirthOrderNumber'?: CdaINT_POS;

  maritalStatusCode?: CdaCE;

  religiousAffiliationCode?: CdaCE;

  raceCode?: CdaCE;

  'sdtc:raceCode'?: CdaCE[];

  ethnicGroupCode?: CdaCE;

  'sdtc:ethnicGroupCode'?: CdaCE[];

  guardian?: CdaGuardian[];

  birthplace?: CdaBirthplace;

  languageCommunication?: CdaLanguageCommunication[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPatientTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A recordTarget is represented as a relationship between a person and
 * an organization, where the person is in a patient role (PatientRole
 * class). The entity playing the role is a patient (Patient class). The
 * entity scoping the role is an organization (Organization class). A
 * patient is uniquely identified via the PatientRole.id attribute.
 */
export interface CdaPatientRole {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPatientRoleTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  patient?: CdaPatient;

  providerOrganization?: CdaOrganization;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPatientRoleTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * TODO
 */
export interface CdaPerformer1 {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPerformer1TypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode': string;

  functionCode?: CdaCE;

  time?: CdaIVL_TS;

  assignedEntity: CdaAssignedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPerformer1TypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * TODO
 */
export interface CdaPerformer2 {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPerformer2TypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  'sdtc:functionCode'?: CdaCE;

  time?: CdaIVL_TS;

  modeCode?: CdaCE;

  assignedEntity: CdaAssignedEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPerformer2TypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A human being.
 *
 * This class can be used to represent either a single individual, a
 * group of individuals or a kind of individual based on the values of
 * Entity.determinerCode and Entity.quantity.
 */
export interface CdaPerson {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPersonTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  name?: (CdaPN | string)[];

  /**
   * The desc extension allows multimedia depictions of patients,
   * healthcare providers, or other individuals to be included in a CDA
   * document.
   */
  'sdtc:desc'?: CdaED | string;

  /**
   * Each participant role other than an informant/relatedEntity may have
   * zero or more relationship roles with the patient. Each of these roles
   * can be expressed with an asPatientRelationship element which further
   * describes the type of role using a code element.
   */
  'sdtc:asPatientRelationship'?: CdaPersonSdtcAsPatientRelationship[];
}

/**
 * Each participant role other than an informant/relatedEntity may have
 * zero or more relationship roles with the patient. Each of these roles
 * can be expressed with an asPatientRelationship element which further
 * describes the type of role using a code element.
 */
export interface CdaPersonSdtcAsPatientRelationship {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPersonSdtcAsPatientRelationshipTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_determinerCode'?: string;

  'sdtc:code': CdaCE;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPersonSdtcAsPatientRelationshipTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPersonTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * An interval of time that recurs periodically. Periodic intervals have
 * two properties, phase and period. The phase specifies the &quot;interval
 * prototype&quot; that is repeated every period.
 */
export interface CdaPIVL_TS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A code specifying whether the set component is included (union) or
   * excluded (set-difference) from the set, or other set operations with
   * the current set component and the set as constructed from the
   * representation stream up to the current point.
   */
  '@_operator'?: string;

  /**
   * A prototype of the repeating interval, specifying the duration of each
   * occurrence and anchors the periodic interval sequence at a certain
   * point in time.
   */
  phase?: CdaIVL_TS;

  /**
   * A time duration specifying as a reciprocal measure of the frequency at
   * which the periodic interval repeats.
   */
  period?: CdaPQ;

  /**
   * Specifies if and how the repetitions are aligned to the cycles of the
   * underlying calendar (e.g., to distinguish every 30 days from &quot;the 5th
   * of every month&quot;.) A non-aligned periodic interval recurs independently
   * from the calendar. An aligned periodic interval is synchronized with
   * the calendar.
   */
  '@_alignment'?: string;

  /**
   * Indicates whether the exact timing is up to the party executing the
   * schedule (e.g., to distinguish &quot;every 8 hours&quot; from &quot;3 times a day&quot;.)
   */
  '@_institutionSpecified'?: string;
}

/**
 * A bounded physical place or site, including any contained structures.
 *
 * Place may be natural or man-made. The geographic position of a place
 * may or may not be constant. Places may be work facilities (where
 * relevant acts occur), homes (where people live) or offices (where
 * people work). Places may contain sub-places (floor, room, booth, bed).
 * Places may also be sites that are investigated in the context of
 * health care, social work, public health administration (e.g.,
 * buildings, picnic grounds, day care centers, prisons, counties,
 * states, and other focuses of epidemiological events).
 *
 * Examples: A field, lake, city, county, state, country, lot (land),
 * building, pipeline, power line, playground, ship, truck
 */
export interface CdaPlace {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPlaceTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  name?: CdaTN | string;

  addr?: CdaAD | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPlaceTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * PlayingEntity (CDA Class)
 */
export interface CdaPlayingEntity {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPlayingEntityTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  code?: CdaCE;

  quantity?: CdaPQ[];

  name?: (CdaPN | string)[];

  /**
   * The purpose of this extension is to allow the recording of the
   * subscriber or member of a health plan in cases where the health plan
   * eligibility system has different information on file than the provider
   * does for the patient.
   */
  'sdtc:birthTime'?: CdaTS;

  desc?: CdaED | string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPlayingEntityTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A name for a person. A sequence of name parts, such as given name or
 * family name, prefix, suffix, etc. Examples for person name values are
 * &quot;Jim Bob Walton, Jr.&quot;, &quot;Adam Everyman&quot;, etc. A person name may be as
 * simple as a character string or may consist of several person name
 * parts, such as, &quot;Jim&quot;, &quot;Bob&quot;, &quot;Walton&quot;, and &quot;Jr.&quot;. PN differs from EN
 * because the qualifier type cannot include LS (Legal Status).
 */
export interface CdaPN {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A set of codes advising a system or user which name in a set of like
   * names to select for a given purpose. A name without specific use code
   * might be a default name useful for any purpose, but a name with a
   * specific use code would be preferred for that respective purpose
   */
  '@_use'?: string;

  delimiter?: (CdaENXP | string)[];

  family?: (CdaENXP | string)[];

  given?: (CdaENXP | string)[];

  prefix?: (CdaENXP | string)[];

  suffix?: (CdaENXP | string)[];

  '#text'?: string[];

  /**
   * An interval of time specifying the time during which the name is or
   * was used for the entity. This accomodates the fact that people change
   * names for people, places and things.
   */
  validTime?: CdaIVL_TS;
}

/**
 * A dimensioned quantity expressing the result of measuring.
 */
export interface CdaPQ {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The unit of measure specified in the Unified Code for Units of Measure
   * (UCUM) [].
   */
  '@_unit'?: string;

  /**
   * The magnitude of the quantity measured in terms of the unit.
   */
  '@_value'?: string;

  /**
   * An alternative representation of the same physical quantity expressed
   * in a different unit, of a different unit code system and possibly with
   * a different value.
   */
  translation?: CdaPQR[];
}

/**
 * An extension of the coded value data type representating a physical
 * quantity using a unit from any code system. Used to show alternative
 * representation for a physical quantity.
 */
export interface CdaPQR {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The plain code symbol defined by the code system. For example, &quot;784.0&quot;
   * is the code symbol of the ICD-9 code &quot;784.0&quot; for headache.
   */
  '@_code'?: string;

  /**
   * Specifies the code system that defines the code.
   */
  '@_codeSystem'?: string;

  /**
   * The common name of the coding system.
   */
  '@_codeSystemName'?: string;

  /**
   * If applicable, a version descriptor defined specifically for the given
   * code system.
   */
  '@_codeSystemVersion'?: string;

  /**
   * A name or title for the code, under which the sending system shows the
   * code value to its users.
   */
  '@_displayName'?: string;

  /**
   * The valueSet extension adds an attribute for elements with a CD
   * dataType which indicates the particular value set constraining the
   * coded concept.
   */
  '@_sdtc:valueSet'?: string;

  /**
   * The valueSetVersion extension adds an attribute for elements with a CD
   * dataType which indicates the version of the particular value set
   * constraining the coded concept.
   */
  '@_sdtc:valueSetVersion'?: string;

  /**
   * The text or phrase used as the basis for the coding.
   */
  originalText?: CdaED | string;

  /**
   * The magnitude of the measurement value in terms of the unit specified
   * by this code.
   */
  '@_value'?: string;
}

/**
 * The precondition class, derived from the ActRelationship class, is
 * used along with the Precondition class to express a condition that
 * must hold true before some over activity occurs.
 */
export interface CdaPrecondition {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPreconditionTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  criterion: CdaCriterion;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPreconditionTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The sdtc:precondition2 extension allows a more flexible set of skip
 * conditions on a set of criteria. Without this extension the skip
 * condition is restricted to all criteria true. The extension allows a
 * choice of the following logical operation extensions sdtc:allTrue,
 * sdtc:allFalse, sdtc:atLeastOneTrue, sdtc:atLeastOneFalse,
 * sdtc:onlyOneFalse, and sdtc:onlyOneTrue to be placed upon the
 * encapsulated criteria or a criterion. The logical operation extensions
 * nest a [0 .. *] sdtc:precondition2 extension allowing for a complex
 * specification of nested skip conditions if needed.
 */
export interface CdaPrecondition2 {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPrecondition2TypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_negationInd'?: string;

  /**
   * A code specifying the logical conjunction of the criteria among all
   * the condition-links of Acts (e.g., and, or, exclusive-or).
   *
   * All AND criteria must be true.
   *
   * If OR and AND criteria occur together, one criterion out of the
   * OR-group must be true and all AND criteria must be true also.
   *
   * If XOR criteria occur together with OR and AND criteria, exactly one
   * of the XOR criteria must be true, and at least one of the OR criteria
   * and all AND criteria must be true.
   *
   * In other words, the sets of AND, OR, and XOR criteria are in turn
   * combined by a logical AND operator (all AND criteria and at least one
   * OR criterion and exactly one XOR criterion).
   */
  'sdtc:conjunctionCode': CdaCS;

  'sdtc:allTrue'?: CdaPreconditionBase;

  'sdtc:allFalse'?: CdaPreconditionBase;

  'sdtc:atLeastOneTrue'?: CdaPreconditionBase;

  'sdtc:atLeastOneFalse'?: CdaPreconditionBase;

  'sdtc:onlyOneTrue'?: CdaPreconditionBase;

  'sdtc:onlyOneFalse'?: CdaPreconditionBase;

  'sdtc:criterion'?: CdaCriterion;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPrecondition2TypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * An abstract class containing the common fields used by sdtc:allTrue,
 * sdtc:allFalse, sdtc:atLeastOneTrue, sdtc:atLeastOneFalse,
 * sdtc:onlyOneTrue, and sdtc:onlyOneFalse.
 */
export interface CdaPreconditionBase {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaPreconditionBaseTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  'sdtc:id': CdaII;

  'sdtc:precondition'?: CdaPrecondition2[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaPreconditionBaseTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A derivative of the RIM Procedure class, used for representing
 * procedures.
 *
 * Procedure.negationInd, when set to &quot;true&quot;, is a positive assertion
 * that the Procedure as a whole is negated. Some properties such as
 * Procedure.id, Procedure.moodCode, and the participations are not
 * affected. These properties always have the same meaning: i.e., the
 * author remains the author of the negative Procedure. A procedure
 * statement with negationInd is still a statement about the specific
 * fact described by the Procedure. For instance, a negated &quot;appendectomy
 * performed&quot; means that the author positively denies that there was ever
 * an appendectomy performed, and that he takes the same responsibility
 * for such statement and the same requirement to have evidence for such
 * statement than if he had not used negation.
 */
export interface CdaProcedure {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaProcedureTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  id?: CdaII[];

  /**
   * Drawn from concept domain ActCode
   */
  code?: CdaCD;

  '@_negationInd'?: string;

  text?: CdaED | string;

  statusCode?: CdaCS;

  effectiveTime?: CdaIVL_TS;

  priorityCode?: CdaCE;

  languageCode?: CdaCS;

  /**
   * Drawn from concept domain ProcedureMethod
   */
  methodCode?: CdaCE[];

  /**
   * Drawn from concept domain ActSite
   */
  approachSiteCode?: CdaCD[];

  /**
   * Drawn from concept domain ActSite
   */
  targetSiteCode?: CdaCD[];

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  entryRelationship?: CdaEntryRelationship[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:precondition2'?: CdaPrecondition2[];

  'sdtc:inFulfillmentOf1'?: CdaInFulfillmentOf1[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaProcedureTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The quantity data type is an abstract generalization for all data
 * types (1) whose value set has an order relation (less-or-equal) and
 * (2) where difference is defined in all of the data type's totally
 * ordered value subsets. The quantity type abstraction is needed in
 * defining certain other types, such as the interval and the probability
 * distribution.
 */
export interface CdaQTY {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;
}

/**
 * Fractional numbers. Typically used whenever quantities are measured,
 * estimated, or computed from other real numbers. The typical
 * representation is decimal, where the number of significant decimal
 * digits is known as the precision.
 */
export interface CdaREAL {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  '@_value'?: string;
}

/**
 * The recordTarget represents the medical record that this document
 * belongs to. A clinical document typically has exactly one recordTarget
 * participant. In the uncommon case where a clinical document (such as a
 * group encounter note) is placed into more than one patient chart, more
 * than one recordTarget participants can be stated. The recordTarget(s)
 * of a document are stated in the header and propagate to nested
 * content, where they cannot be overridden (see See CDA Context (§ 4.4
 * )).
 */
export interface CdaRecordTarget {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaRecordTargetTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextControlCode'?: string;

  patientRole: CdaPatientRole;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaRecordTargetTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * CDA entries can reference external objects such as external images and
 * prior reports. These external objects are not part of the
 * authenticated document content. They contain sufficient attributes to
 * enable an explicit reference rather than duplicating the entire
 * referenced object. The CDA entry that wraps the external reference can
 * be used to encode the specific portions of the external reference that
 * are addressed in the narrative block.
 *
 * Each object allows for an identifier and a code, and contains the RIM
 * Act.text attribute, which can be used to store the URL and MIME type
 * of the object. External objects always have a fixed moodCode of &quot;EVN&quot;.
 *
 * The reference class contains the attribute reference.seperatableInd,
 * which indicates whether or not the source is intended to be
 * interpreted independently of the target. The indicator cannot prevent
 * an individual or application from separating the source and target,
 * but indicates the author's desire and willingness to attest to the
 * content of the source if separated from the target. Typically, where
 * seperatableInd is &quot;false&quot;, the exchanged package should include the
 * target of the reference so that the recipient can render it.
 */
export interface CdaReference {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaReferenceTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode': string;

  seperatableInd?: CdaBL;

  externalAct?: CdaExternalAct;

  externalObservation?: CdaExternalObservation;

  externalProcedure?: CdaExternalProcedure;

  externalDocument?: CdaExternalDocument;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaReferenceTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A derivative of the RIM Observation class that represents a region of
 * interest on an image, using an overlay shape. RegionOfInterest is used
 * to make reference to specific regions in images, e.g., to specify the
 * site of a physical finding by &quot;circling&quot; a region in a schematic
 * picture of a human body. The units of the coordinate values in
 * RegionOfInterest.value are in pixels, expressed as a list of integers.
 * The origin is in the upper left hand corner, with positive X values
 * going to the right and positive Y values going down. The relationship
 * between a RegionOfInterest and its referenced ObservationMedia or
 * ExternalObservation is specified by traversing the entryRelationship
 * or reference class, respectively, where typeCode equals &quot;SUBJ&quot;. A
 * RegionOfInterest must reference exactly one ObservationMedia or one
 * ExternalObservation. If the RegionOfInterest is the target of a
 * renderMultimedia reference, then it shall only reference an
 * ObservationMedia and not an ExternalObservation.
 *
 * An XML attribute &quot;ID&quot; of type XML ID, is added to RegionOfInterest
 * within the CDA Schema. This attribute serves as the target of a
 * renderMultiMedia reference (see renderMultiMedia). All values of
 * attributes of type XML ID must be unique within the document (per the
 * W3C XML specification).
 */
export interface CdaRegionOfInterest {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaRegionOfInterestTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_ID'?: string;

  '@_classCode': string;

  '@_moodCode': string;

  id: CdaII[];

  code: CdaCS;

  value: CdaINT[];

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  entryRelationship?: CdaEntryRelationship[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:precondition2'?: CdaPrecondition2[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaRegionOfInterestTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * Represents the participant who has transformed a dictated note into
 * text.
 */
export interface CdaRelatedDocument {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaRelatedDocumentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode': string;

  parentDocument: CdaParentDocument;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaRelatedDocumentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The RelatedEntity role is used to represent an informant without a
 * role.id (e.g. a parent or guy on the street).
 */
export interface CdaRelatedEntity {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaRelatedEntityTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  code?: CdaCE;

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  effectiveTime?: CdaIVL_TS;

  relatedPerson?: CdaPerson;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaRelatedEntityTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A subject is a person playing one of several possible roles
 * (RelatedSubject class). The entity playing the role is a person
 * (SubjectPerson class).
 */
export interface CdaRelatedSubject {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaRelatedSubjectTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  /**
   * A CDA Document identifies each participant through the application of
   * a role identifier. This identifier can be used to trace the
   * participation of an entity in a given role, but cannot necessarily be
   * used to determine that two entities are the same. While more role
   * identities could be provided whose intended use is to unify the
   * entities, this is better modeled through the use of an entity
   * identifier. Therefore, to facilitate this capability, this guide
   * defines an extension to CDA Release 2.0 that allows the person or
   * organization playing the role to be uniquely identified, by the
   * inclusion of an identifier on the entity.
   */
  'sdtc:id'?: CdaII[];

  code?: CdaCE;

  addr?: (CdaAD | string)[];

  telecom?: CdaTEL[];

  subject?: CdaSubjectPerson;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaRelatedSubjectTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A quantity constructed as the quotient of a numerator quantity divided
 * by a denominator quantity. Common factors in the numerator and
 * denominator are not automatically cancelled out. The data type
 * supports titers (e.g., &quot;1:128&quot;) and other quantities produced by
 * laboratories that truly represent ratios. Ratios are not simply
 * &quot;structured numerics&quot;, particularly blood pressure measurements (e.g.
 * &quot;120/60&quot;) are not ratios. In many cases the should be used instead of
 * the .
 */
export interface CdaRTO_PQ_PQ {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * The quantity that is being divided in the ratio. The default is the
   * integer number 1 (one.)
   */
  numerator?: CdaPQ;

  /**
   * The quantity that devides the numerator in the ratio. The default is
   * the integer number 1 (one.) The denominator must not be zero.
   */
  denominator?: CdaPQ;
}

/**
 * A character string that optionally may have a code attached. The text
 * must always be present if a code is present. The code is often a local
 * code.
 */
export interface CdaSC {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;

  '@_code'?: string;

  '@_codeSystem'?: string;

  '@_codeSystemName'?: string;

  '@_codeSystemVersion'?: string;

  '@_displayName'?: string;
}

/**
 * Document sections can nest, can override context propagated from the
 * header (See CDA Context), and can contain narrative and CDA entries.
 *
 * An XML attribute &quot;ID&quot; of type XML ID, is added to Section within the
 * CDA Schema. This attribute serves as the target of a linkHtml
 * reference (see linkHtml). All values of attributes of type XML ID must
 * be unique within the document (per the W3C XML specification).
 */
export interface CdaSection {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSectionTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_ID'?: string;

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id?: CdaII;

  code?: CdaCE;

  title?: CdaST | string;

  text?: string | Record<string, unknown>;

  confidentialityCode?: CdaCE;

  languageCode?: CdaCS;

  subject?: CdaSubject;

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  entry?: CdaEntry[];

  component?: CdaSectionComponent[];
}

export interface CdaSectionComponent {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSectionComponentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  /**
   * Drawn from concept domain DocumentSectionType
   */
  '@_typeCode'?: string;

  '@_contextConductionInd'?: string;

  section: CdaSection;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSectionComponentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSectionTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * This class represents the main Act, such as a colonoscopy or an
 * appendectomy, being documented.
 *
 * In some cases, the ServiceEvent is inherent in the
 * ClinicalDocument.code, such as where ClinicalDocument.code is &quot;History
 * and Physical Report&quot; and the procedure being documented is a &quot;History
 * and Physical&quot; act. A ServiceEvent can further specialize the act
 * inherent in the ClinicalDocument.code, such as where the
 * ClinicalDocument.code is simply &quot;Procedure Report&quot; and the procedure
 * was a &quot;colonoscopy&quot;. If ServiceEvent is included, it must be
 * equivalent to or further specialize the value inherent in the
 * ClinicalDocument.code, and shall not conflict with the value inherent
 * in the ClinicalDocument.code, as such a conflict would constitute an
 * ambiguous situation.
 *
 * ServiceEvent.effectiveTime can be used to indicate the time the actual
 * event (as opposed to the encounter surrounding the event) took place.
 */
export interface CdaServiceEvent {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaServiceEventTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  id?: CdaII[];

  /**
   * Drawn from concept domain ActCode
   */
  code?: CdaCE;

  effectiveTime?: CdaIVL_TS;

  performer?: CdaPerformer1[];
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaServiceEventTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A specimen is a part of some entity, typically the subject, that is
 * the target of focused laboratory, radiology or other observations. In
 * many clinical observations, such as physical examination of a patient,
 * the patient is the subject of the observation, and there is no
 * specimen. The specimen participant is only used when observations are
 * made against some substance or object that is taken or derived from
 * the subject.
 */
export interface CdaSpecimen {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSpecimenTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  specimenRole: CdaSpecimenRole;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSpecimenTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * SpecimenRole (CDA Class)
 */
export interface CdaSpecimenRole {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSpecimenRoleTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  id?: CdaII[];

  'sdtc:identifiedBy'?: CdaIdentifiedBy[];

  specimenPlayingEntity?: CdaPlayingEntity;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSpecimenRoleTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The character string data type stands for text data, primarily
 * intended for machine processing (e.g., sorting, querying, indexing,
 * etc.) Used for names, symbols, and formal expressions.
 */
export interface CdaST {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * Specifies the representation of the binary data that is the content of
   * the binary data value
   */
  '@_representation'?: string;

  /**
   * Identifies the type of the encapsulated data and identifies a method
   * to interpret or render the data.
   */
  '@_mediaType'?: string;

  /**
   * For character based information the language property specifies the
   * human language of the text.
   */
  '@_language'?: string;

  '#text'?: string;
}

/**
 * The StructuredBody class represents a CDA document body that is
 * comprised of one or more document sections.
 *
 * The StructuredBody class is associated with one or more Section
 * classes through a component relationship.
 */
export interface CdaStructuredBody {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaStructuredBodyTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_moodCode'?: string;

  confidentialityCode?: CdaCE;

  languageCode?: CdaCS;

  component: CdaStructuredBodyComponent[];
}

export interface CdaStructuredBodyComponent {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaStructuredBodyComponentTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextConductionInd'?: string;

  section: CdaSection;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaStructuredBodyComponentTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaStructuredBodyTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The subject participant represents the primary target of the entries
 * recorded in the document. Most of the time the subject is the same as
 * the recordTarget, but need not be, for instance when the subject is a
 * fetus observed in an obstetrical ultrasound.
 *
 * The subject participant can be ascribed to a CDA section or a CDA
 * entry. It propagates to nested components, unless overridden. The
 * subject of a document is presumed to be the patient.
 */
export interface CdaSubject {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSubjectTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  '@_contextControlCode'?: string;

  awarenessCode?: CdaCE;

  relatedSubject: CdaRelatedSubject;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSubjectTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * The entity playing the role is a person (SubjectPerson class).
 */
export interface CdaSubjectPerson {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSubjectPersonTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode'?: string;

  '@_determinerCode'?: string;

  /**
   * A CDA Document identifies each participant through the application of
   * a role identifier. This identifier can be used to trace the
   * participation of an entity in a given role, but cannot necessarily be
   * used to determine that two entities are the same. While more role
   * identities could be provided whose intended use is to unify the
   * entities, this is better modeled through the use of an entity
   * identifier. Therefore, to facilitate this capability, this guide
   * defines an extension to CDA Release 2.0 that allows the person or
   * organization playing the role to be uniquely identified, by the
   * inclusion of an identifier on the entity.
   */
  'sdtc:id'?: CdaII[];

  name?: (CdaPN | string)[];

  /**
   * The desc extension allows multimedia depictions of patients,
   * healthcare providers, or other individuals to be included in a CDA
   * document.
   */
  'sdtc:desc'?: CdaED | string;

  administrativeGenderCode?: CdaCE;

  birthTime?: CdaTS;

  'sdtc:deceasedInd'?: CdaBL;

  'sdtc:deceasedTime'?: CdaTS;

  'sdtc:multipleBirthInd'?: CdaBL;

  'sdtc:multipleBirthOrderNumber'?: CdaINT_POS;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSubjectPersonTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A derivative of the RIM SubstanceAdministration class, used for
 * representing medication-related events such as medication history or
 * planned medication administration orders.
 *
 * SubstanceAdministration.negationInd, when set to &quot;true&quot;, is a positive
 * assertion that the SubstanceAdministration as a whole is negated. Some
 * properties such as SubstanceAdministration.id,
 * SubstanceAdministration.moodCode, and the participations are not
 * affected. These properties always have the same meaning: i.e., the
 * author remains the author of the negative SubstanceAdministration. A
 * substance administration statement with negationInd is still a
 * statement about the specific fact described by the
 * SubstanceAdministration. For instance, a negated &quot;aspirin
 * administration&quot; means that the author positively denies that aspirin
 * is being administered, and that he takes the same responsibility for
 * such statement and the same requirement to have evidence for such
 * statement than if he had not used negation.
 *
 * SubstanceAdministration.priorityCode categorizes the priority of a
 * substance administration. SubstanceAdministration.doseQuantity
 * indicates how much medication is given per dose.
 * SubstanceAdministration.rateQuantity can be used to indicate the rate
 * at which the dose is to be administered (e.g., the flow rate for
 * intravenous infusions). SubstanceAdministration.maxDoseQuantity is
 * used to capture the maximum dose of the medication that can be given
 * over a stated time interval (e.g., maximum daily dose of morphine,
 * maximum lifetime dose of doxorubicin).
 * SubstanceAdministration.effectiveTime is used to describe the timing
 * of administration. It is modeled using the GTS data type to
 * accommodate various dosing scenarios.
 *
 * The capture of medication-related information also involves the
 * interrelationship of SubstanceAdministration with several other
 * classes. The consumable participation is used to bring in the
 * LabeledDrug or Material entity that describes the administered
 * substance. The LabeledDrug class, which is an Entity class playing the
 * Role of Manufactured Product, identifies the drug that is consumed in
 * the substance administration. The medication is identified by means of
 * the LabeledDrug.code or the LabeledDrug.name. The Material entity is
 * used to identify non-drug administered substances such as vaccines and
 * blood products.
 */
export interface CdaSubstanceAdministration {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSubstanceAdministrationTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  id?: CdaII[];

  code?: CdaCD;

  '@_negationInd'?: string;

  text?: CdaED | string;

  statusCode?: CdaCS;

  effectiveTime?: (CdaSXCM_TS | CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];

  priorityCode?: CdaCE;

  repeatNumber?: CdaIVL_INT;

  routeCode?: CdaCE;

  approachSiteCode?: CdaCD[];

  doseQuantity?: CdaIVL_PQ;

  rateQuantity?: CdaIVL_PQ;

  maxDoseQuantity?: CdaRTO_PQ_PQ;

  administrationUnitCode?: CdaCE;

  /**
   * The consumable participation is used to bring in the LabeledDrug or
   * Material entity that describes the administered substance. The
   * LabeledDrug class, which is an Entity class playing the Role of
   * Manufactured Product, identifies the drug that is consumed in the
   * substance administration. The medication is identified by means of the
   * LabeledDrug.code or the LabeledDrug.name. The Material entity is used
   * to identify non-drug administered substances such as vaccines and
   * blood products.
   */
  consumable: CdaSubstanceAdministrationConsumable;

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  entryRelationship?: CdaEntryRelationship[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:inFulfillmentOf1'?: CdaInFulfillmentOf1[];
}

export type CdaSubstanceAdministrationEffectiveTime = (CdaSXCM_TS | CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];

/**
 * The consumable participation is used to bring in the LabeledDrug or
 * Material entity that describes the administered substance. The
 * LabeledDrug class, which is an Entity class playing the Role of
 * Manufactured Product, identifies the drug that is consumed in the
 * substance administration. The medication is identified by means of the
 * LabeledDrug.code or the LabeledDrug.name. The Material entity is used
 * to identify non-drug administered substances such as vaccines and
 * blood products.
 */
export interface CdaSubstanceAdministrationConsumable {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSubstanceAdministrationConsumableTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  manufacturedProduct: CdaManufacturedProduct;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSubstanceAdministrationConsumableTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSubstanceAdministrationTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A derivative of the RIM Supply class, used for representing the
 * provision of a material by one entity to another.
 *
 * The dispensed product is associated with the Supply act via a product
 * participant, which connects to the same ManufacturedProduct role used
 * for SubstanceAdministration.
 *
 * The Supply class represents dispensing, whereas the
 * SubstanceAdministration class represents administration. Prescriptions
 * are complex activities that involve both an administration request to
 * the patient (e.g. take digoxin 0.125mg by mouth once per day) and a
 * supply request to the pharmacy (e.g. dispense 30 tablets, with 5
 * refills). This should be represented in CDA by a
 * SubstanceAdministration entry that has a component Supply entry. The
 * nested Supply entry can have Supply.independentInd set to &quot;false&quot; to
 * signal that the Supply cannot stand alone, without it's containing
 * SubstanceAdministration. The following example illustrates a
 * prescription representation in CDA.
 */
export interface CdaSupply {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSupplyTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_classCode': string;

  '@_moodCode': string;

  id?: CdaII[];

  code?: CdaCD;

  text?: CdaED | string;

  statusCode?: CdaCS;

  effectiveTime?: (CdaSXCM_TS | CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];

  priorityCode?: CdaCE[];

  repeatNumber?: CdaIVL_INT;

  independentInd?: CdaBL;

  quantity?: CdaPQ;

  expectedUseTime?: CdaIVL_TS;

  product?: CdaSupplyProduct;

  subject?: CdaSubject;

  specimen?: CdaSpecimen[];

  performer?: CdaPerformer2[];

  author?: CdaAuthor[];

  informant?: CdaInformant[];

  participant?: CdaParticipant2[];

  entryRelationship?: CdaEntryRelationship[];

  reference?: CdaReference[];

  precondition?: CdaPrecondition[];

  'sdtc:inFulfillmentOf1'?: CdaInFulfillmentOf1[];
}

export type CdaSupplyEffectiveTime = (CdaSXCM_TS | CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];

export interface CdaSupplyProduct {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * When valued in an instance, this attribute signals the imposition of
   * realm-specific constraints. The value of this attribute identifies the
   * realm in question
   */
  realmCode?: CdaCS[];

  /**
   * When valued in an instance, this attribute signals the imposition of
   * constraints defined in an HL7-specified message type. This might be a
   * common type (also known as CMET in the messaging communication
   * environment), or content included within a wrapper. The value of this
   * attribute provides a unique identifier for the type in question.
   */
  typeId?: CdaSupplyProductTypeId;

  /**
   * When valued in an instance, this attribute signals the imposition of a
   * set of template-defined constraints. The value of this attribute
   * provides a unique identifier for the templates in question
   */
  templateId?: CdaII[];

  '@_typeCode'?: string;

  manufacturedProduct: CdaManufacturedProduct;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSupplyProductTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * When valued in an instance, this attribute signals the imposition of
 * constraints defined in an HL7-specified message type. This might be a
 * common type (also known as CMET in the messaging communication
 * environment), or content included within a wrapper. The value of this
 * attribute provides a unique identifier for the type in question.
 */
export interface CdaSupplyTypeId {
  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A human readable name or mnemonic for the assigning authority. The
   * Assigning Authority Name has no computational value. The purpose of a
   * Assigning Authority Name is to assist an unaided human interpreter of
   * an II value to interpret the authority. Note: no automated processing
   * must depend on the assigning authority name to be present in any form.
   */
  '@_assigningAuthorityName'?: string;

  /**
   * Specifies if the identifier is intended for human display and data
   * entry (displayable = true) as opposed to pure machine interoperation
   * (displayable = false).
   */
  '@_displayable'?: string;

  /**
   * Identifies the type as an HL7 Registered model
   */
  '@_root': string;

  /**
   * A character string as a unique identifier within the scope of the
   * identifier root.
   */
  '@_extension': string;
}

/**
 * A set of points in time, specifying the timing of events and actions
 * and the cyclical validity-patterns that may exist for certain kinds of
 * information, such as phone numbers (evening, daytime), addresses (so
 * called &quot;snowbirds,&quot; residing closer to the equator during winter and
 * farther from the equator during summer) and office hours.
 */
export interface CdaSXCM_TS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A quantity specifying a point on the axis of natural time. A point in
   * time is most often represented as a calendar expression.
   */
  '@_value'?: string;

  /**
   * A code specifying whether the set component is included (union) or
   * excluded (set-difference) from the set, or other set operations with
   * the current set component and the set as constructed from the
   * representation stream up to the current point.
   */
  '@_operator'?: string;
}

/**
 * A set-component that is itself made up of set-components that are
 * evaluated as one value
 */
export interface CdaSXPR_TS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A quantity specifying a point on the axis of natural time. A point in
   * time is most often represented as a calendar expression.
   */
  '@_value'?: string;

  /**
   * A code specifying whether the set component is included (union) or
   * excluded (set-difference) from the set, or other set operations with
   * the current set component and the set as constructed from the
   * representation stream up to the current point.
   */
  '@_operator'?: string;

  comp: (CdaSXCM_TS | CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];
}

export type CdaSXPR_TSComp = (CdaSXCM_TS | CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];

/**
 * A telephone number (voice or fax), e-mail address, or other locator
 * for a resource mediated by telecommunication equipment. The address is
 * specified as a Universal Resource Locator (URL) qualified by time
 * specification and use codes that help in deciding which address to use
 * for a given time and purpose.
 */
export interface CdaTEL {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  '@_value'?: string;

  /**
   * Specifies the periods of time during which the telecommunication
   * address can be used. For a telephone number, this can indicate the
   * time of day in which the party can be reached on that telephone. For a
   * web address, it may specify a time range in which the web content is
   * promised to be available under the given address.
   */
  useablePeriod?: (CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];

  /**
   * One or more codes advising a system or user which telecommunication
   * address in a set of like addresses to select for a given
   * telecommunication need.
   */
  '@_use'?: string;
}

/**
 * Specifies the periods of time during which the telecommunication
 * address can be used. For a telephone number, this can indicate the
 * time of day in which the party can be reached on that telephone. For a
 * web address, it may specify a time range in which the web content is
 * promised to be available under the given address.
 */
export type CdaTELUseablePeriod = (CdaIVL_TS | CdaEIVL_TS | CdaPIVL_TS | CdaSXPR_TS)[];

/**
 * A restriction of entity name that is effectively a simple string used
 * for a simple name for things and places.
 */
export interface CdaTN {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A set of codes advising a system or user which name in a set of like
   * names to select for a given purpose. A name without specific use code
   * might be a default name useful for any purpose, but a name with a
   * specific use code would be preferred for that respective purpose
   */
  '@_use'?: string;

  delimiter?: (CdaENXP | string)[];

  family?: (CdaENXP | string)[];

  given?: (CdaENXP | string)[];

  prefix?: (CdaENXP | string)[];

  suffix?: (CdaENXP | string)[];

  '#text'?: string[];

  /**
   * An interval of time specifying the time during which the name is or
   * was used for the entity. This accomodates the fact that people change
   * names for people, places and things.
   */
  validTime?: CdaIVL_TS;
}

/**
 * A quantity specifying a point on the axis of natural time. A point in
 * time is most often represented as a calendar expression.
 */
export interface CdaTS {
  /**
   * The XML Schema type of this element, when it is not the default.
   */
  '@_xsi:type'?: string;

  /**
   * If a value is an exceptional value (NULL-value), this specifies in
   * what way and why proper information is missing.
   */
  '@_nullFlavor'?: string;

  /**
   * A quantity specifying a point on the axis of natural time. A point in
   * time is most often represented as a calendar expression.
   */
  '@_value'?: string;
}
