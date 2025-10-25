// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './AppRoutes';
import { act, fireEvent, render, screen } from './test-utils/render';

const medplum = new MockClient();

function setup(url: string): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <AppRoutes />
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('VerifyEmailPage', () => {
  const id = '123';
  const secret = '456';

  beforeEach(() => {
    jest.useFakeTimers();
  });

  test('Renders', () => {
    setup(`/verifyemail/${id}/${secret}`);
    expect(screen.getByRole('button', { name: 'Verify email' })).toBeInTheDocument();
  });

  test('Submit success', async () => {
    const postSpy = jest.spyOn(medplum, 'post');
    setup(`/verifyemail/${id}/${secret}`);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledWith('auth/verifyemail', { id, secret });
  });
});
