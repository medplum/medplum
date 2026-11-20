// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ElementDefinition, StructureDefinition } from '@medplum/fhirtypes';
import type { TypedValue } from '../types';
import { getExtension, isEmpty } from '../utils';
import type { InternalSchemaElement, InternalTypeSchema } from './types';

// Support for logical models of XML formats, such as the HL7 CDA StructureDefinitions, typed in the
// shape an XML parser produces. See `loadDataType`.

const XML_NAME = 'http://hl7.org/fhir/tools/StructureDefinition/xml-name';
const XML_NAMESPACE = 'http://hl7.org/fhir/tools/StructureDefinition/xml-namespace';
const XML_CHOICE_GROUP = 'http://hl7.org/fhir/tools/StructureDefinition/xml-choice-group';
const XML_EXTENSIONS = new Set([XML_NAME, XML_NAMESPACE, XML_CHOICE_GROUP]);
const XML_NAMESPACE_PREFIXES: Record<string, string> = {
  'urn:hl7-org:sdtc': 'sdtc',
  'http://www.w3.org/2001/XMLSchema-instance': 'xsi',
};

/**
 * Returns true for logical models of XML formats, such as the HL7 CDA StructureDefinitions. These declare a
 * non-FHIR XML namespace, or use the xml-* tool extensions on their elements. `representation` alone is not
 * enough: FHIR's own StructureDefinitions mark elements such as `Element.id` as XML attributes too.
 * @param sd - The structure definition.
 * @returns True if the structure definition is a logical model of an XML format.
 */
export function isXmlLogicalModel(sd: StructureDefinition): boolean {
  if (sd.kind !== 'logical') {
    return false;
  }
  const namespace = getExtension(sd, XML_NAMESPACE)?.valueUri;
  if (namespace && namespace !== 'http://hl7.org/fhir') {
    return true;
  }
  return !!sd.snapshot?.element?.some((e) => e.extension?.some((ext) => XML_EXTENSIONS.has(ext.url)));
}

/**
 * Renames the elements of an XML logical model the way an XML parser names them: `@_attr` for attributes,
 * `#text` for text content, and `prefix:name` for elements in another namespace (e.g. `sdtc:raceCode`).
 * Members of xml-choice-groups (e.g. the parts of a CDA address) are flattened into the parent type,
 * since they appear directly in the XML.
 * @param schema - The parsed type schema, renamed in place.
 * @param sd - The StructureDefinition of the schema.
 */
export function applyXmlPropertyNames(schema: InternalTypeSchema, sd: StructureDefinition): void {
  const definitions = new Map((sd.snapshot?.element ?? []).map((e) => [e.path, e]));
  const groups = new Set<string>();

  const rename = (type: InternalTypeSchema): void => {
    if (type.xmlPropertyNames) {
      return; // Already renamed, e.g. a choice group renamed with its parent
    }
    const renamed: Record<string, InternalSchemaElement> = Object.create(null);
    for (const [key, element] of Object.entries(type.elements)) {
      const ed = definitions.get(element.path);
      const group = getExtension(ed, XML_CHOICE_GROUP)?.valueBoolean
        ? schema.innerTypes.find((t) => t.path === element.path)
        : undefined;
      if (group) {
        // Choice group members (e.g. AD streetAddressLine, city) appear directly in the XML, any number of times
        groups.add(group.path);
        rename(group);
        for (const [memberKey, member] of Object.entries(group.elements)) {
          renamed[memberKey] = { ...member, isArray: true, max: Number.POSITIVE_INFINITY };
        }
        continue;
      }
      // Set on the element itself, so choice group members carry these when their parent copies them above
      const name = ed ? xmlPropertyName(ed, key) : key;
      renamed[name] = element;
      element.xmlName = name;
      element.xmlAttribute = ed?.representation?.includes('xmlAttr') || undefined;
      element.xmlMarkup = ed?.representation?.includes('cdaText') || undefined;
    }
    type.elements = renamed;
    type.xmlPropertyNames = true;
  };

  rename(schema);
  schema.innerTypes.forEach(rename);
  schema.innerTypes = schema.innerTypes.filter((t) => !groups.has(t.path));
}

function xmlPropertyName(ed: ElementDefinition, key: string): string {
  if (ed.representation?.includes('xmlText')) {
    return '#text';
  }
  const name = getExtension(ed, XML_NAME)?.valueString ?? key;
  const namespace = getExtension(ed, XML_NAMESPACE)?.valueUri;
  const prefix = namespace ? XML_NAMESPACE_PREFIXES[namespace] : undefined;
  const qualified = prefix ? `${prefix}:${name}` : name;
  return ed.representation?.includes('xmlAttr') ? '@_' + qualified : qualified;
}

/**
 * Returns the logical name of an element of an XML logical model, e.g. "use" for `@_use`, "xmlText" for `#text`,
 * or "sdtcRaceCode" for `sdtc:raceCode`. Issue paths use these names, so that they are valid FHIRPath on the model.
 * @param element - The element definition.
 * @returns The logical name.
 */
export function getXmlLogicalName(element: InternalSchemaElement): string {
  return element.path.slice(element.path.lastIndexOf('.') + 1);
}

/**
 * Finds an element of an XML logical model by its logical name. FHIRPath constraints in the model use these names.
 * @param schema - The type schema.
 * @param name - The logical name, e.g. "xmlText".
 * @returns The element definition, if found.
 */
export function getXmlElementByLogicalName(
  schema: InternalTypeSchema,
  name: string
): InternalSchemaElement | undefined {
  return Object.values(schema.elements).find((e) => getXmlLogicalName(e) === name);
}

/**
 * Returns true for child elements whose values are XML elements of a complex type, as opposed to attributes,
 * text content, or markup (e.g. CDA narrative).
 * @param element - The element definition.
 * @returns True if the element's values are XML elements of a complex type.
 */
export function isXmlChildElement(element: InternalSchemaElement): boolean {
  return element.xmlName !== undefined && element.xmlName !== '#text' && !element.xmlAttribute && !element.xmlMarkup;
}

/**
 * Returns the typed value of a property of a parsed XML element.
 * @param parent - The parsed XML element.
 * @param element - The element definition of the property.
 * @returns The typed value or values, or undefined if the property is absent.
 */
export function getXmlPropertyValue(
  parent: unknown,
  element: InternalSchemaElement
): TypedValue[] | TypedValue | undefined {
  const value = normalizeXmlPropertyValue((parent as Record<string, unknown>)[element.xmlName as string], element);
  if (value === undefined) {
    return undefined;
  }
  const type = element.type[0].code;
  const toTyped = isXmlChildElement(element) ? toXmlTypedValue : (v: unknown): TypedValue => ({ type, value: v });
  return Array.isArray(value) ? value.map((v) => toTyped(v, type)) : toTyped(value, type);
}

/**
 * Normalizes a property value as parsed from XML, which does not follow the cardinality of the model:
 * - Elements that occur once may or may not be wrapped in arrays
 * - Empty elements (e.g. `<time/>`) parse to empty strings, but are present
 * - List attributes are whitespace-separated, e.g. `use="HP WP"`
 * @param value - The parsed property value.
 * @param element - The element definition.
 * @returns The normalized value, or undefined if the property is absent.
 */
function normalizeXmlPropertyValue(value: unknown, element: InternalSchemaElement): unknown {
  if (element.xmlAttribute) {
    if (element.isArray && typeof value === 'string' && value.trim()) {
      return value.trim().split(/\s+/);
    }
    return isEmpty(value) ? undefined : value;
  }

  let result = value;
  if (element.isArray && result !== undefined && !Array.isArray(result)) {
    result = [result];
  } else if (!element.isArray && Array.isArray(result) && result.length === 1) {
    result = result[0];
  }

  if (isXmlChildElement(element)) {
    if (result === '') {
      return {};
    }
    return Array.isArray(result) && result.length === 0 ? undefined : (result ?? undefined);
  }
  return isEmpty(result) ? undefined : result;
}

/**
 * Types the value of an XML child element: text-only elements parse to plain strings, and `xsi:type`
 * selects a specialization of the declared type (e.g. CE for CD, or PQ for ANY).
 * @param value - The parsed element value.
 * @param type - The declared type.
 * @returns The typed value.
 */
function toXmlTypedValue(value: unknown, type: string): TypedValue {
  if (value === '') {
    return { type, value: {} };
  }
  if (typeof value === 'string') {
    return { type, value: { '#text': value } };
  }
  const xsiType = getXsiType(value);
  return { type: (xsiType && resolveXsiType(type, xsiType)) || type, value };
}

/** Logical model type URLs by XML Schema type name, e.g. "IVL_TS" to ".../StructureDefinition/IVL-TS". */
const XSI_TYPES: Record<string, string> = Object.create(null);

/** Base type URLs of logical model types, e.g. CE to CD. */
const XSI_BASE_TYPES: Record<string, string> = Object.create(null);

/**
 * Indexes a logical model type by its XML Schema type name, so that `xsi:type` attributes can be resolved.
 * @param sd - The StructureDefinition of the type.
 */
export function indexXsiType(sd: StructureDefinition): void {
  XSI_TYPES[getXsiTypeKey(sd.url, sd.name)] = sd.url;
  if (sd.baseDefinition) {
    XSI_BASE_TYPES[sd.url] = sd.baseDefinition;
  }
}

function getXsiTypeKey(url: string, name: string): string {
  return url.slice(0, url.lastIndexOf('/') + 1) + name;
}

function getXsiType(value: unknown): string | undefined {
  const xsiType = typeof value === 'object' && value ? (value as Record<string, unknown>)['@_xsi:type'] : undefined;
  return typeof xsiType === 'string' ? xsiType : undefined;
}

/**
 * Resolves an `xsi:type` attribute to a logical model type, in the same model as the declared type.
 * @param declaredType - The type URL declared by the element definition.
 * @param xsiType - The `xsi:type` attribute value, e.g. "CE" or "v3:IVL_TS".
 * @returns The type URL, or undefined if the type is unknown.
 */
export function resolveXsiType(declaredType: string, xsiType: string): string | undefined {
  return XSI_TYPES[getXsiTypeKey(declaredType, xsiType.slice(xsiType.indexOf(':') + 1))];
}

function isXsiSpecialization(type: string, expected: string): boolean {
  for (let t: string | undefined = type; t; t = XSI_BASE_TYPES[t]) {
    if (t === expected) {
      return true;
    }
  }
  return false;
}

/**
 * Checks the `xsi:type` of an XML child element, which must name the declared type or one of its specializations.
 * @param value - The parsed element value.
 * @param element - The element definition.
 * @returns An error message, or undefined if the element has no `xsi:type` or it is allowed.
 */
export function getXsiTypeError(value: unknown, element: InternalSchemaElement): string | undefined {
  const xsiType = getXsiType(value);
  if (!xsiType) {
    return undefined;
  }
  const resolved = resolveXsiType(element.type[0].code, xsiType);
  if (!resolved) {
    return `Unknown xsi:type "${xsiType}"`;
  }
  if (!element.type.some((t) => isXsiSpecialization(resolved, t.code))) {
    return `Invalid xsi:type "${xsiType}" for this element`;
  }
  return undefined;
}

/** Lexical forms of XML attribute types, by FHIR type name. */
const XML_ATTRIBUTE_PATTERNS: Record<string, RegExp> = {
  boolean: /^(true|false)$/,
  integer: /^[+-]?\d+$/,
  decimal: /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/,
  // The CDA XML Schema "ts" pattern, e.g. "20240101120000-0500"
  dateTime: /^(\d{1,8}|(\d{9,14}|\d{14}\.\d+)([+-]\d{1,4})?)$/,
};

/** FHIRPath system types used by XML logical models, by FHIR type name. */
const FHIRPATH_SYSTEM_TYPES: Record<string, string> = {
  'http://hl7.org/fhirpath/System.Boolean': 'boolean',
  'http://hl7.org/fhirpath/System.Integer': 'integer',
  'http://hl7.org/fhirpath/System.Decimal': 'decimal',
  'http://hl7.org/fhirpath/System.DateTime': 'dateTime',
};

/**
 * Checks an XML attribute value, which is always a string, against the lexical form of its type.
 * @param value - The parsed attribute value.
 * @param type - The attribute type, e.g. "boolean" or "http://hl7.org/fhirpath/System.Boolean".
 * @returns An error message, or undefined if the value is valid.
 */
export function getXmlAttributeError(value: unknown, type: string): string | undefined {
  if (typeof value !== 'string') {
    return 'Invalid XML attribute value';
  }
  const name = FHIRPATH_SYSTEM_TYPES[type] ?? type;
  const pattern = XML_ATTRIBUTE_PATTERNS[name];
  return pattern && !pattern.test(value) ? `Invalid ${name} format` : undefined;
}

/**
 * Returns true for XML namespace declarations and XML Schema instance attributes, which may appear on any element.
 * @param key - The parsed property name.
 * @returns True if the property is an XML infrastructure attribute.
 */
export function isXmlInfrastructureAttribute(key: string): boolean {
  return key.startsWith('@_xmlns') || key === '@_xsi:type' || key === '@_xsi:schemaLocation';
}

/**
 * Describes a parsed XML property for issue messages and paths, e.g. `@_unit` as the attribute "unit".
 * @param key - The parsed property name.
 * @returns The kind of XML node and its name.
 */
export function describeXmlProperty(key: string): { kind: 'attribute' | 'element' | 'text'; name: string } {
  if (key === '#text') {
    return { kind: 'text', name: 'xmlText' };
  }
  return key.startsWith('@_') ? { kind: 'attribute', name: key.slice(2) } : { kind: 'element', name: key };
}
