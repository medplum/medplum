// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { indexCdaDefinitions, validateCcda } from './validate';
import { convertXmlToCcda } from './xml';

function readTestData(name: string): string {
  return readFileSync(resolve(import.meta.dirname, '../testdata', name), 'utf8');
}

function errors(xml: string): string[] {
  return validateCcda(xml)
    .filter((i) => i.severity === 'error')
    .map((i) => `${i.expression?.[0]}: ${i.details?.text}`);
}

const R11 = readTestData('170.315_b1_toc_amb_r11_sample1_v8.xml');
const R21 = readTestData('170.315_b1_toc_amb_ccd_r21_sample1_v13.xml');

describe('validateCcda', () => {
  test('Requires the CDA definitions', () => {
    expect(() => validateCcda(R21)).toThrow('CDA definitions not loaded; call indexCdaDefinitions first');
  });

  describe('With CDA definitions', () => {
    beforeAll(() => {
      indexCdaDefinitions(readJson('fhir/cda/hl7.cda.uv.core-2.0.0-sd.json'));
    });

    test('Valid documents', () => {
      expect(errors(R11)).toEqual([]);
      expect(errors(R21)).toEqual([]);
    });

    test('Malformed XML', () => {
      expect(errors(R21.replace('<title>', '<title><b>'))).toEqual([
        expect.stringMatching(/^ClinicalDocument: Expected closing tag 'b' .*\(line \d+, column \d+\)$/),
      ]);
    });

    test('Not a ClinicalDocument', () => {
      expect(errors('<Patient xmlns="urn:hl7-org:v3"/>')).toEqual([
        'ClinicalDocument: Root element must be ClinicalDocument',
      ]);
    });

    test('Structure and data type errors', () => {
      const xml = R11.replace(/<typeId\s+root="[^"]*"/, '<typeId')
        .replace(/<effectiveTime\s+value="20120806"\/>/, '<effectiveTime value="2012-08-06"/>')
        .replace('</recordTarget>', '<unknown/></recordTarget>');
      expect(errors(xml)).toEqual([
        'ClinicalDocument.typeId.root: Missing required property',
        'ClinicalDocument.effectiveTime.value: Invalid dateTime format',
        'ClinicalDocument.recordTarget[0].unknown: Invalid additional element "unknown"',
      ]);
    });

    test('Repeated single element', () => {
      const xml = R11.replace(
        /<effectiveTime\s+value="20120806"\/>/,
        '<effectiveTime value="20120806"/><effectiveTime value="20120807"/>'
      );
      expect(errors(xml)).toEqual(['ClinicalDocument.effectiveTime: Expected single value for property']);
      // The converter keeps the first occurrence
      expect(convertXmlToCcda(xml).effectiveTime).toEqual({ '@_value': '20120806' });
    });
  });
});
