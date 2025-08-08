// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SmokingStatus } from './SmokingStatus';

const medplum = new MockClient();

describe('PatientSummary - SmokingStatus', () => {
  async function setup(children: ReactNode): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', async () => {
    await setup(<SmokingStatus patient={HomerSimpson} />);
    expect(screen.getByText('Smoking Status')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <SmokingStatus
        patient={HomerSimpson}
        smokingStatus={{
          resourceType: 'Observation',
          id: 'smokingStatus',
          status: 'final',
          code: { text: 'Smoking Status' },
          valueCodeableConcept: { text: 'Ex-smoker' },
        }}
      />
    );
    expect(screen.getByText('Smoking Status')).toBeInTheDocument();
    expect(screen.getByText('Ex-smoker')).toBeInTheDocument();
  });

  test('Edit status', async () => {
    await setup(<SmokingStatus patient={HomerSimpson} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    // Click "Save" button
    const saveButton = await screen.findByText('Save');
    await act(async () => {
      fireEvent.click(saveButton);
    });
  });

  test('Click on resource', async () => {
    const mockOnClickResource = jest.fn();
    await setup(
      <SmokingStatus
        patient={HomerSimpson}
        smokingStatus={{
          resourceType: 'Observation',
          id: 'smokingStatus',
          status: 'final',
          code: { text: 'Smoking Status' },
          valueCodeableConcept: { text: 'Ex-smoker' },
        }}
        onClickResource={mockOnClickResource}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('smoking-status-button'));
    });

    expect(mockOnClickResource).toHaveBeenCalled();
  });
});
