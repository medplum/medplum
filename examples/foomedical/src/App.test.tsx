// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from './App';
import { render } from './test-utils/render';

test('App renders', async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={new MockClient()}>
          <App />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
});
