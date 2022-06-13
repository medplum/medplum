import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OAuthPage } from './OAuthPage';

const medplum = new MockClient();

describe('OAuthPage', () => {
  async function setup(url: string): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <Routes>
              <Route path="/oauth" element={<OAuthPage />} />
              <Route path="/register" element={<div />} />
              <Route path="/resetpassword" element={<div />} />
            </Routes>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Missing clientId', async () => {
    await setup('/oauth');
    expect(screen.queryByTestId('submit')).toBeNull();
  });

  test('Success', async () => {
    await setup('/oauth?client_id=123');

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });
  });

  test('Forgot password', async () => {
    await setup('/oauth?client_id=123');

    await act(async () => {
      fireEvent.click(screen.getByTestId('forgotpassword'));
    });
  });

  test('Register', async () => {
    await setup('/oauth?client_id=123');

    await act(async () => {
      fireEvent.click(screen.getByTestId('register'));
    });
  });
});
