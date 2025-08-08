// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCcdaToFhir } from './ccda-to-fhir';
import { convertXmlToCcda } from './xml';

const testDataFolder = resolve(__dirname, '../testdata');

const testData = [
  '170.315_b1_toc_amb_ccd_r11_sample1_v9.xml',
  '170.315_b1_toc_amb_ccd_r21_sample1_v13.xml',
  '170.315_b1_toc_amb_ccd_r21_sample2_v11.xml',
  '170.315_b1_toc_amb_r11_sample1_v8.xml',
  '170.315_b1_toc_amb_rn_r21_sample1_v13.xml',
  '170.315_b1_toc_amb_rn_r21_sample2_v11.xml',
];

describe('170.315(b)(1)', () => {
  test.each(testData)('should parse %s', (name) => {
    const ccda = convertXmlToCcda(readFileSync(join(testDataFolder, name), 'utf8'));
    const result = convertCcdaToFhir(ccda);
    expect(result).toBeDefined();
  });
});
