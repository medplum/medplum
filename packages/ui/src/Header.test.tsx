import { Bundle } from '@medplum/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { Header, HeaderProps } from './Header';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';

const searchResult: Bundle = {
  resourceType: 'Bundle',
  entry: [{
    resource: {
      resourceType: 'Patient',
      id: '123',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }]
    }
  }, {
    resource: {
      resourceType: 'Patient',
      id: '345',
      name: [{
        given: ['Bob'],
        family: 'Jones'
      }]
    }
  }]
};

const medplum = new MockClient({
  'auth/login': {
    'POST': {
      profile: { reference: 'Practitioner/123' }
    }
  },
  'fhir/R4/Patient?name=Alice': {
    'GET': searchResult
  }
});

function setup(props?: HeaderProps) {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <Header {...props} />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('Header', () => {

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

  test.skip('Switch accounts', async () => {
    Object.defineProperty(window, 'location', { value: { reload: jest.fn() } });

    // const signInResult = await medplum.signIn('patient@example.com', 'password', 'patient', 'openid');
    // expect(signInResult.id).toEqual('456');
    expect(medplum.getLogins().length).toEqual(2);
    expect(medplum.getProfile()?.id).toEqual('456');

    setup();

    await act(async () => {
      // Open the profile menu
      fireEvent.click(screen.getByTestId('header-profile-menu-button'));
    });

    expect(screen.getByText('Test Patient')).not.toBeUndefined();
    expect(screen.getByText('Practitioner/123')).not.toBeUndefined();
    expect(screen.getByText('Project/1')).not.toBeUndefined();

    await act(async () => {
      // Change to the patient profile
      fireEvent.click(screen.getByText('Project/1'));
    });

    await waitFor(async () => expect(medplum.getProfile()?.id).toEqual('456'));

    expect(medplum.getProfile()?.id).toEqual('123');
  });

});
