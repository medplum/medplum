import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import crypto from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TextEncoder } from 'util';
import { AppRoutes } from './AppRoutes';
import { getConfig } from './config';

const medplum = new MockClient();

describe('SignInPage', () => {
  function setup(url = '/signin'): void {
    render(
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <MedplumProvider medplum={medplum}>
          <AppRoutes />
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global.self, 'crypto', {
      value: crypto.webcrypto,
    });
  });

  test('Renders', async () => {
    setup();

    expect(screen.getByText('Sign in to Medplum')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  test('Success', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'admin@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });

    await waitFor(() => screen.getByTestId('search-control'));
    expect(screen.getByTestId('search-control')).toBeInTheDocument();
  });

  test('Forgot password', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'admin@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Forgot password'));
    });
  });

  test('Register enabled', async () => {
    getConfig().registerEnabled = true;
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Register'));
    });
  });

  test('Register disabled', async () => {
    getConfig().registerEnabled = false;
    setup();
    expect(screen.queryByText('Register')).not.toBeInTheDocument();
  });

  test('Redirect to next', async () => {
    setup('/signin?next=/batch');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'admin@example.com' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'password' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    });

    await waitFor(() => screen.getByText('Batch Create'));
    expect(screen.getByText('Batch Create')).toBeInTheDocument();
  });
});
