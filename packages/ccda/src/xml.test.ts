// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { convertToCompactXml, convertXmlToCcda, parseXml } from './xml';

describe('convertToCompactXml', () => {
  test('empty string', () => {
    expect(convertToCompactXml('')).toEqual('');
  });

  test('string', () => {
    expect(convertToCompactXml('Hello World')).toEqual('Hello World');
  });

  test('should preserve attributes', () => {
    const original = '<myElement id="123">John Doe</myElement>';
    const parsed = parseXml(original);
    expect(parsed).toMatchObject({
      myElement: {
        '#text': 'John Doe',
        '@_id': '123',
      },
    });
    const xml = convertToCompactXml(parsed);
    expect(xml).toEqual(original);
  });

  test('removes newlines and surrounding whitespace', () => {
    const parsed = parseXml('<content>line1\n   line2</content>');
    expect(convertToCompactXml(parsed)).toEqual('<content>line1line2</content>');
  });

  test('stays linear on long newline-free whitespace runs', () => {
    // Narrative whitespace is attacker-controlled; a backtracking regex here is a DoS vector
    const parsed = parseXml(`<content>a${' '.repeat(200_000)}b</content>`);
    const start = performance.now();
    const result = convertToCompactXml(parsed);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(result.length).toEqual('<content>ab</content>'.length + 200_000);
  });
});

describe('convertXmlToCcda', () => {
  test('wraps array paths, including namespaced sdtc:raceCode', () => {
    const ccda = convertXmlToCcda(`<ClinicalDocument xmlns="urn:hl7-org:v3">
      <recordTarget>
        <patientRole>
          <patient>
            <name use="L"><given>Alice</given></name>
            <sdtc:raceCode code="2106-3" codeSystem="2.16.840.1.113883.6.238"/>
          </patient>
        </patientRole>
      </recordTarget>
    </ClinicalDocument>`);
    const patient = ccda.recordTarget?.[0]?.patientRole?.patient as Record<string, unknown>;
    expect(Array.isArray(patient['name'])).toBe(true);
    expect(Array.isArray(patient['sdtc:raceCode'])).toBe(true);
  });

  test('does not wrap attributes whose names collide with array paths', () => {
    // Attribute values must stay plain strings, even when named like an array path (e.g. narrative linkHtml name=)
    const ccda = convertXmlToCcda(`<ClinicalDocument xmlns="urn:hl7-org:v3">
      <id root="1.2.3" name="not-an-array"/>
    </ClinicalDocument>`);
    expect(ccda.id?.[0]?.['@_name' as keyof (typeof ccda.id)[0]]).toEqual('not-an-array');
  });

  test('matches array paths on whole tag segments only', () => {
    // "nickname" must not match the "name.given" array path via character suffix
    const ccda = convertXmlToCcda(`<ClinicalDocument xmlns="urn:hl7-org:v3">
      <nickname><given>Bob</given></nickname>
    </ClinicalDocument>`) as Record<string, any>;
    expect(ccda.nickname.given).toEqual('Bob');
  });

  test('repeated parses of the same document are identical', () => {
    const xml = `<ClinicalDocument xmlns="urn:hl7-org:v3">
      <id root="1.2.3"/>
      <recordTarget><patientRole><patient><name><given>Alice</given></name></patient></patientRole></recordTarget>
    </ClinicalDocument>`;
    expect(convertXmlToCcda(xml)).toStrictEqual(convertXmlToCcda(xml));
  });
});
