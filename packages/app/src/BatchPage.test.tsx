import { MedplumProvider, MockClient } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { BatchPage } from './BatchPage';

const medplum = new MockClient({});

describe('BatchPage', () => {
  function setup() {
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

  test('Submit', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByTestId('batch-input'), {
        target: {
          value: JSON.stringify({
            resourceType: 'Practitioner',
            id: '123',
            meta: {
              lastUpdated: '2020-01-01T00:00:00.000Z',
              author: {
                reference: 'Practitioner/111',
              },
            },
          }),
        },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    await waitFor(async () => expect(screen.getByText('Output')).toBeInTheDocument());
    expect(screen.getByText('Output')).toBeInTheDocument();
  });
});
