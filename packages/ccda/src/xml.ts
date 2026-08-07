// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MatcherView, XmlBuilderOptions } from 'fast-xml-parser';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { XSI_URL } from './systems';
import type { Ccda } from './types';

const ARRAY_PATHS = [
  'ClinicalDocument.participant',
  'ClinicalDocument.recordTarget',

  // Always arrays
  '.id',
  '.templateId',
  '.name',
  '.addr',
  '.telecom',
  '.streetAddressLine',
  '.author',
  '.effectiveTime',

  // Name
  'name.given',
  'name.suffix',
  'name.prefix',

  // Patient
  'patient.raceCode',
  'patient.sdtc:raceCode',
  'patient.ethnicGroupCode',
  'patient.languageCommunication',

  // Document structure arrays
  'component.structuredBody.component',
  'component.structuredBody.component.section',
  'component.section',
  'component.observation',
  'component.act',

  'code.translation',
  'value.translation',
  'routeCode.translation',
  'methodCode.translation',
  'targetSiteCode.translation',
  'approachSiteCode.translation',
  'administrationUnitCode.translation',

  'section.entry',

  'entry.act',
  'entry.organizer',
  'entry.substanceAdministration',
  'entry.observation',
  'entry.encounter',
  'entry.procedure',

  'encounter.performer',
  'encounter.participant',
  'encounter.entryRelationship',

  'entryRelationship.observation',
  'entryRelationship.substanceAdministration',
  'entryRelationship.act',

  'organizer.component',

  'substanceAdministration.consumable.manufacturedProduct',
  'substanceAdministration.entryRelationship',
  'substanceAdministration.performer',

  // Act paths
  'act.entryRelationship',
  'act.performer',

  // Observation paths
  'observation.participant',
  'observation.entryRelationship',
  'observation.referenceRange',

  'consumable.manufacturedProduct',

  'manufacturedProduct.manufacturedMaterial',
  'manufacturedProduct.manufacturerOrganization',
  'manufacturedProduct.manufacturedLabeledDrug',

  'manufacturedMaterial.code',
  'manufacturedMaterial.lotNumberText',
];

/**
 * ARRAY_PATHS indexed by their last tag, so the parser can match each tag path with one Map
 * lookup instead of building a jPath string and scanning ARRAY_PATHS with endsWith on every
 * tag and attribute. A value of `true` means the tag is always an array; otherwise at least
 * one of the listed parent-tag suffixes (nearest parent first) must match.
 */
const ARRAY_PATH_MATCHERS = new Map<string, true | string[][]>();
for (const path of ARRAY_PATHS) {
  const segments = path.replace(/^\./, '').split('.');
  const tag = segments.pop() as string;
  const existing = ARRAY_PATH_MATCHERS.get(tag);
  if (segments.length === 0) {
    ARRAY_PATH_MATCHERS.set(tag, true);
  } else if (existing !== true) {
    ARRAY_PATH_MATCHERS.set(tag, [...(existing ?? []), segments.reverse()]);
  }
}

// Parser and builder instances are stateless across calls, so they are created once and reused.
const ccdaParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  jPath: false,
  isArray: (tagName, matcher, _isLeafNode, isAttribute) => {
    if (isAttribute) {
      return false;
    }
    const parentSuffixes = ARRAY_PATH_MATCHERS.get(tagName);
    if (!parentSuffixes) {
      return false;
    }
    if (parentSuffixes === true) {
      return true;
    }
    // With jPath: false, the matcher is a live MatcherView whose path ends with the current tag
    const path = (matcher as MatcherView).toArray();
    return parentSuffixes.some((parents) => parents.every((parent, i) => path[path.length - 2 - i] === parent));
  },
});

/**
 * The builders never register path-based callbacks, so skip per-node jPath string building.
 * fast-xml-builder supports jPath: false at runtime, but XmlBuilderOptions omits it.
 */
const builderPerfOptions = { jPath: false } as XmlBuilderOptions;

const ccdaBuilder = new XMLBuilder({
  ...builderPerfOptions,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressBooleanAttributes: false,
  suppressEmptyNode: true,
});

const genericParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
});

const compactBuilder = new XMLBuilder({
  ...builderPerfOptions,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: false,
  suppressBooleanAttributes: false,
  suppressEmptyNode: true,
});

export function convertXmlToCcda(xml: string): Ccda {
  const parsedData = ccdaParser.parse(xml);
  return parsedData.ClinicalDocument;
}

export function convertCcdaToXml(ccda: Ccda): string {
  return ccdaBuilder.build({
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    '?xml-stylesheet': { '@_type': 'text/xsl', '@_href': 'CDA.xsl' },
    ClinicalDocument: {
      '@_xmlns': 'urn:hl7-org:v3',
      '@_xmlns:xsi': XSI_URL,
      '@_xmlns:voc': 'urn:hl7-org:v3/voc',
      '@_xmlns:sdtc': 'urn:hl7-org:sdtc',
      ...ccda,
    },
  });
}

export function parseXml(xml: string): any {
  return genericParser.parse(xml);
}

export function convertToCompactXml(obj: any): string {
  if (!obj) {
    return '';
  }
  if (typeof obj === 'string') {
    return obj;
  }
  const xml = compactBuilder.build(obj);
  // Trim each line and join. Not a regex: \s*\n\s* patterns backtrack quadratically on untrusted whitespace
  return xml
    .split('\n')
    .map((line: string) => line.trim())
    .join('');
}
