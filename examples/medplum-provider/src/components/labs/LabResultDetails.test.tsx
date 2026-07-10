// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { DiagnosticReport, DocumentReference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '../../test-utils/render';
import { LabResultDetails } from './LabResultDetails';

function createMockDiagnosticReport(overrides?: Partial<DiagnosticReport>): DiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    id: 'diagnostic-report-123',
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '24323-8',
          display: 'Complete Blood Count',
        },
      ],
      text: 'CBC with Differential',
    },
    subject: {
      reference: 'Patient/patient-123',
    },
    issued: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('LabResultDetails', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
  });

  function setup(result: DiagnosticReport): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <LabResultDetails result={result} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders with DiagnosticReport object', () => {
    const diagnosticReport = createMockDiagnosticReport();

    setup(diagnosticReport);

    expect(screen.getByText('CBC with Differential')).toBeInTheDocument();
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  test('Renders an empty title when code text and display are missing', () => {
    const diagnosticReport = createMockDiagnosticReport({
      code: {
        coding: [],
      },
    });

    const { container } = setup(diagnosticReport);

    const title = container.querySelector('.mantine-Text-root');
    expect(title).toBeInTheDocument();
    expect(title).toBeEmptyDOMElement();
  });

  test('Displays code display when code text is missing', () => {
    const diagnosticReport = createMockDiagnosticReport({
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '24323-8',
            display: 'Complete Blood Count',
          },
        ],
      },
    });

    setup(diagnosticReport);

    expect(screen.getByText('Complete Blood Count')).toBeInTheDocument();
  });

  test('Displays all code displays in title when there are multiple codes', () => {
    const diagnosticReport = createMockDiagnosticReport({
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '24323-8',
            display: 'Complete Blood Count',
          },
          {
            system: 'http://loinc.org',
            code: '24325-3',
            display: 'CBC with Differential',
          },
        ],
      },
    });

    setup(diagnosticReport);

    expect(screen.getByText('Complete Blood Count, CBC with Differential')).toBeInTheDocument();
  });

  test('Displays status badge with correct color for final status', () => {
    const diagnosticReport = createMockDiagnosticReport({ status: 'final' });

    setup(diagnosticReport);

    const badge = screen.getByText('Final');
    expect(badge).toBeInTheDocument();
  });

  test('Displays status badge with correct color for entered-in-error status', () => {
    const diagnosticReport = createMockDiagnosticReport({ status: 'entered-in-error' });

    setup(diagnosticReport);

    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  test('Displays issued date in the header', () => {
    const diagnosticReport = createMockDiagnosticReport({ issued: '2024-01-15T10:00:00Z' });

    setup(diagnosticReport);

    expect(screen.getByText(/Issued/)).toBeInTheDocument();
  });

  test('Displays collection date in the header when present', () => {
    const diagnosticReport = createMockDiagnosticReport({
      effectiveDateTime: '2024-01-16T10:00:00Z',
    });

    setup(diagnosticReport);

    expect(screen.getByText(/Collected/)).toBeInTheDocument();
  });

  test('Does not display collection date in the header when absent', () => {
    const diagnosticReport = createMockDiagnosticReport({
      effectiveDateTime: undefined,
    });

    setup(diagnosticReport);

    expect(screen.queryByText(/Collected/)).not.toBeInTheDocument();
  });

  test('Displays lab document section when attachments are present', async () => {
    const diagnosticReport = createMockDiagnosticReport({
      presentedForm: [
        {
          contentType: 'application/pdf',
          title: 'Lab Report PDF',
        },
      ],
    });

    setup(diagnosticReport);

    expect(await screen.findByText('Lab Document')).toBeInTheDocument();
  });

  test('Resolves presentedForm entries that reference a DocumentReference', async () => {
    const docRef = await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      content: [
        {
          attachment: {
            contentType: 'application/pdf',
            url: 'https://example.com/lab-report.pdf',
            title: 'lab-report.pdf',
          },
        },
        {
          attachment: {
            contentType: 'text/plain',
            url: 'https://example.com/extracted.txt',
            title: 'Extracted Text (Textract)',
          },
        },
      ],
    });

    const diagnosticReport = createMockDiagnosticReport({
      presentedForm: [
        {
          contentType: 'application/pdf',
          url: `DocumentReference/${docRef.id}`,
          title: 'Frodo Baggins HGDX LabCorp Result',
        },
      ],
    });

    setup(diagnosticReport);

    expect(await screen.findByText('Lab Document')).toBeInTheDocument();

    // The resolved PDF content is rendered with the presentedForm title, not the raw DocumentReference URL
    const downloadLink = screen.getByText('Frodo Baggins HGDX LabCorp Result');
    expect(downloadLink).toHaveAttribute('href', 'https://example.com/lab-report.pdf');

    // Only the content matching the declared contentType is rendered, not the extracted-text rendition
    expect(screen.getAllByTestId('attachment-display')).toHaveLength(1);
    expect(screen.queryByText('Extracted Text (Textract)')).not.toBeInTheDocument();
  });

  test('Does not display lab document section when attachments are absent', () => {
    const diagnosticReport = createMockDiagnosticReport({
      presentedForm: undefined,
    });

    setup(diagnosticReport);

    expect(screen.queryByText('Lab Document')).not.toBeInTheDocument();
  });

  test('Displays diagnostic report display when results are present', async () => {
    const diagnosticReport = createMockDiagnosticReport({
      result: [{ reference: 'Observation/obs-123' }],
    });

    setup(diagnosticReport);

    await waitFor(() => {
      expect(screen.getByText('Diagnostic Report')).toBeInTheDocument();
    });
  });

  test('Does not display diagnostic report display when result array is empty', () => {
    const diagnosticReport = createMockDiagnosticReport({
      result: [],
    });

    setup(diagnosticReport);

    expect(screen.queryByText('Diagnostic Report')).not.toBeInTheDocument();
  });

  test('Does not display diagnostic report display when result is undefined', () => {
    const diagnosticReport = createMockDiagnosticReport({
      result: undefined,
    });

    setup(diagnosticReport);

    expect(screen.queryByText('Diagnostic Report')).not.toBeInTheDocument();
  });

  test('Renders all sections together', async () => {
    const diagnosticReport = createMockDiagnosticReport({
      effectiveDateTime: '2024-01-16T10:00:00Z',
      presentedForm: [
        {
          title: 'Report PDF',
        },
      ],
      result: [{ reference: 'Observation/obs-123' }],
    });

    setup(diagnosticReport);

    await waitFor(() => {
      expect(screen.getByText('CBC with Differential')).toBeInTheDocument();
    });
    // DiagnosticReportDisplay renders its own "Issued"/"Collected" labels, so match loosely
    expect(screen.getAllByText(/Issued/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Collected/).length).toBeGreaterThan(0);
    expect(screen.getByText('Final')).toBeInTheDocument();
    expect(await screen.findByText('Lab Document')).toBeInTheDocument();
    expect(screen.getByText('Diagnostic Report')).toBeInTheDocument();
  });
});
