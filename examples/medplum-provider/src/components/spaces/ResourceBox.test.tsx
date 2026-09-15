// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ResourceBox } from './ResourceBox';

describe('ResourceBox', () => {
  let medplum: MockClient;
  const onClick = vi.fn();

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup(resourceReference: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ResourceBox resourceReference={resourceReference} onClick={onClick} />
        </MantineProvider>
      </MedplumProvider>
    );
  }

  test('shows a loading state, then the loaded resource, and reports clicks with the reference', async () => {
    const user = userEvent.setup();
    setup('Patient/123');
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    const box = await screen.findByTestId('resource-box');
    expect(box).toHaveTextContent('Patient');
    expect(box).toHaveTextContent('Homer Simpson');
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

    await user.click(box);
    expect(onClick).toHaveBeenCalledWith('Patient/123');
  });

  test('reports an invalid reference without fetching', () => {
    const readSpy = vi.spyOn(medplum, 'readReference');
    setup('Patient');
    expect(screen.getByText('Invalid resource reference')).toBeInTheDocument();
    expect(readSpy).not.toHaveBeenCalled();
  });

  test.each([
    ['an Error', new Error('Boom'), 'Boom'],
    ['a non-Error value', 'plain failure', 'plain failure'],
  ])('shows the message when the fetch rejects with %s', async (_label, rejection, message) => {
    vi.spyOn(medplum, 'readReference').mockRejectedValue(rejection);
    setup('Patient/123');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByTestId('resource-box')).not.toBeInTheDocument();
  });
});
