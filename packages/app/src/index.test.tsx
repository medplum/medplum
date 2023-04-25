import { act, screen, waitFor } from '@testing-library/react';
import { initApp } from './index';

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

    global.Request = jest.fn();
  });

  test('Renders', async () => {
    await act(async () => {
      const root = document.createElement('div');
      root.id = 'root';
      document.body.appendChild(root);
      await initApp();
    });

    await waitFor(() => screen.getByTestId('search-control'));

    await act(async () => {
      document.getElementById('root')?.remove();
    });
  });
});
