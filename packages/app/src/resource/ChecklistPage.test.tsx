// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';

describe('ChecklistPage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      renderAppRoutes(medplum, url);
    });
  }

  test('RequestGroup checklist', async () => {
    await setup('/RequestGroup/workflow-request-group-1/checklist');
    expect(await screen.findByText('Checklist')).toBeInTheDocument();
  });

  test('Start task', async () => {
    await setup('/RequestGroup/workflow-request-group-1/checklist');

    expect(screen.getByText('Patient Registration')).toBeDefined();

    const startButtons = screen.getAllByText('Start');
    expect(startButtons).toHaveLength(2);

    await act(async () => {
      fireEvent.click(startButtons[0]);
    });

    // Should navigate to the form
    const result = await screen.findAllByText('Surgery History');
    expect(result?.[0]).toBeInTheDocument();
  });

  test('Edit task', async () => {
    await setup('/RequestGroup/workflow-request-group-1/checklist');

    expect(screen.getByText('Patient Registration')).toBeDefined();

    const editButtons = screen.getAllByText('Edit');

    await act(async () => {
      fireEvent.click(editButtons[0]);
    });

    // Should navigate to the request group
    const result = await screen.findByText('workflow-request-group-1');
    expect(result).toBeInTheDocument();
  });
});
