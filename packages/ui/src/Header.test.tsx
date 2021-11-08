import { Bundle, MedplumClient, Patient } from '@medplum/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { Header, HeaderProps } from './Header';
import { MedplumProvider } from './MedplumProvider';

function mockSearch(): Bundle {
  return {
    resourceType: 'Bundle',
    entry: [{
      resource: {
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{
          given: ['Alice'],
          family: 'Smith'
        }]
      }
    }, {
      resource: {
        resourceType: 'Patient',
        id: randomUUID(),
        name: [{
          given: ['Bob'],
          family: 'Jones'
        }]
      }
    }]
  };
}

function mockPatient(): Patient {
  return {
    resourceType: 'Patient',
    id: '123',
    name: [{
      given: ['Alice'],
      family: 'Smith'
    }]
  }
}

function mockFetch(url: string, options: any): Promise<any> {
  let result: any;

  if (url.endsWith('/auth/login')) {
    if (options.body.includes('admin@medplum.com')) {
      result = {
        project: {
          resourceType: 'Project',
          id: 'p1',
          name: 'Project 1'
        },
        profile: {
          resourceType: 'Practitioner',
          id: '123',
          name: [{
            given: ['Medplum'],
            family: 'Admin'
          }]
        }
      };
    } else if (options.body.includes('patient@example.com')) {
      result = {
        project: {
          resourceType: 'Project',
          id: 'p2',
          name: 'Project 2'
        },
        profile: {
          resourceType: 'Patient',
          id: '456',
          name: [{
            given: ['Test'],
            family: 'Patient'
          }]
        }
      };
    }
  } else if (url.includes('/fhir/R4/Patient?name=')) {
    result = mockSearch();
  } else if (url.includes('/fhir/R4/Patient/123')) {
    result = mockPatient();
  } else {
    console.log('fetch', options.method, url);
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

function setup(props?: HeaderProps) {
  render(
    <MedplumProvider medplum={medplum}>
      <Header {...props} />
    </MedplumProvider>
  );
}

describe('Header', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', () => {
    setup();
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  test('Renders sidebar links', async () => {
    setup({
      sidebarLinks: [
        { title: 'section 1', links: [{ label: 'label 1', href: 'href1' }] },
        { title: 'section 2', links: [{ label: 'label 2', href: 'href2' }] }
      ]
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-menu-button'));
    });

    expect(screen.getByText('section 1')).not.toBeUndefined();
    expect(screen.getByText('label 1')).not.toBeUndefined();
  });

  test('Search', async () => {
    setup();

    const input = screen.getByTestId('input-element') as HTMLInputElement;

    // Enter "Alice"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await waitFor(() => screen.getByTestId('dropdown'));
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Alice Smith')).not.toBeUndefined();
  });

  test('Profile menu', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    expect(screen.getByText('Sign out of all accounts')).not.toBeUndefined();
  });

  test('Manage account button', async () => {
    const onProfile = jest.fn();

    setup({ onProfile });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Manage your account'));
    });

    expect(onProfile).toHaveBeenCalled();
  });

  test('Sign out button', async () => {
    const onSignOut = jest.fn();

    setup({ onSignOut });

    await act(async () => {
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Sign out of all accounts'));
    });

    expect(onSignOut).toHaveBeenCalled();
  });

  test('Switch accounts', async () => {
    Object.defineProperty(window, 'location', { value: { reload: jest.fn() } });

    const signInResult = await medplum.signIn('patient@example.com', 'password', 'patient', 'openid');
    expect(signInResult.id).toEqual('456');
    expect(medplum.getLogins().length).toEqual(2);
    expect(medplum.getProfile()?.id).toEqual('456');

    setup();

    await act(async () => {
      // Open the profile menu
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    expect(screen.getByText('Test Patient')).not.toBeUndefined();
    expect(screen.getByText('Medplum Admin')).not.toBeUndefined();
    expect(screen.getByText('Project: Project 1')).not.toBeUndefined();

    await act(async () => {
      // Change to the patient profile
      fireEvent.click(screen.getByText('Project: Project 1'));
    });

    expect(medplum.getProfile()?.id).toEqual('123');
  });

});
