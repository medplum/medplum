import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import { describe, test, expect, vi } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  test('Renders', async () => {
    const medplum = new MockClient();
    
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <HomePage />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
    
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });
});
