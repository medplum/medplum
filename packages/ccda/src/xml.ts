// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { parseCcdaXml } from './parse';
import { XSI_URL } from './systems';
import type { Ccda } from './types';

export function convertXmlToCcda(xml: string): Ccda {
  return parseCcdaXml(xml, false) as Ccda;
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
  const xml = builder.build(obj);
  return xml
    .split('\n')
    .map((line: string) => line.trim())
    .join('');
}
