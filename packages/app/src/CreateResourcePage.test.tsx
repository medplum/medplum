// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { act, fireEvent, render, screen, userEvent, UserEvent } from './test-utils/render';

const medplum = new MockClient();

describe('CreateResourcePage', () => {
  async function setup(url: string): Promise<UserEvent> {
    const user = userEvent.setup();

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <AppRoutes />
          </MemoryRouter>
        </MedplumProvider>
      );
    });

    return user;
  }

  function formViewTests(url: string): undefined {
    test('Renders new Practitioner form page', async () => {
      await setup(url);
      expect(await screen.findByText('New Practitioner')).toBeInTheDocument();
      expect(screen.getByText('Resource Type')).toBeInTheDocument();
      expect(screen.getByText('Create')).toBeInTheDocument();
    });

    test('Form submit new Practitioner', async () => {
      const user = await setup(url);

      const createButton = await screen.findByText('Create');
      expect(createButton).toBeInTheDocument();
      await user.click(createButton);
    });
  }

  describe('Default view', () => {
    formViewTests('/Practitioner/new');
  });

  describe('Form view', () => {
    formViewTests('/Practitioner/new/form');
  });

  describe('JSON view', () => {
    const JSON_INPUT_TEST_ID = 'create-resource-json';

    test('JSON tab renders', async () => {
      await setup('/Patient/new/json');
      expect(await screen.findByTestId(JSON_INPUT_TEST_ID)).toBeInTheDocument();
      expect(screen.getByText('OK')).toBeInTheDocument();
    });

    test('JSON submit new Practitioner', async () => {
      const user = await setup('/Practitioner/new/json');
      expect(await screen.findByTestId(JSON_INPUT_TEST_ID)).toBeInTheDocument();

      await act(async () => {
        fireEvent.change(screen.getByTestId(JSON_INPUT_TEST_ID), {
          target: { value: '{"resourceType":"Practitioner","id":"123"}' },
        });
      });

      await user.click(screen.getByText('OK'));
    });
  });
});
