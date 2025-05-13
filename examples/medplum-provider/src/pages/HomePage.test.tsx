import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { HomePage } from './HomePage';

const medplum = new MockClient();

async function setup(): Promise<void> {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <HomePage />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('HomePage', () => {
  test('Renders', async () => {
    await setup();
    
    expect(screen.getByRole('heading')).toBeInTheDocument();
    
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
});
