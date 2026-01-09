// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '../../test-utils/render';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, beforeEach } from 'vitest';
import { LabResultDetails } from './LabResultDetails';
import type { DiagnosticReport, Patient, Practitioner, Reference } from '@medplum/fhirtypes';

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr. Jane'], family: 'Smith' }],
};

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

  function setup(result: DiagnosticReport | Reference<DiagnosticReport>): ReturnType<typeof render> {
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

  test('Renders with DiagnosticReport object', async () => {
    const diagnosticReport = createMockDiagnosticReport();
    await medplum.createResource(mockPatient);
    await medplum.createResource(mockPractitioner);

    setup(diagnosticReport);

    await waitFor(() => {
      expect(screen.getByText('CBC with Differential')).toBeInTheDocument();
    });
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  test('Renders with DiagnosticReport reference', async () => {
    const diagnosticReport = createMockDiagnosticReport();
    await medplum.createResource(diagnosticReport);
    await medplum.createResource(mockPatient);
    await medplum.createResource(mockPractitioner);

    const reference: Reference<DiagnosticReport> = {
      reference: `DiagnosticReport/${diagnosticReport.id}`,
    };

    setup(reference);

    await waitFor(() => {
      expect(screen.getByText('CBC with Differential')).toBeInTheDocument();
    });
  });

  test('Displays default title when code text and display are missing', () => {
    const diagnosticReport = createMockDiagnosticReport({
      code: {
        coding: [],
      },
    });

    setup(diagnosticReport);

    expect(screen.getByText('Lab Result')).toBeInTheDocument();
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

    const titles = screen.getAllByText('Complete Blood Count');
    expect(titles.length).toBeGreaterThan(0);
    expect(titles[0]).toBeInTheDocument();
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

  test('Displays issued date', () => {
    const diagnosticReport = createMockDiagnosticReport({ issued: '2024-01-15T10:00:00Z' });

    setup(diagnosticReport);

    expect(screen.getByText('Issued Date:')).toBeInTheDocument();
  });

  test('Displays effective date when present', () => {
    const diagnosticReport = createMockDiagnosticReport({
      effectiveDateTime: '2024-01-16T10:00:00Z',
    });

    setup(diagnosticReport);

    expect(screen.getByText('Effective Date:')).toBeInTheDocument();
  });

  test('Does not display effective date when absent', () => {
    const diagnosticReport = createMockDiagnosticReport({
      effectiveDateTime: undefined,
    });

    setup(diagnosticReport);

    expect(screen.queryByText('Effective Date:')).not.toBeInTheDocument();
  });

  test('Displays all result detail sections when present', async () => {
    const patient = await medplum.createResource(mockPatient);
    const practitioner = await medplum.createResource(mockPractitioner);
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
      subject: { reference: `Patient/${patient.id}` },
      performer: [{ reference: `Practitioner/${practitioner.id}` }],
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
              code: 'LAB',
              display: 'Laboratory',
            },
          ],
          text: 'Laboratory',
        },
        {
          text: 'Hematology',
        },
      ],
      conclusion: 'All values within normal limits',
    });

    setup(diagnosticReport);

    await waitFor(() => {
      expect(screen.getByText('Performed by:')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Code:')).toBeInTheDocument();
    expect(screen.getByText('24323-8')).toBeInTheDocument();
    expect(screen.getAllByText('Complete Blood Count').length).toBeGreaterThan(0);
    expect(screen.getByText('24325-3')).toBeInTheDocument();
    expect(screen.getByText('CBC with Differential')).toBeInTheDocument();
    expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Patient:')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Category:')).toBeInTheDocument();
    expect(screen.getByText('Laboratory')).toBeInTheDocument();
    expect(screen.getByText('Hematology')).toBeInTheDocument();
    expect(screen.getByText('CONCLUSION')).toBeInTheDocument();
    expect(screen.getByText('All values within normal limits')).toBeInTheDocument();
  });

  test('Does not display conclusion section when absent', () => {
    const diagnosticReport = createMockDiagnosticReport({
      conclusion: undefined,
    });

    setup(diagnosticReport);

    expect(screen.queryByText('CONCLUSION')).not.toBeInTheDocument();
  });

  test('Displays conclusion codes when present', () => {
    const diagnosticReport = createMockDiagnosticReport({
      conclusionCode: [
        {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '123456789',
              display: 'Normal',
            },
          ],
          text: 'Normal',
        },
      ],
    });

    setup(diagnosticReport);

    expect(screen.getByText('CONCLUSION CODES')).toBeInTheDocument();
    expect(screen.getByText('Code 1:')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  test('Displays multiple conclusion codes', () => {
    const diagnosticReport = createMockDiagnosticReport({
      conclusionCode: [
        {
          text: 'Normal',
        },
        {
          text: 'Abnormal',
        },
      ],
    });

    setup(diagnosticReport);

    expect(screen.getByText('Code 1:')).toBeInTheDocument();
    expect(screen.getByText('Code 2:')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('Abnormal')).toBeInTheDocument();
  });

  test('Displays attachments when present', () => {
    const diagnosticReport = createMockDiagnosticReport({
      presentedForm: [
        {
          contentType: 'application/pdf',
          title: 'Lab Report PDF',
        },
      ],
    });

    setup(diagnosticReport);

    expect(screen.getByText('ATTACHMENTS')).toBeInTheDocument();
    expect(screen.getByText('Attachment 1:')).toBeInTheDocument();
    expect(screen.getByText('Lab Report PDF')).toBeInTheDocument();
  });

  test('Displays attachment with contentType when title is missing', () => {
    const diagnosticReport = createMockDiagnosticReport({
      presentedForm: [
        {
          contentType: 'application/pdf',
        },
      ],
    });

    setup(diagnosticReport);

    expect(screen.getByText('application/pdf')).toBeInTheDocument();
  });

  test('Displays attachment with default text when title and contentType are missing', () => {
    const diagnosticReport = createMockDiagnosticReport({
      presentedForm: [{}],
    });

    setup(diagnosticReport);

    expect(screen.getByText('Attachment')).toBeInTheDocument();
  });

  test('Displays multiple attachments', () => {
    const diagnosticReport = createMockDiagnosticReport({
      presentedForm: [
        {
          title: 'Report 1',
        },
        {
          title: 'Report 2',
        },
      ],
    });

    setup(diagnosticReport);

    expect(screen.getByText('Attachment 1:')).toBeInTheDocument();
    expect(screen.getByText('Attachment 2:')).toBeInTheDocument();
    expect(screen.getByText('Report 1')).toBeInTheDocument();
    expect(screen.getByText('Report 2')).toBeInTheDocument();
  });

  test('Does not display test results section when result array is empty', () => {
    const diagnosticReport = createMockDiagnosticReport({
      result: [],
    });

    setup(diagnosticReport);

    expect(screen.queryByText('TEST RESULTS')).not.toBeInTheDocument();
  });

  test('Does not display test results section when result is undefined', () => {
    const diagnosticReport = createMockDiagnosticReport({
      result: undefined,
    });

    setup(diagnosticReport);

    expect(screen.queryByText('TEST RESULTS')).not.toBeInTheDocument();
  });

  test('Handles undefined diagnostic report gracefully', async () => {
    const reference: Reference<DiagnosticReport> = {
      reference: 'DiagnosticReport/non-existent-id',
    };

    setup(reference);

    await waitFor(() => {
      expect(screen.getByText('Lab Result')).toBeInTheDocument();
    });
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  test('Renders all sections together', async () => {
    const patient = await medplum.createResource(mockPatient);
    const practitioner = await medplum.createResource(mockPractitioner);
    const diagnosticReport = createMockDiagnosticReport({
      subject: { reference: `Patient/${patient.id}` },
      performer: [{ reference: `Practitioner/${practitioner.id}` }],
      effectiveDateTime: '2024-01-16T10:00:00Z',
      conclusion: 'All values normal',
      conclusionCode: [
        {
          text: 'Normal',
        },
      ],
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
    expect(screen.getByText('Effective Date:')).toBeInTheDocument();
    expect(screen.getByText('Patient:')).toBeInTheDocument();
    expect(screen.getByText('Performed by:')).toBeInTheDocument();
    expect(screen.getByText('CONCLUSION')).toBeInTheDocument();
    expect(screen.getByText('CONCLUSION CODES')).toBeInTheDocument();
    expect(screen.getByText('ATTACHMENTS')).toBeInTheDocument();
    expect(screen.getByText('TEST RESULTS')).toBeInTheDocument();
  });
});
