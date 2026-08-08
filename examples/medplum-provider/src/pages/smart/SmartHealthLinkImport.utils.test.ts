// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type {
  AllergyIntolerance,
  Bundle,
  BundleEntry,
  Condition,
  DiagnosticReport,
  DocumentReference,
  Immunization,
  Observation,
  Patient,
  Resource,
} from '@medplum/fhirtypes';
import { describe, expect, test, vi } from 'vitest';
import {
  buildSmartHealthLinkImportBundle,
  getImportButtonLabel,
  getResourceTypeLabel,
  getSmartHealthCardFile,
  getSmartHealthLinkPatient,
  isExpired,
  sortImportableEntries,
  uploadInlineAttachments,
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
  subject: { reference: 'Patient/shared-patient' },
  code: {
    coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c' }],
  },
  effectiveDateTime: '2026-05-30T12:00:00Z',
};

const diagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'diagnostic-report-1',
  status: 'final',
  subject: { reference: 'Patient/shared-patient' },
  result: [{ reference: 'Observation/observation-1' }],
  code: {
    coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC panel' }],
  },
  effectiveDateTime: '2026-05-30T12:00:00Z',
};

const immunization: Immunization = {
  resourceType: 'Immunization',
  id: 'immunization-1',
  status: 'completed',
  patient: { reference: 'Patient/shared-patient' },
  vaccineCode: {
    coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code: '207', display: 'COVID-19, mRNA' }],
  },
  occurrenceDateTime: '2026-04-01T12:00:00Z',
};

const allergyIntolerance: AllergyIntolerance = {
  resourceType: 'AllergyIntolerance',
  id: 'allergy-1',
  patient: { reference: 'Patient/shared-patient' },
  code: {
    coding: [{ system: 'http://snomed.info/sct', code: '762952008', display: 'Peanut' }],
  },
  recordedDate: '2026-06-01T12:00:00Z',
};

const documentReference: DocumentReference = {
  resourceType: 'DocumentReference',
  id: 'document-reference-1',
  status: 'current',
  subject: { reference: 'Patient/shared-patient' },
  type: {
    coding: [{ system: 'http://loinc.org', code: '60591-5', display: 'Patient summary Document' }],
  },
  date: '2026-06-15T12:00:00Z',
  content: [
    {
      attachment: {
        contentType: 'application/pdf',
        data: 'JVBERi0=',
      },
    },
  ],
};

const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    { resource: sharedPatient },
    { resource: condition },
    { resource: observation },
    { resource: diagnosticReport },
    { resource: immunization },
    { resource: allergyIntolerance },
    { resource: documentReference },
  ],
};

const selectedKeys = new Set([
  'Patient/shared-patient',
  'Condition/condition-1',
  'Observation/observation-1',
  'DiagnosticReport/diagnostic-report-1',
  'Immunization/immunization-1',
  'AllergyIntolerance/allergy-1',
  'DocumentReference/document-reference-1',
]);

describe('SmartHealthLinkImport utils', () => {
  test('simplifies resource type labels', () => {
    expect(getResourceTypeLabel('AllergyIntolerance')).toBe('Allergy');
    expect(getResourceTypeLabel('MedicationRequest')).toBe('Medication (prescribed)');
    expect(getResourceTypeLabel('MedicationStatement')).toBe('Medication (reported)');
    expect(getResourceTypeLabel('DocumentReference')).toBe('Document');
    expect(getResourceTypeLabel('DiagnosticReport')).toBe('Report');
    // Unmapped types are humanized by splitting camelCase, which is why the map only carries
    // the types whose label differs from that.
    expect(getResourceTypeLabel('NutritionOrder')).toBe('Nutrition Order');
    expect(getResourceTypeLabel('CarePlan')).toBe('Care Plan');
    expect(getResourceTypeLabel('Observation')).toBe('Observation');
  });

  test('groups importable entries by type label, then by display string', () => {
    const sorted = sortImportableEntries([
      { resource: observation },
      { resource: documentReference },
      { resource: allergyIntolerance },
      { resource: diagnosticReport },
    ]);

    // Allergy, Document, Observation, Report — the friendly labels, not the raw resource types,
    // which would have ordered these AllergyIntolerance, DiagnosticReport, DocumentReference,
    // Observation instead.
    expect(sorted.map((entry) => getResourceTypeLabel(entry.resource?.resourceType as string))).toEqual([
      'Allergy',
      'Document',
      'Observation',
      'Report',
    ]);
  });

  test('does not mutate the array it sorts', () => {
    const entries: BundleEntry[] = [{ resource: observation }, { resource: allergyIntolerance }];
    sortImportableEntries(entries);
    expect(entries[0].resource).toBe(observation);
  });

  test('treats only past expirations as expired', () => {
    expect(isExpired(undefined)).toBe(false);
    expect(isExpired(new Date(Date.now() - 60_000).toISOString())).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });

  test('names the destination patient in the import button label', () => {
    expect(getImportButtonLabel(undefined, false)).toBe('Import Records');
    expect(getImportButtonLabel(sharedPatient, false)).toBe('Import Records to Jessica Argonaut');
    expect(getImportButtonLabel(sharedPatient, true)).toBe('Create Jessica Argonaut & Import Records');
  });

  test('finds SMART Health Card file payloads', () => {
    const file = { verifiableCredential: ['credential'] };
    expect(getSmartHealthCardFile([{ resourceType: 'Patient' }, file])).toBe(file);
  });

  test('finds the shared patient', () => {
    expect(getSmartHealthLinkPatient(bundle)).toBe(sharedPatient);
  });

  test('builds transaction bundle with patient references rewritten', () => {
    const result = buildSmartHealthLinkImportBundle(bundle, selectedKeys, sharedPatient, {
      ...sharedPatient,
      id: 'local-patient',
    });

    expect(result.type).toBe('transaction');
    expect(result.entry).toHaveLength(6);
    expect((findResource(result, 'Condition') as Condition).subject.reference).toBe('Patient/local-patient');
    expect((findResource(result, 'AllergyIntolerance') as AllergyIntolerance).patient.reference).toBe(
      'Patient/local-patient'
    );
    expect((findResource(result, 'Observation') as Observation).subject?.reference).toBe('Patient/local-patient');
    expect((findResource(result, 'DiagnosticReport') as DiagnosticReport).subject?.reference).toBe(
      'Patient/local-patient'
    );
  });

  test('rewrites patient references by patient entry fullUrl', () => {
    const patientFullUrl = 'urn:uuid:d8c63f84-d51c-469b-a4f8-abe3d04139fc';
    const documentReferenceFullUrl = 'urn:uuid:85f5f237-cf9b-4d34-9c49-58d15d51ab80';
    const result = buildSmartHealthLinkImportBundle(
      {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { fullUrl: patientFullUrl, resource: { ...sharedPatient, id: undefined } },
          {
            fullUrl: documentReferenceFullUrl,
            resource: {
              ...documentReference,
              id: undefined,
              subject: { reference: patientFullUrl },
              author: [{ reference: patientFullUrl }],
            },
          },
        ],
      },
      new Set([patientFullUrl, documentReferenceFullUrl]),
      { ...sharedPatient, id: undefined },
      { ...sharedPatient, id: 'local-patient' }
    );

    const importedDocumentReference = findResource(result, 'DocumentReference') as DocumentReference;
    expect(importedDocumentReference.subject?.reference).toBe('Patient/local-patient');
    expect(importedDocumentReference.author?.[0].reference).toBe('Patient/local-patient');
  });

  test('selects id-less bundle entries by fullUrl', () => {
    const result = buildSmartHealthLinkImportBundle(
      {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ fullUrl: 'urn:uuid:condition-1', resource: { ...condition, id: undefined } }],
      },
      new Set(['urn:uuid:condition-1']),
      sharedPatient,
      { ...sharedPatient, id: 'local-patient' }
    );

    expect(result.entry).toHaveLength(1);
    expect(result.entry?.[0].resource?.resourceType).toBe('Condition');
  });

  test('adds conditional create criteria for common clinical resources', () => {
    const result = buildSmartHealthLinkImportBundle(bundle, selectedKeys, sharedPatient, {
      ...sharedPatient,
      id: 'local-patient',
    });

    expect(findEntry(result, 'Condition').request?.ifNoneExist).toBe(
      'subject=Patient/local-patient&code=http://snomed.info/sct|44054006&date=2026-06-01'
    );
    expect(findEntry(result, 'Observation').request?.ifNoneExist).toBe(
      'subject=Patient/local-patient&code=http://loinc.org|4548-4&date=2026-05-30'
    );
    expect(findEntry(result, 'Immunization').request?.ifNoneExist).toBe(
      'patient=Patient/local-patient&vaccine-code=http://hl7.org/fhir/sid/cvx|207&date=2026-04-01'
    );
    // AllergyIntolerance has no `subject` search param — it must use `patient`.
    expect(findEntry(result, 'AllergyIntolerance').request?.ifNoneExist).toBe(
      'patient=Patient/local-patient&code=http://snomed.info/sct|762952008&date=2026-06-01'
    );
    expect(findEntry(result, 'DocumentReference').request?.ifNoneExist).toBe(
      'subject=Patient/local-patient&type=http://loinc.org|60591-5&date=2026-06-15'
    );
  });

  test('rewrites internal references between imported resources', () => {
    const result = buildSmartHealthLinkImportBundle(bundle, selectedKeys, sharedPatient, {
      ...sharedPatient,
      id: 'local-patient',
    });

    const importedObservation = findEntry(result, 'Observation');
    const importedDiagnosticReport = findResource(result, 'DiagnosticReport') as DiagnosticReport;
    expect(importedDiagnosticReport.result?.[0].reference).toBe(importedObservation.fullUrl);
  });

  test('externalizes inline attachment data to Binary URLs', async () => {
    const createAttachment = vi.fn().mockResolvedValue({
      contentType: 'application/pdf',
      url: 'Binary/uploaded-binary',
      title: undefined,
    });
    const medplum = { createAttachment } as unknown as MedplumClient;

    const bundleWithAttachment: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [{ resource: { ...documentReference } }],
    };

    await uploadInlineAttachments(medplum, bundleWithAttachment);

    expect(createAttachment).toHaveBeenCalledTimes(1);
    const options = createAttachment.mock.calls[0][0];
    expect(options.contentType).toBe('application/pdf');
    // Assert the decoded bytes rather than the class: `fetch` yields an undici Blob under jsdom,
    // so `expect.any(Blob)` would fail on realm identity even though the payload is correct.
    expect(await (options.data as Blob).text()).toBe('%PDF-');
    const uploadedAttachment = (bundleWithAttachment.entry?.[0].resource as DocumentReference).content?.[0].attachment;
    expect(uploadedAttachment?.url).toBe('Binary/uploaded-binary');
    expect(uploadedAttachment?.data).toBeUndefined();
  });

  test('leaves attachments that already have a URL untouched', async () => {
    const createAttachment = vi.fn();
    const medplum = { createAttachment } as unknown as MedplumClient;

    const bundleWithUrlAttachment: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          resource: {
            ...documentReference,
            content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/existing' } }],
          },
        },
      ],
    };

    await uploadInlineAttachments(medplum, bundleWithUrlAttachment);

    expect(createAttachment).not.toHaveBeenCalled();
  });

  test('leaves resources that share the Attachment shape untouched', async () => {
    const createAttachment = vi.fn();
    const medplum = { createAttachment } as unknown as MedplumClient;

    // A Binary carries contentType + data + no url, exactly like an inline Attachment. Uploading it
    // would strip its data and bolt on a url, leaving an invalid resource.
    const bundleWithBinary: Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [{ resource: { resourceType: 'Binary', contentType: 'application/pdf', data: 'JVBERi0=' } }],
    };

    await uploadInlineAttachments(medplum, bundleWithBinary);

    expect(createAttachment).not.toHaveBeenCalled();
    expect(bundleWithBinary.entry?.[0].resource).toEqual({
      resourceType: 'Binary',
      contentType: 'application/pdf',
      data: 'JVBERi0=',
    });
  });

  test('removes inbound server metadata', () => {
    const result = buildSmartHealthLinkImportBundle(bundle, new Set(['Condition/condition-1']), sharedPatient, {
      ...sharedPatient,
      id: 'local-patient',
    });

    const importedCondition = result.entry?.[0].resource as Condition;
    expect(importedCondition.id).toBeUndefined();
    expect(importedCondition.meta).toBeUndefined();
  });
});

function findEntry(bundle: Bundle, resourceType: string): BundleEntry {
  const entry = bundle.entry?.find((e) => e.resource?.resourceType === resourceType);
  if (!entry) {
    throw new Error(`Expected ${resourceType} entry`);
  }
  return entry;
}

function findResource(bundle: Bundle, resourceType: string): Resource {
  const resource = findEntry(bundle, resourceType).resource;
  if (!resource) {
    throw new Error(`Expected ${resourceType} resource`);
  }
  return resource;
}
