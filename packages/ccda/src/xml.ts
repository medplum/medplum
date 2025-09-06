// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { XSI_URL } from './systems';
import { Ccda } from './types';

const ARRAY_PATHS = [
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

export function convertXmlToCcda(xml: string): Ccda {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (_tagName, jPath, _isLeafNode, _isAttribute) => ARRAY_PATHS.some((p) => jPath.endsWith(p)),
  });

  const parsedData = parser.parse(xml);
  return parsedData.ClinicalDocument;
}

export function convertCcdaToXml(ccda: Ccda): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressBooleanAttributes: false,
    suppressEmptyNode: true,
  });
  return builder.build({
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
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
  });
  return parser.parse(xml);
}

export function convertToCompactXml(obj: any): string {
  if (!obj) {
    return '';
  }
  if (typeof obj === 'string') {
    return obj;
  }
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: false,
    suppressBooleanAttributes: false,
    suppressEmptyNode: true,
  });
  const xml = builder.build(obj) as string;
  return xml
    .split('\n')
    .map((line: string) => line.trim())
    .join('');
}
