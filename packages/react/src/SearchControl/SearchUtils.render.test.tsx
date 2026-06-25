// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Observation } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, render, screen } from '../test-utils/render';
import { getFieldDefinitions } from './SearchControlField';
import { renderValue } from './SearchUtils';

const medplum = new MockClient();

describe('renderValue extension column', () => {
  function setup(node: ReactNode): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{node}</MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders an extension value in a table column', async () => {
    const [field] = getFieldDefinitions({ resourceType: 'Observation', fields: ['extension'] });
    const observation: Observation = {
      resourceType: 'Observation',
      id: '1',
      status: 'final',
      code: { text: 'Test' },
      extension: [{ url: 'http://example.com/eye-color', valueString: 'blue' }],
    };

    await act(async () => {
      setup(renderValue(observation, field));
    });

    expect(await screen.findByText('blue')).toBeInTheDocument();
  });
});
