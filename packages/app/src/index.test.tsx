// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { initApp } from './index';
import { act, screen } from './test-utils/render';

describe('App Index', () => {
  beforeAll(() => {
    (window as any).fetch = jest.fn(() =>
      Promise.resolve({
        json: () =>
          Promise.resolve({
            data: 100,
          }),
      })
    );
  });

  test('Renders', async () => {
    await act(async () => {
      const root = document.createElement('div');
      root.id = 'root';
      document.body.appendChild(root);
      await initApp();
    });

    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });
});
