import { MedplumClient } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { SignInForm, SignInFormProps } from './SignInForm';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  let status = 404;
  let result: any;

  if (options.method === 'POST' && url.endsWith('/auth/login')) {
    const { email, password } = JSON.parse(options.body);
    if (email === 'admin@medplum.com' && password === 'admin') {
      status = 301;
      result = {};
    } else if (email !== 'admin@medplum.com') {
      result = {
        resourceType: 'OperationOutcome',
        issue: [{
          expression: ['email'],
          details: {
            text: 'User not found'
          }
        }]
      };
    } else {
      result = {
        resourceType: 'OperationOutcome',
        issue: [{
          expression: ['password'],
          details: {
            text: 'Incorrect password'
          }
        }]
      };
    }
  }

  const response: any = {
    request: {
      url,
      options
    },
    status,
    ...result
  };

  return Promise.resolve({
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

const setup = (args?: SignInFormProps) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <SignInForm {...args} />
    </MedplumProvider>
  );
};

describe('SignInForm', () => {

  test('Renders', () => {
    const utils = setup();
    const input = utils.getByTestId('submit') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Sign in');
  });

  test('Submit success', async () => {
    let success = false;

    setup({
      onSuccess: () => success = true
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('email'), { target: { value: 'admin@medplum.com' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('password'), { target: { value: 'admin' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    expect(success).toBe(true);
  });

  test('User not found', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByTestId('email'), { target: { value: 'not-found@example.com' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('password'), { target: { value: 'admin' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    await act(async () => {
      await waitFor(() => screen.getByTestId('text-field-error'));
    });

    expect(screen.getByTestId('text-field-error')).not.toBeUndefined();
  });

  test('Incorrect password', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByTestId('email'), { target: { value: 'not-found@example.com' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('password'), { target: { value: 'admin' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit'));
    });

    expect(screen.getByTestId('text-field-error')).not.toBeUndefined();
  });

  test('Forgot password', async () => {
    const props = {
      onForgotPassword: jest.fn()
    };

    setup(props);

    await act(async () => {
      fireEvent.click(screen.getByTestId('forgotpassword'));
    });

    expect(props.onForgotPassword).toBeCalled();
  });

  test('Register', async () => {
    const props = {
      onRegister: jest.fn()
    };

    setup(props);

    await act(async () => {
      fireEvent.click(screen.getByTestId('register'));
    });

    expect(props.onRegister).toBeCalled();
  });

});
