// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { XMLParser } from 'fast-xml-parser';
import { CDA_ELEMENTS } from './cda-elements';
import type { Ccda } from './types';

const NAMESPACE_PREFIXES: Record<string, string> = { 'urn:hl7-org:sdtc': 'sdtc' };

/**
 * Parses C-CDA XML, applying CDA cardinality from the CDA logical model.
 * @param xml - The C-CDA XML.
 * @param keepRepeatedSingleElements - Keep all occurrences of single elements that repeat (an error) as an
 *   array, so that validation can report them. Otherwise only the first occurrence is kept.
 * @returns The parsed ClinicalDocument, or undefined if the root element is not ClinicalDocument.
 */
export function parseCcdaXml(xml: string, keepRepeatedSingleElements: boolean): Ccda | undefined {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (_tagName, _jPath, _isLeafNode, isAttribute) => !isAttribute,
  });
  const parsedData = parser.parse(xml);
  return normalizeElement(parsedData.ClinicalDocument?.[0], 'ClinicalDocument', keepRepeatedSingleElements) as
    Ccda | undefined;
}

/**
 * Applies CDA cardinality to a parsed element whose child elements are all arrays: repeating
 * elements stay arrays, and single elements are unwrapped. Content the CDA model does not
 * describe, such as section narrative, is unwrapped wherever it occurs once.
 * @param node - The parsed element.
 * @param typeName - The CDA type of the element, if known.
 * @param keepRepeated - Keep all occurrences of single elements that repeat, as an array.
 * @returns The normalized element.
 */
function normalizeElement(node: unknown, typeName: string | undefined, keepRepeated: boolean): unknown {
  if (!node || typeof node !== 'object') {
    return node;
  }
  const element = node as Record<string, unknown>;
  const xsiType = element['@_xsi:type'];
  const elements =
    (typeof xsiType === 'string' ? CDA_ELEMENTS[xsiType.replace(/^.*:/, '')] : undefined) ??
    (typeName ? CDA_ELEMENTS[typeName] : undefined);

  // Build a new object to keep key order, which is the only record of order in mixed content (narrative)
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(element)) {
    if (!Array.isArray(value)) {
      result[name] = value;
      continue;
    }
    for (const [childName, children] of groupByNamespace(name, value)) {
      const child = elements?.[childName];
      const values = children.map((c) => normalizeElement(c, child?.replace('[]', '') || undefined, keepRepeated));
      if (child === undefined) {
        result[childName] = values.length === 1 ? values[0] : values;
      } else {
        result[childName] = child.endsWith('[]') || (keepRepeated && values.length > 1) ? values : values[0];
      }
    }
  }
  return result;
}

/**
 * Elements can redeclare the default namespace, e.g. `<raceCode xmlns="urn:hl7-org:sdtc"/>`, which the
 * XML parser does not resolve. Files such elements under their prefixed name, e.g. "sdtc:raceCode".
 * @param name - The element name.
 * @param values - The parsed elements with that name.
 * @returns The elements grouped by their qualified name.
 */
function groupByNamespace(name: string, values: unknown[]): Map<string, unknown[]> {
  const groups = new Map<string, unknown[]>();
  for (const value of values) {
    const namespace = value && typeof value === 'object' ? (value as Record<string, unknown>)['@_xmlns'] : undefined;
    const prefix = typeof namespace === 'string' ? NAMESPACE_PREFIXES[namespace] : undefined;
    const qualified = prefix && !name.includes(':') ? `${prefix}:${name}` : name;
    groups.set(qualified, [...(groups.get(qualified) ?? []), value]);
  }
  return groups;
}
