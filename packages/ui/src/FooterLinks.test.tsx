import { MedplumClient } from '@medplum/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { FooterLinks } from './FooterLinks';
import { MedplumLink } from './MedplumLink';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: (() => undefined) as any
});

describe('FooterLinks', () => {

  test('Renders', async () => {
    const onHelp = jest.fn();

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
