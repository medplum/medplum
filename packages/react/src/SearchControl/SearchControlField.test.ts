// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getFieldDefinitions } from './SearchControlField';

describe('getFieldDefinitions', () => {
  test('prefix field names do not match in searchParam expressions', () => {
    const fieldDefs = getFieldDefinitions({
      resourceType: 'Patient',
      fields: ['id', 'identifier'],
    });

    expect(fieldDefs.length).toBe(2);
    const idField = fieldDefs.find((field) => field.name === 'id');
    const identifierField = fieldDefs.find((field) => field.name === 'identifier');

    expect(idField?.searchParams?.length).toBe(1);
    expect(idField?.searchParams?.find((sp) => sp.code === '_id')).toBeDefined();

    expect(identifierField?.searchParams?.length).toBe(1);
    expect(identifierField?.searchParams?.find((sp) => sp.code === 'identifier')).toBeDefined();
  });

  test('DiagnosticReport conclusion does not match conclusionCode search parameter', () => {
    const fieldDefs = getFieldDefinitions({
      resourceType: 'DiagnosticReport',
      fields: ['conclusion', 'conclusionCode'],
    });

    expect(fieldDefs.length).toBe(2);
    const conclusionField = fieldDefs.find((field) => field.name === 'conclusion');
    const conclusionCodeField = fieldDefs.find((field) => field.name === 'conclusionCode');

    expect(conclusionField?.elementDefinition?.path).toBe('DiagnosticReport.conclusion');
    expect(conclusionField?.searchParams).toBeUndefined();

    expect(conclusionCodeField?.elementDefinition?.path).toBe('DiagnosticReport.conclusionCode');
    expect(conclusionCodeField?.searchParams?.length).toBe(1);
    expect(conclusionCodeField?.searchParams?.[0]?.code).toBe('conclusion');
    expect(conclusionCodeField?.searchParams?.[0]?.expression).toBe('DiagnosticReport.conclusionCode');
  });
});
