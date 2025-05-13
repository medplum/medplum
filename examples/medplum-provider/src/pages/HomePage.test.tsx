import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { describe, test, expect } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  test('Component renders correctly', async () => {
    const medplum = new MockClient();
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });

    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </MedplumProvider>
    );

    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
});
