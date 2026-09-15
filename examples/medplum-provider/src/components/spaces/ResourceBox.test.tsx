// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ResourceBox } from './ResourceBox';

const onClick = vi.fn();

function setup(medplum: MockClient, resourceReference: string): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MantineProvider>
        <ResourceBox resourceReference={resourceReference} onClick={onClick} />
      </MantineProvider>
    </MedplumProvider>
  );
}

test('shows a loading state, then the loaded resource, and reports clicks with the reference', async () => {
  setup(new MockClient(), 'Patient/123');
  expect(screen.getByText('Loading...')).toBeInTheDocument();
  const box = await screen.findByTestId('resource-box');
  expect(box).toHaveTextContent('Homer Simpson');
  await userEvent.click(box);
  expect(onClick).toHaveBeenCalledWith('Patient/123');
});

test('reports an invalid reference without fetching, and shows the message when the fetch rejects', async () => {
  const medplum = new MockClient();
  vi.spyOn(medplum, 'readReference').mockRejectedValue(new Error('Boom'));
  setup(medplum, 'Patient');
  expect(screen.getByText('Invalid resource reference')).toBeInTheDocument();
  expect(medplum.readReference).not.toHaveBeenCalled();
  setup(medplum, 'Patient/123');
  expect(await screen.findByText('Boom')).toBeInTheDocument();
});
