// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Condition, Observation, Patient } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import {
  buildSmartHealthLinkImportBundle,
  getSmartHealthLinkPatient,
  getSmartHealthLinkResourceItems,
} from './SmartHealthLinkImport.utils';

const sharedPatient: Patient = {
  resourceType: 'Patient',
  id: 'shared-patient',
  name: [{ given: ['Jessica'], family: 'Argonaut' }],
  birthDate: '1985-03-15',
};

const condition: Condition = {
  resourceType: 'Condition',
  id: 'condition-1',
  subject: { reference: 'Patient/shared-patient' },
  code: {
    coding: [{ system: 'http://snomed.info/sct', code: '44054006', display: 'Diabetes mellitus type 2' }],
  },
  recordedDate: '2026-06-01T12:00:00Z',
  meta: {
    versionId: '2',
    lastUpdated: '2026-06-02T12:00:00Z',
    project: 'project-1',
  },
};

const observation: Observation = {
  resourceType: 'Observation',
  id: 'observation-1',
  status: 'final',
  subject: { reference: 'urn:uuid:patient-entry' },
  code: {
    coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' }],
  },
  effectiveDateTime: '2026-05-30T12:00:00Z',
};

const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    { fullUrl: 'urn:uuid:patient-entry', resource: sharedPatient },
    { fullUrl: 'urn:uuid:condition-entry', resource: condition },
    { fullUrl: 'urn:uuid:observation-entry', resource: observation },
  ],
};

describe('SmartHealthLinkImport utils', () => {
  test('finds the shared patient', () => {
    expect(getSmartHealthLinkPatient(bundle)).toBe(sharedPatient);
  });

  test('builds transaction bundle with patient references rewritten', () => {
    const items = getSmartHealthLinkResourceItems(bundle);
    const selectedKeys = new Set(items.map((item) => item.key));
    const result = buildSmartHealthLinkImportBundle(items, selectedKeys, sharedPatient, {
      ...sharedPatient,
      id: 'local-patient',
    });

    expect(result.type).toBe('transaction');
    expect(result.entry).toHaveLength(2);
    expect(result.entry?.[0].resource?.resourceType).toBe('Condition');
    expect((result.entry?.[0].resource as Condition).subject.reference).toBe('Patient/local-patient');
    expect((result.entry?.[1].resource as Observation | undefined)?.subject?.reference).toBe('Patient/local-patient');
  });

  test('adds conditional create criteria for common clinical resources', () => {
    const items = getSmartHealthLinkResourceItems(bundle);
    const selectedKeys = new Set(items.map((item) => item.key));
    const result = buildSmartHealthLinkImportBundle(items, selectedKeys, sharedPatient, {
      ...sharedPatient,
      id: 'local-patient',
    });

    expect(result.entry?.[0].request?.ifNoneExist).toBe(
      'subject=Patient/local-patient&code=http://snomed.info/sct|44054006&date=2026-06-01'
    );
    expect(result.entry?.[1].request?.ifNoneExist).toBe(
      'subject=Patient/local-patient&code=http://loinc.org|4548-4&date=2026-05-30'
    );
  });

  test('removes inbound server metadata', () => {
    const items = getSmartHealthLinkResourceItems(bundle);
    const result = buildSmartHealthLinkImportBundle(items, new Set([items[1].key]), sharedPatient, {
      ...sharedPatient,
      id: 'local-patient',
    });

    const importedCondition = result.entry?.[0].resource as Condition;
    expect(importedCondition.id).toBeUndefined();
    expect(importedCondition.meta).toBeUndefined();
  });
});
