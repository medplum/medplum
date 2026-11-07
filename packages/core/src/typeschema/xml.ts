// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ElementDefinition, StructureDefinition } from '@medplum/fhirtypes';
import { getExtension } from '../utils';
import type { InternalSchemaElement, InternalTypeSchema } from './types';

// Support for logical models of XML formats, such as the HL7 CDA StructureDefinitions, validated
// and typed in the shape an XML parser produces. See `LoadDataTypeOptions.xmlPropertyNames`.

const XML_NAME = 'http://hl7.org/fhir/tools/StructureDefinition/xml-name';
const XML_NAMESPACE = 'http://hl7.org/fhir/tools/StructureDefinition/xml-namespace';
const XML_CHOICE_GROUP = 'http://hl7.org/fhir/tools/StructureDefinition/xml-choice-group';
const XML_NAMESPACE_PREFIXES: Record<string, string> = {
  'urn:hl7-org:sdtc': 'sdtc',
  'http://www.w3.org/2001/XMLSchema-instance': 'xsi',
};

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
      renamed[ed ? xmlPropertyName(ed, key) : key] = element;
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
