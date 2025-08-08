// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { allOk } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { PatientExportForm, PatientExportFormProps } from './PatientExportForm';

describe('PatientExportForm', () => {
  async function setup(args: PatientExportFormProps, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <Notifications />
          <MedplumProvider medplum={medplum}>
            <PatientExportForm {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  beforeAll(() => {
    // Mock URL.createObjectURL
    URL.createObjectURL = jest.fn();
    URL.revokeObjectURL = jest.fn();

    // Mock document.createEvent
    type MyDocument = typeof document & {
      originalCreateElement: (tagName: string, options?: ElementCreationOptions) => any;
    };

    // Save the original createElement function
    (document as MyDocument).originalCreateElement = document.createElement;

    // Create a wrapper function
    document.createElement = (tagName: string, options?: ElementCreationOptions): any => {
      const result = (document as MyDocument).originalCreateElement(tagName, options);
      if (tagName === 'a') {
        // jsdom does not support click() or download attributes, so we will implement them here
        result.click = jest.fn();
      }
      return result;
    };
  });

  test('Renders', async () => {
    await setup({ patient: HomerSimpson });

    const button = await screen.findByText('Request Export');
    expect(button).toBeInTheDocument();
  });

  test('Submit', async () => {
    // Mock the patient everything endpoint
    const medplum = new MockClient();
    medplum.router.add('POST', '/Patient/:id/$everything', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'document' },
    ]);

    await setup({ patient: HomerSimpson }, medplum);

    const button = await screen.findByText('Request Export');
    expect(button).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    const exporting = await screen.findByText('Patient Export');
    expect(exporting).toBeInTheDocument();

    const done = await screen.findByText('Done');
    expect(done).toBeInTheDocument();
  });

  test('Submit with start and end', async () => {
    // Mock the patient everything endpoint
    const medplum = new MockClient();
    medplum.router.add('POST', '/Patient/:id/$everything', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'document' },
    ]);

    await setup({ patient: HomerSimpson }, medplum);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Start date'), { target: { value: '2020-01-01T00:00:00' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('End date'), { target: { value: '2040-01-01T00:00:00' } });
    });

    const button = await screen.findByText('Request Export');
    expect(button).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    const exporting = await screen.findByText('Patient Export');
    expect(exporting).toBeInTheDocument();

    const done = await screen.findByText('Done');
    expect(done).toBeInTheDocument();
  });
});
