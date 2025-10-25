// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { convertToCompactXml, parseXml } from './xml';

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
});
