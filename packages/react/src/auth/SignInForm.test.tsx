import { Title } from '@mantine/core';
import { allOk, badRequest, GoogleCredentialResponse, MedplumClient } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import crypto from 'crypto';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TextEncoder } from 'util';
import { MedplumProvider } from '@medplum/react-hooks';
import { SignInForm, SignInFormProps } from './SignInForm';

function mockFetch(url: string, options: any): Promise<any> {
  let status = 404;
  let result: any;

  if (options.method === 'POST' && url.endsWith('/auth/method')) {
    const { email } = JSON.parse(options.body);
    status = 200;
    if (email === 'alice@external.example.com') {
      result = {
        authorizeUrl: 'https://external.example.com/authorize',
        domain: 'external.example.com',
      };
    } else {
      result = {};
    }
  } else if (options.method === 'POST' && url.endsWith('/auth/login')) {
    const { email, password } = JSON.parse(options.body);
    if (email === 'admin@example.com' && password === 'admin') {
      status = 200;
      result = {
        login: '1',
        code: '1',
      };
    } else if (email === 'newproject@example.com' && password === 'newproject') {
      status = 200;
      result = {
        login: '1',
      };
    } else if (email === 'multiple@medplum.com' && password === 'admin') {
      status = 200;
      result = {
        login: '2',
        memberships: [
          {
            id: '100',
            profile: {
              reference: 'Practitioner/123',
              display: 'Alice Smith',
            },
            project: {
              reference: 'Project/1',
              display: 'Project 1',
            },
          },
          {
            id: '101',
            profile: {
              reference: 'Practitioner/234',
              display: 'Bob Jones',
            },
            project: {
              reference: 'Project/2',
              display: 'Project 2',
            },
          },
        ],
      };
    } else {
      status = 400;
      result = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            details: {
              text: 'Email or password is invalid',
            },
          },
        ],
      };
    }
  } else if (options.method === 'POST' && url.endsWith('auth/google')) {
    status = 200;
    result = {
      login: '1',
      code: '1',
    };
  } else if (options.method === 'POST' && url.endsWith('auth/newproject')) {
    status = 200;
    result = {
      login: '1',
      code: '1',
    };
  } else if (options.method === 'POST' && url.endsWith('auth/profile')) {
    const { profile } = JSON.parse(options.body);
    if (profile === '101') {
      status = 400;
      result = badRequest('Invalid IP address');
    } else {
      status = 200;
      result = {
        login: '1',
        code: '1',
      };
    }
  } else if (options.method === 'POST' && url.endsWith('auth/scope')) {
    status = 200;
    result = {
      login: '1',
      code: '1',
    };
  } else if (options.method === 'GET' && url.endsWith('Practitioner/123')) {
    status = 200;
    result = {
      resourceType: 'Practitioner',
      id: '123',
      name: [{ given: ['Medplum'], family: ['Admin'] }],
    };
  } else if (options.method === 'POST' && url.endsWith('/oauth2/token')) {
    status = 200;
    result = {
      access_token:
        'header.' + window.btoa(JSON.stringify({ client_id: 'my-client-id', login_id: '123' })) + '.signature',
      refresh_token: 'header.' + window.btoa(JSON.stringify({ client_id: 'my-client-id' })) + '.signature',
      expires_in: 1,
      token_type: 'Bearer',
      scope: 'openid',
      project: { reference: 'Project/123' },
      profile: { reference: 'Practitioner/123' },
    };
  } else if (options.method === 'GET' && url.endsWith('auth/me')) {
    status = 200;
    result = {
      profile: {
        resourceType: 'Practitioner',
        id: '123',
        name: [{ given: ['Medplum'], family: ['Admin'] }],
      },
    };
  } else if (url.endsWith('/oauth2/logout')) {
    status = 200;
    result = allOk;
  } else {
    console.log(options.method, url);
  }

  const response: any = {
    request: {
      url,
      options,
    },
    status,
    ...result,
  };

  return Promise.resolve({
    status,
    ok: status < 400,
    headers: { get: () => 'application/fhir+json' },
    json: () => Promise.resolve(response),
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch,
});

async function setup(args?: SignInFormProps): Promise<void> {
  await medplum.signOut();

  const props = {
    onSuccess: jest.fn(),
    ...args,
  };

  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <SignInForm {...props}>
            <Title>Sign in to Medplum</Title>
          </SignInForm>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('SignInForm', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global.self, 'crypto', {
      value: crypto.webcrypto,
    });
  });

  test('Renders', async () => {
    await setup();
    const input = screen.getByText('Sign in to Medplum') as HTMLButtonElement;
    expect(input.innerHTML).toBe('Sign in to Medplum');
  });

  test('Submit success', async () => {
    let success = false;

    await setup({
      onSuccess: () => (success = true),
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
        target: { value: 'admin' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => expect(medplum.getProfile()).toBeDefined());

    expect(success).toBe(true);
  });

  test('Submit success with onCode', async () => {
    let code: string | undefined = undefined;

    await setup({
      onCode: (c) => (code = c),
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
        target: { value: 'admin' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => expect(code).toBeDefined());
    expect(code).toBeDefined();
  });

  test('Submit success without callback', async () => {
    await setup({});
    expect(medplum.getProfile()).toBeUndefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
        target: { value: 'admin' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => expect(medplum.getProfile()).toBeDefined());

    expect(medplum.getProfile()).toBeDefined();
  });

  test('Submit success multiple profiles', async () => {
    let success = false;

    await setup({
      onSuccess: () => (success = true),
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'multiple@medplum.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
        target: { value: 'admin' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => expect(screen.getByText('Choose profile')).toBeDefined());
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Alice Smith'));
    });

    await waitFor(() => expect(medplum.getProfile()).toBeDefined());

    expect(success).toBe(true);
  });

  test('Multiple profiles invalid IP address', async () => {
    let success = false;

    await setup({
      onSuccess: () => (success = true),
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'multiple@medplum.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
        target: { value: 'admin' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => expect(screen.getByText('Choose profile')).toBeDefined());
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Bob Jones'));
    });

    await waitFor(() => screen.getByText('Invalid IP address'));

    expect(success).toBe(false);
  });

  test('Choose scope', async () => {
    let success = false;

    await setup({
      chooseScopes: true,
      scope: 'openid profile',
      onSuccess: () => (success = true),
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'admin@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
        target: { value: 'admin' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => expect(screen.getByText('Choose scope')).toBeDefined());
    expect(screen.getByText('openid')).toBeInTheDocument();
    expect(screen.getByText('profile')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Set scope'));
    });

    expect(success).toBe(true);
  });

  test('Submit success new project', async () => {
    let success = false;

    await setup({
      onSuccess: () => (success = true),
      projectId: 'new',
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'newproject@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), { target: { value: 'newproject' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => screen.getByLabelText('Project Name', { exact: false }));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Project Name', { exact: false }), { target: { value: 'My Project' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    });

    expect(success).toBe(true);
  });

  test('User not found', async () => {
    await setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'not-found@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
        target: { value: 'admin' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => screen.getByTestId('text-field-error'));

    expect(screen.getByTestId('text-field-error')).toBeInTheDocument();
    expect(screen.getByText('Email or password is invalid')).toBeInTheDocument();
  });

  test('Incorrect password', async () => {
    await setup();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'not-found@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
        target: { value: 'admin' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in'));
    });

    await waitFor(() => expect(screen.getByTestId('text-field-error')).toBeInTheDocument());

    expect(screen.getByTestId('text-field-error')).toBeInTheDocument();
    expect(screen.getByText('Email or password is invalid')).toBeInTheDocument();
  });

  test('Forgot password', async () => {
    const props = {
      onForgotPassword: jest.fn(),
      onSuccess: jest.fn(),
    };

    await setup(props);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'forgot@example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Forgot password'));
    });

    expect(props.onForgotPassword).toBeCalled();
  });

  test('Register', async () => {
    const props = {
      onRegister: jest.fn(),
      onSuccess: jest.fn(),
    };

    await setup(props);

    await act(async () => {
      fireEvent.click(screen.getByText('Register'));
    });

    expect(props.onRegister).toBeCalled();
  });

  test('Disable Email', async () => {
    const onSuccess = jest.fn();

    await act(async () => {
      await setup({
        onSuccess,
        disableEmailAuth: true,
        googleClientId: '123',
      });
    });

    expect(screen.queryByText('Email', { exact: false })).toBeNull();
    expect(screen.queryByText('Next')).toBeNull();
    expect(screen.queryByText('or')).toBeNull();
  });

  test('Disable Google auth', async () => {
    const google = {
      accounts: {
        id: {
          initialize: jest.fn(),
          renderButton: jest.fn(),
        },
      },
    };

    (window as any).google = google;

    const onSuccess = jest.fn();

    await act(async () => {
      await setup({
        onSuccess,
        disableGoogleAuth: true,
        googleClientId: '123',
      });
    });

    await waitFor(() => screen.getByLabelText('Email', { exact: false }));
    expect(screen.queryByText('Sign in with Google')).toBeNull();
    expect(google.accounts.id.initialize).not.toHaveBeenCalled();
    expect(google.accounts.id.renderButton).not.toHaveBeenCalled();
  });

  test('Google success', async () => {
    const clientId = '123';
    let callback: ((response: GoogleCredentialResponse) => void) | undefined = undefined;

    const google = {
      accounts: {
        id: {
          initialize: jest.fn((args: any) => {
            callback = args.callback;
          }),
          renderButton: jest.fn((parent: HTMLElement) => {
            const button = document.createElement('div');
            button.innerHTML = 'Sign in with Google';
            button.addEventListener('click', () => google.accounts.id.prompt());
            parent.appendChild(button);
          }),
          prompt: jest.fn(() => {
            if (callback) {
              callback({
                clientId,
                credential: '123123123',
              });
            }
          }),
        },
      },
    };

    (window as any).google = google;

    const onSuccess = jest.fn();

    await act(async () => {
      await setup({
        onSuccess,
        googleClientId: clientId,
      });
    });

    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByText('Sign in with Google'));
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Success')).toBeInTheDocument());

    expect(google.accounts.id.initialize).toHaveBeenCalled();
    expect(google.accounts.id.renderButton).toHaveBeenCalled();
    expect(google.accounts.id.prompt).toHaveBeenCalled();
  });

  test('Redirect to external auth', async () => {
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: function (key: string): string {
          return this[key];
        },
        setItem: function (key: string, value: string): void {
          this[key] = value;
        },
      },
      writable: true,
    });
    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
      },
      writable: true,
    });

    await setup({});

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email', { exact: false }), {
        target: { value: 'alice@external.example.com' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await waitFor(() => expect(window.location.assign).toBeCalled());
    expect(window.location.assign).toBeCalled();
  });
});
