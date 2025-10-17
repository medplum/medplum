// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Patient, QuestionnaireResponse, Practitioner } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './sick-note-questionnaire-bot';

const contentType = 'application/fhir+json';

test('Returns null when sick note is not needed', async () => {
  const medplum = new MockClient();

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: createReference(HomerSimpson),
    author: createReference(DrAliceSmith),
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: false }],
      },
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBeNull();
});

test('Returns null when days of sick note is missing', async () => {
  const medplum = new MockClient();

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: createReference(HomerSimpson),
    author: createReference(DrAliceSmith),
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: true }],
      },
      // Missing days-of-sick-note answer
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBeNull();
});

test('Creates sick note PDF with basic information', async () => {
  const medplum = new MockClient();

  // Mock the createPdf method
  const mockBinary = { id: 'binary-123' };
  const createPdfSpy = vi.spyOn(medplum, 'createPdf').mockResolvedValue(mockBinary as any);

  // Mock the createResource method
  const mockDocumentReference = {
    id: 'doc-ref-123',
    resourceType: 'DocumentReference',
  };
  const createResourceSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(mockDocumentReference as any);

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: createReference(HomerSimpson),
    author: createReference(DrAliceSmith),
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: true }],
      },
      {
        linkId: 'days-of-sick-note',
        answer: [{ valueInteger: 3 }],
      },
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBe(mockDocumentReference);
  expect(createPdfSpy).toHaveBeenCalledWith({
    docDefinition: expect.objectContaining({
      content: expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('Please excuse Homer Simpson for 3 days.'),
        }),
      ]),
    }),
  });
  expect(createResourceSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      resourceType: 'DocumentReference',
      status: 'current',
      subject: createReference(HomerSimpson),
    })
  );

  createPdfSpy.mockRestore();
  createResourceSpy.mockRestore();
});

test('Creates sick note PDF with additional information', async () => {
  const medplum = new MockClient();

  const mockBinary = { id: 'binary-123' };
  const createPdfSpy = vi.spyOn(medplum, 'createPdf').mockResolvedValue(mockBinary as any);

  const mockDocumentReference = {
    id: 'doc-ref-123',
    resourceType: 'DocumentReference',
  };
  const createResourceSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(mockDocumentReference as any);

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: createReference(HomerSimpson),
    author: createReference(DrAliceSmith),
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: true }],
      },
      {
        linkId: 'days-of-sick-note',
        answer: [{ valueInteger: 5 }],
      },
      {
        linkId: 'other-information',
        answer: [{ valueString: 'Patient has flu symptoms and needs rest.' }],
      },
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBe(mockDocumentReference);
  expect(createPdfSpy).toHaveBeenCalledWith({
    docDefinition: expect.objectContaining({
      content: expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('Please excuse Homer Simpson for 5 days.'),
        }),
        expect.objectContaining({
          text: 'Patient has flu symptoms and needs rest.',
        }),
      ]),
    }),
  });

  createPdfSpy.mockRestore();
  createResourceSpy.mockRestore();
});

test('Creates sick note PDF with signature', async () => {
  const medplum = new MockClient();

  const mockBinary = { id: 'binary-123' };
  const createPdfSpy = vi.spyOn(medplum, 'createPdf').mockResolvedValue(mockBinary as any);

  const mockDocumentReference = {
    id: 'doc-ref-123',
    resourceType: 'DocumentReference',
  };
  const createResourceSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(mockDocumentReference as any);

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: createReference(HomerSimpson),
    author: createReference(DrAliceSmith),
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-signature',
        valueSignature: {
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          type: [
            { system: 'urn:iso-astm:E1762-95:2013', code: '1.2.840.10065.1.12.1.1', display: "Author's Signature" },
          ],
          when: '2023-01-01T00:00:00Z',
          who: createReference(DrAliceSmith),
        },
      },
    ],
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: true }],
      },
      {
        linkId: 'days-of-sick-note',
        answer: [{ valueInteger: 2 }],
      },
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBe(mockDocumentReference);
  expect(createPdfSpy).toHaveBeenCalledWith({
    docDefinition: expect.objectContaining({
      content: expect.arrayContaining([
        expect.objectContaining({
          image: expect.stringContaining(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
          ),
          width: 200,
          alignment: 'left',
        }),
      ]),
    }),
  });

  createPdfSpy.mockRestore();
  createResourceSpy.mockRestore();
});

test('Handles missing patient information gracefully', async () => {
  const medplum = new MockClient();

  const mockBinary = { id: 'binary-123' };
  const createPdfSpy = vi.spyOn(medplum, 'createPdf').mockResolvedValue(mockBinary as any);

  const mockDocumentReference = {
    id: 'doc-ref-123',
    resourceType: 'DocumentReference',
  };
  const createResourceSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(mockDocumentReference as any);

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: { reference: 'Patient/invalid-id' }, // Invalid patient ID
    author: createReference(DrAliceSmith),
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: true }],
      },
      {
        linkId: 'days-of-sick-note',
        answer: [{ valueInteger: 1 }],
      },
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBe(mockDocumentReference);
  expect(createPdfSpy).toHaveBeenCalledWith({
    docDefinition: expect.objectContaining({
      content: expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('Please excuse Patient for 1 days.'),
        }),
      ]),
    }),
  });

  createPdfSpy.mockRestore();
  createResourceSpy.mockRestore();
});

test('Handles missing practitioner information gracefully', async () => {
  const medplum = new MockClient();

  const mockBinary = { id: 'binary-123' };
  const createPdfSpy = vi.spyOn(medplum, 'createPdf').mockResolvedValue(mockBinary as any);

  const mockDocumentReference = {
    id: 'doc-ref-123',
    resourceType: 'DocumentReference',
  };
  const createResourceSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(mockDocumentReference as any);

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: createReference(HomerSimpson),
    author: { reference: 'Practitioner/invalid-id' }, // Invalid practitioner ID
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: true }],
      },
      {
        linkId: 'days-of-sick-note',
        answer: [{ valueInteger: 1 }],
      },
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBe(mockDocumentReference);
  expect(createPdfSpy).toHaveBeenCalledWith({
    docDefinition: expect.objectContaining({
      content: expect.arrayContaining([
        expect.objectContaining({
          text: 'Healthcare Provider',
        }),
      ]),
    }),
  });

  createPdfSpy.mockRestore();
  createResourceSpy.mockRestore();
});

test('Uses correct patient name from resource', async () => {
  const medplum = new MockClient();

  // Create a patient with specific name
  const patient: Patient & { id: string } = {
    resourceType: 'Patient',
    id: 'patient-123',
    name: [
      {
        given: ['John', 'Michael'],
        family: 'Doe',
      },
    ],
  };

  const mockBinary = { id: 'binary-123' };
  const createPdfSpy = vi.spyOn(medplum, 'createPdf').mockResolvedValue(mockBinary as any);

  const mockDocumentReference = {
    id: 'doc-ref-123',
    resourceType: 'DocumentReference',
  };
  const createResourceSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(mockDocumentReference as any);

  // Mock the readResource method to return our patient
  const readResourceSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(patient);

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: createReference(patient),
    author: createReference(DrAliceSmith),
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: true }],
      },
      {
        linkId: 'days-of-sick-note',
        answer: [{ valueInteger: 1 }],
      },
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBe(mockDocumentReference);
  expect(createPdfSpy).toHaveBeenCalledWith({
    docDefinition: expect.objectContaining({
      content: expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('Please excuse John Michael Doe for 1 days.'),
        }),
      ]),
    }),
  });

  createPdfSpy.mockRestore();
  createResourceSpy.mockRestore();
  readResourceSpy.mockRestore();
});

test('Uses correct practitioner name in healthcare provider section', async () => {
  const medplum = new MockClient();

  // Create a practitioner with specific name
  const practitioner: Practitioner & { id: string } = {
    resourceType: 'Practitioner',
    id: 'practitioner-123',
    name: [
      {
        given: ['Jane'],
        prefix: ['Dr.'],
        family: 'Smith',
      },
    ],
  };

  const mockBinary = { id: 'binary-123' };
  const createPdfSpy = vi.spyOn(medplum, 'createPdf').mockResolvedValue(mockBinary as any);

  const mockDocumentReference = {
    id: 'doc-ref-123',
    resourceType: 'DocumentReference',
  };
  const createResourceSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(mockDocumentReference as any);

  // Mock the readResource method to return our practitioner
  const readResourceSpy = vi.spyOn(medplum, 'readResource').mockResolvedValue(practitioner);

  const questionnaireResponse: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    subject: createReference(HomerSimpson),
    author: createReference(practitioner),
    item: [
      {
        linkId: 'sick-note-needed',
        answer: [{ valueBoolean: true }],
      },
      {
        linkId: 'days-of-sick-note',
        answer: [{ valueInteger: 3 }],
      },
    ],
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: questionnaireResponse,
    contentType,
    secrets: {},
  });

  expect(result).toBe(mockDocumentReference);
  expect(createPdfSpy).toHaveBeenCalledWith({
    docDefinition: expect.objectContaining({
      content: expect.arrayContaining([
        expect.objectContaining({
          text: 'Dr. Jane Smith',
        }),
      ]),
    }),
  });

  createPdfSpy.mockRestore();
  createResourceSpy.mockRestore();
  readResourceSpy.mockRestore();
});
