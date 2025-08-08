// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { BatchPage } from './BatchPage';
import { act, fireEvent, render, RenderResult, screen, UserEvent, userEvent } from './test-utils/render';

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
});
