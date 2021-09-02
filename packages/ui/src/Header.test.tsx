import { Bundle, MedplumClient, Patient } from '@medplum/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { Header, HeaderProps } from './Header';
import { MedplumProvider } from './MedplumProvider';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

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
    result = {
      profile: {
        resourceType: 'Practitioner',
        id: '123'
      }
    };
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
    <MedplumProvider medplum={medplum} router={mockRouter}>
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
    expect(screen.getByTestId('header')).not.toBeUndefined();
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

    expect(screen.getByText('Sign out')).not.toBeUndefined();
  });

});
