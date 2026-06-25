// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtensionDisplayName } from './extensions';

describe('getExtensionDisplayName', () => {
  test('Empty URL falls back to "Extension"', () => {
    expect(getExtensionDisplayName(undefined)).toBe('Extension');
    expect(getExtensionDisplayName('')).toBe('Extension');
  });

  test('Humanizes the last path segment', () => {
    expect(getExtensionDisplayName('http://hl7.org/fhir/StructureDefinition/patient-birthPlace')).toBe(
      'Patient Birth Place'
    );
    expect(getExtensionDisplayName('http://example.com/my-ext')).toBe('My Ext');
  });

  test('Handles fragment URLs', () => {
    expect(getExtensionDisplayName('http://example.com/StructureDefinition#race')).toBe('Race');
  });
});
