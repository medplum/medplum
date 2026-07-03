// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { XmlBuilderOptions } from 'fast-xml-parser';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { MatcherView } from 'path-expression-matcher';
import { Expression, ExpressionSet } from 'path-expression-matcher';
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
 * ARRAY_PATHS precompiled into an indexed ExpressionSet ("name.given" → "..name.given").
 * Entries are suffix patterns, except for paths anchored at the document root.
 * Lets the parser match each tag path in O(1) instead of building a jPath string and
 * scanning ARRAY_PATHS with endsWith on every tag and attribute.
 */
const ARRAY_PATH_EXPRESSIONS = new ExpressionSet();
for (const path of ARRAY_PATHS) {
  const pattern = path.startsWith('ClinicalDocument') ? path : '..' + path.replace(/^\./, '');
  ARRAY_PATH_EXPRESSIONS.add(new Expression(pattern));
}
ARRAY_PATH_EXPRESSIONS.seal();

// Parser and builder instances are stateless across calls, so they are created once and reused.
const ccdaParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  jPath: false,
  // Cast: fast-xml-parser's copy of the MatcherView typings is missing matchesAny
  isArray: (_tagName, matcher, _isLeafNode, isAttribute) =>
    !isAttribute && (matcher as MatcherView).matchesAny(ARRAY_PATH_EXPRESSIONS),
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
