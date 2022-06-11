import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { FooterLinks } from './FooterLinks';
import { MedplumLink } from './MedplumLink';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MockClient();

describe('FooterLinks', () => {
  test('Renders', async () => {
    const onHelp = vi.fn();

    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <FooterLinks>
            <MedplumLink onClick={onHelp}>Help</MedplumLink>
          </FooterLinks>
        </MedplumProvider>
      </MemoryRouter>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Help'));
    });

    expect(onHelp).toHaveBeenCalled();
  });
});
