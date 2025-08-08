// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { SexualOrientation } from './SexualOrientation';

const medplum = new MockClient();

describe('PatientSummary - SexualOrientation', () => {
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
    await setup(<SexualOrientation patient={HomerSimpson} />);
    expect(screen.getByText('Sexual Orientation')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <SexualOrientation
        patient={HomerSimpson}
        sexualOrientation={{
          resourceType: 'Observation',
          id: 'sexualOrientation',
          status: 'final',
          code: { text: 'Sexual orientation' },
          valueCodeableConcept: { text: 'Heterosexual' },
        }}
      />
    );
    expect(screen.getByText('Sexual Orientation')).toBeInTheDocument();
    expect(screen.getByText('Heterosexual')).toBeInTheDocument();
  });

  test('Edit status', async () => {
    await setup(<SexualOrientation patient={HomerSimpson} />);

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
      <SexualOrientation
        patient={HomerSimpson}
        sexualOrientation={{
          resourceType: 'Observation',
          id: 'sexualOrientation',
          status: 'final',
          code: { text: 'Sexual orientation' },
          valueCodeableConcept: { text: 'Heterosexual' },
        }}
        onClickResource={mockOnClickResource}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('sexual-orientation-button'));
    });

    expect(mockOnClickResource).toHaveBeenCalled();
  });
});
