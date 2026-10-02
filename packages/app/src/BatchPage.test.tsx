// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { BatchPage } from './BatchPage';
import type { RenderResult, UserEvent } from './test-utils/render';
import { act, fireEvent, render, screen, userEvent, waitFor } from './test-utils/render';

vi.mock('@medplum/react', async () => ({
  ...(await vi.importActual('@medplum/react')),
  QrCodeScanner: ({ onScan }: { onScan: (data: string) => void }) => (
    <button type="button" onClick={() => onScan('shc:/mock-health-card')}>
      Mock QR Scan
    </button>
  ),
}));

const exampleBundle = `{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "name": [{
          "given": ["Alice"],
          "family": "Smith"
        }]
      },
      "request": {
        "method": "POST",
        "url": "Patient"
      }
    }
  ]
}`;

const medplum = new MockClient();

describe('BatchPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup(): { user: UserEvent; renderResult: RenderResult } {
    const user = userEvent.setup();
    return {
      user: user,
      renderResult: render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <BatchPage />
          </MedplumProvider>
        </MemoryRouter>
      ),
    };
  }

  test('Renders', async () => {
    setup();
    expect(screen.getByText('Batch Create')).toBeInTheDocument();
  });

  test('Submit file', async () => {
    const { user, renderResult } = setup();

    // Upload file
    const fileInput = renderResult.container.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [new File([exampleBundle], 'patient.json', { type: 'application/json' })];
    await user.upload(fileInput, files);

    expect(await screen.findByText('Output')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start over' }));
  });

  test('Submit JSON', async () => {
    const { user } = setup();

    // Click on the JSON tab
    await user.click(screen.getByRole('tab', { name: 'JSON' }));

    // Enter JSON
    await act(async () => {
      fireEvent.change(screen.getByTestId('batch-input'), {
        target: {
          value: exampleBundle,
        },
      });
    });

    await user.click(screen.getByText('Submit'));

    expect(await screen.findByText('Output')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start over' }));
  });

  test('Shows invalid JSON errors', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await act(async () => {
      fireEvent.change(screen.getByTestId('batch-input'), {
        target: {
          value: 'not-json',
        },
      });
    });
    await user.click(screen.getByText('Submit'));

    expect(screen.queryByText('Output')).not.toBeInTheDocument();
  });

  test('Ignores empty SMART input', async () => {
    const postSpy = vi.spyOn(medplum, 'post');
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'SMART' }));
    await user.type(await screen.findByLabelText('SMART Health Link'), '   ');
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    expect(postSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('batch-input')).toHaveValue('{"resourceType": "Bundle"}');
  });

  test('Resolve SMART Health Card QR code', async () => {
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce({
      resourceType: 'Parameters',
      parameter: [
        { name: 'valid', valueBoolean: true },
        {
          name: 'fhirBundle',
          valueString: JSON.stringify({
            resourceType: 'Bundle',
            type: 'collection',
            entry: [{ resource: { resourceType: 'Patient', id: 'patient-from-card' } }],
          }),
        },
      ],
    });
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'SMART' }));
    await user.click(await screen.findByRole('button', { name: 'Mock QR Scan' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('$verify-smart-health-card'), {
        shcUri: 'shc:/mock-health-card',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId<HTMLTextAreaElement>('batch-input').value).toContain('patient-from-card');
    });
  });

  test('Shows invalid SMART Health Card QR code errors', async () => {
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce({
      resourceType: 'Parameters',
      parameter: [{ name: 'valid', valueBoolean: false }],
    });
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'SMART' }));
    await user.click(await screen.findByRole('button', { name: 'Mock QR Scan' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('$verify-smart-health-card'), {
        shcUri: 'shc:/mock-health-card',
      });
      expect(screen.getByTestId('batch-input')).toHaveValue('{"resourceType": "Bundle"}');
    });
  });

  test('Shows SMART Health Card verification errors', async () => {
    const postSpy = vi.spyOn(medplum, 'post').mockRejectedValueOnce(new Error('Invalid signature'));
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'SMART' }));
    await user.click(await screen.findByRole('button', { name: 'Mock QR Scan' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('$verify-smart-health-card'), {
        shcUri: 'shc:/mock-health-card',
      });
      expect(screen.getByTestId('batch-input')).toHaveValue('{"resourceType": "Bundle"}');
    });
  });

  test('Resolve SMART Health Link from input', async () => {
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce({
      resourceType: 'Parameters',
      parameter: [
        { name: 'valid', valueBoolean: true },
        {
          name: 'fhirResources',
          valueString: JSON.stringify([
            {
              resourceType: 'Bundle',
              type: 'collection',
              entry: [{ resource: { resourceType: 'Patient', id: 'patient-from-link' } }],
            },
          ]),
        },
        { name: 'warning', valueString: 'Link warning' },
      ],
    });
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'SMART' }));
    await user.type(await screen.findByLabelText('SMART Health Link'), 'shlink:/mock-link');
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('$resolve-smart-health-link'), {
        shlink: 'shlink:/mock-link',
        recipient: 'Medplum App',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId<HTMLTextAreaElement>('batch-input').value).toContain('patient-from-link');
    });
  });

  test('Shows SMART Health Link errors when no Bundle is returned', async () => {
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce({
      resourceType: 'Parameters',
      parameter: [
        { name: 'valid', valueBoolean: true },
        {
          name: 'fhirResources',
          valueString: JSON.stringify([{ resourceType: 'Patient', id: 'not-a-bundle' }]),
        },
      ],
    });
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'SMART' }));
    await user.type(await screen.findByLabelText('SMART Health Link'), 'shlink:/missing-bundle');
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
      expect(screen.getByTestId('batch-input')).toHaveValue('{"resourceType": "Bundle"}');
    });
  });

  test('Submit Async Batch', async () => {
    const postSpy = vi.spyOn(medplum, 'post');
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await act(async () => {
      fireEvent.change(screen.getByTestId('batch-input'), {
        target: {
          value: exampleBundle,
        },
      });
    });

    await user.click(screen.getByRole('button', { name: 'Submit Async Batch' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
    });

    const [url, body, contentType, options] = postSpy.mock.calls[0];
    expect(url.toString()).toStrictEqual(medplum.fhirUrl().toString());
    expect(body).toMatchObject({ resourceType: 'Bundle' });
    expect(contentType).toStrictEqual(ContentType.FHIR_JSON);
    expect(options).toMatchObject({ headers: { Prefer: 'respond-async' } });
  });

  test('Shows batch jobs and downloads results', async () => {
    const asyncJob = await medplum.createResource({
      resourceType: 'AsyncJob',
      status: 'completed',
      requestTime: new Date().toISOString(),
      request: medplum.fhirUrl().toString(),
      output: {
        resourceType: 'Parameters',
        parameter: [{ name: 'results', valueReference: { reference: 'Binary/test-binary' } }],
      },
    });

    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/blob');
    window.URL.revokeObjectURL = vi.fn();
    const downloadSpy = vi
      .spyOn(medplum, 'download')
      .mockResolvedValue(new Blob(['{}'], { type: 'application/fhir+json' }));

    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'Batch Jobs' }));

    expect(await screen.findByText(asyncJob.id)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith('Binary/test-binary');
    });
  });

  test('Shows SMART Health Link errors', async () => {
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce({
      resourceType: 'Parameters',
      parameter: [
        { name: 'valid', valueBoolean: false },
        { name: 'error', valueString: 'Link expired' },
      ],
    });
    const { user } = setup();

    await user.click(screen.getByRole('tab', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'SMART' }));
    await user.type(await screen.findByLabelText('SMART Health Link'), 'shlink:/expired');
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
      expect(screen.getByTestId('batch-input')).toHaveValue('{"resourceType": "Bundle"}');
    });
  });
});
