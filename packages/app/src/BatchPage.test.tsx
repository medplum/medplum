import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { BatchPage } from './BatchPage';
import { act, fireEvent, render, RenderResult, screen } from './test-utils/render';

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
  function setup(): RenderResult {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <BatchPage />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders', async () => {
    setup();
    expect(screen.getByText('Batch Create')).toBeInTheDocument();
  });

  test('Submit file', async () => {
    const renderResult = setup();

    // Upload file
    await act(async () => {
      const fileInput = renderResult.container.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [new File([exampleBundle], 'patient.json', { type: 'application/json' })];
      fireEvent.change(fileInput, { target: { files } });
    });

    expect(await screen.findByText('Output')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    });
  });

  test('Submit JSON', async () => {
    setup();

    // Click on the JSON tab
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'JSON' }));
    });

    // Enter JSON
    await act(async () => {
      fireEvent.change(screen.getByTestId('batch-input'), {
        target: {
          value: exampleBundle,
        },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(await screen.findByText('Output')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    });
  });
});
