import { createReference } from '@medplum/core';
import { HomerEncounter, HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { SmartAppLaunchLink } from './SmartAppLaunchLink';

const medplum = new MockClient();

describe('SmartAppLaunchLink', () => {
  function setup(children: ReactNode): void {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Happy path', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
      },
      writable: true,
    });

    setup(
      <SmartAppLaunchLink
        client={{ resourceType: 'ClientApplication', launchUri: 'https://example.com' }}
        patient={createReference(HomerSimpson)}
        encounter={createReference(HomerEncounter)}
      >
        My SmartAppLaunchLink
      </SmartAppLaunchLink>
    );

    expect(screen.getByText('My SmartAppLaunchLink')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('My SmartAppLaunchLink'));
    });

    await waitFor(() => expect(window.location.assign).toHaveBeenCalled());
    expect(window.location.assign).toHaveBeenCalled();

    const url = (window.location.assign as jest.Mock).mock.calls[0][0];
    expect(url).toContain('https://example.com');
    expect(url).toContain('launch=');
    expect(url).toContain('iss=');
  });
});
