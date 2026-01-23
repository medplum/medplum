// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import {
  formatPatientPageTabUrl,
  getPatientPageTabOrThrow,
  PatientPageTabs,
  patientPathPrefix,
  prependPatientPath,
} from './PatientPage.utils';

describe('PatientPage.utils', () => {
  describe('patientPathPrefix', () => {
    test('returns correct path prefix for patient ID', () => {
      expect(patientPathPrefix('123')).toBe('/Patient/123');
      expect(patientPathPrefix('patient-456')).toBe('/Patient/patient-456');
      expect(patientPathPrefix('abc-def-ghi')).toBe('/Patient/abc-def-ghi');
    });

    test('handles empty string patient ID', () => {
      expect(patientPathPrefix('')).toBe('/Patient/');
    });
  });

  describe('prependPatientPath', () => {
    const mockPatient: WithId<Patient> = {
      resourceType: 'Patient',
      id: 'patient-123',
    };

    test('prepends patient path when patient has ID', () => {
      expect(prependPatientPath(mockPatient, 'edit')).toBe('/Patient/patient-123/edit');
      expect(prependPatientPath(mockPatient, '/edit')).toBe('/Patient/patient-123/edit');
      expect(prependPatientPath(mockPatient, 'Encounter')).toBe('/Patient/patient-123/Encounter');
    });

    test('handles path without leading slash', () => {
      expect(prependPatientPath(mockPatient, 'edit')).toBe('/Patient/patient-123/edit');
      expect(prependPatientPath(mockPatient, 'Task')).toBe('/Patient/patient-123/Task');
    });

    test('handles path with leading slash', () => {
      expect(prependPatientPath(mockPatient, '/edit')).toBe('/Patient/patient-123/edit');
      expect(prependPatientPath(mockPatient, '/Encounter')).toBe('/Patient/patient-123/Encounter');
    });

    test('returns original path when patient is undefined', () => {
      expect(prependPatientPath(undefined, 'edit')).toBe('edit');
      expect(prependPatientPath(undefined, '/edit')).toBe('/edit');
      expect(prependPatientPath(undefined, 'Encounter')).toBe('Encounter');
    });

    test('returns original path when patient has no ID', () => {
      const patientWithoutId: Patient = {
        resourceType: 'Patient',
      };
      expect(prependPatientPath(patientWithoutId, 'edit')).toBe('edit');
      expect(prependPatientPath(patientWithoutId, '/edit')).toBe('/edit');
    });

    test('handles empty path string', () => {
      expect(prependPatientPath(mockPatient, '')).toBe('/Patient/patient-123/');
      expect(prependPatientPath(undefined, '')).toBe('');
    });
  });

  describe('formatPatientPageTabUrl', () => {
    test('formats URL with patient ID replacement', () => {
      const tab = {
        id: 'encounter',
        url: 'Encounter?patient=%patient.id',
        label: 'Visits',
      };
      expect(formatPatientPageTabUrl('patient-123', tab)).toBe('/Patient/patient-123/Encounter?patient=patient-123');
    });

    test('handles tab with empty URL', () => {
      const tab = {
        id: 'timeline',
        url: '',
        label: 'Timeline',
      };
      expect(formatPatientPageTabUrl('patient-456', tab)).toBe('/Patient/patient-456/');
    });

    test('handles tab URL without patient.id placeholder', () => {
      const tab = {
        id: 'labs',
        url: 'labs',
        label: 'Labs',
      };
      expect(formatPatientPageTabUrl('patient-789', tab)).toBe('/Patient/patient-789/labs');
    });

    test('handles multiple patient.id placeholders (replaces only first)', () => {
      const tab = {
        id: 'test',
        url: 'Resource?patient=%patient.id&other=%patient.id',
        label: 'Test',
      };
      // replace() only replaces the first occurrence
      expect(formatPatientPageTabUrl('patient-123', tab)).toBe(
        '/Patient/patient-123/Resource?patient=patient-123&other=%patient.id'
      );
    });

    test('handles complex query string with patient.id placeholder', () => {
      const tab = PatientPageTabs.find((t) => t.id === 'encounter');
      if (tab) {
        const result = formatPatientPageTabUrl('patient-123', tab);
        expect(result).toContain('/Patient/patient-123/Encounter');
        expect(result).toContain('patient=patient-123');
        expect(result).not.toContain('%patient.id');
      }
    });
  });

  describe('getPatientPageTabOrThrow', () => {
    test('returns tab when found', () => {
      const timelineTab = getPatientPageTabOrThrow('timeline');
      expect(timelineTab.id).toBe('timeline');
      expect(timelineTab.url).toBe('');
      expect(timelineTab.label).toBe('Timeline');

      const editTab = getPatientPageTabOrThrow('edit');
      expect(editTab.id).toBe('edit');
      expect(editTab.url).toBe('edit');
      expect(editTab.label).toBe('Edit');

      const medsTab = getPatientPageTabOrThrow('meds');
      expect(medsTab.id).toBe('meds');
      expect(medsTab.label).toBe('Meds');
    });

    test('throws error when tab not found', () => {
      expect(() => getPatientPageTabOrThrow('nonexistent')).toThrow(
        'Could not find patient page tab with id nonexistent'
      );
      expect(() => getPatientPageTabOrThrow('invalid-tab')).toThrow(
        'Could not find patient page tab with id invalid-tab'
      );
    });

    test('finds all defined tabs', () => {
      const tabIds = [
        'timeline',
        'edit',
        'encounter',
        'tasks',
        'meds',
        'labs',
        'devices',
        'documentreference',
        'careplan',
        'message',
        'dosespot',
        'export',
      ];
      for (const tabId of tabIds) {
        const tab = getPatientPageTabOrThrow(tabId);
        expect(tab).toBeDefined();
        expect(tab.id).toBe(tabId);
        expect(tab.url).toBeDefined();
        expect(tab.label).toBeDefined();
      }
    });
  });

  describe('PatientPageTabs', () => {
    test('is an array', () => {
      expect(Array.isArray(PatientPageTabs)).toBe(true);
    });

    test('contains expected tabs', () => {
      const tabIds = PatientPageTabs.map((tab) => tab.id);
      expect(tabIds).toContain('timeline');
      expect(tabIds).toContain('edit');
      expect(tabIds).toContain('encounter');
      expect(tabIds).toContain('tasks');
      expect(tabIds).toContain('meds');
      expect(tabIds).toContain('labs');
      expect(tabIds).toContain('devices');
      expect(tabIds).toContain('documentreference');
      expect(tabIds).toContain('careplan');
      expect(tabIds).toContain('message');
      expect(tabIds).toContain('dosespot');
      expect(tabIds).toContain('export');
    });

    test('all tabs have required properties', () => {
      for (const tab of PatientPageTabs) {
        expect(tab).toHaveProperty('id');
        expect(tab).toHaveProperty('url');
        expect(tab).toHaveProperty('label');
        expect(typeof tab.id).toBe('string');
        expect(typeof tab.url).toBe('string');
        expect(typeof tab.label).toBe('string');
      }
    });

    test('timeline tab has empty URL', () => {
      const timelineTab = PatientPageTabs.find((tab) => tab.id === 'timeline');
      expect(timelineTab).toBeDefined();
      expect(timelineTab?.url).toBe('');
    });

    test('tabs with patient.id placeholder contain the placeholder', () => {
      const tabsWithPlaceholder = PatientPageTabs.filter((tab) => tab.url.includes('%patient.id'));
      expect(tabsWithPlaceholder.length).toBeGreaterThan(0);
      for (const tab of tabsWithPlaceholder) {
        expect(tab.url).toContain('%patient.id');
      }
    });

    test('tasks tab has correct URL', () => {
      const tasksTab = PatientPageTabs.find((tab) => tab.id === 'tasks');
      expect(tasksTab).toBeDefined();
      expect(tasksTab?.url).toBe('Task');
      expect(tasksTab?.label).toBe('Tasks');
    });
  });
});
