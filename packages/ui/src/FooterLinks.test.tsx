import { MedplumClient } from '@medplum/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { FooterLinks } from './FooterLinks';
import { MedplumLink } from './MedplumLink';
import { MedplumProvider } from './MedplumProvider';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: (() => undefined) as any
});

describe('FooterLinks', () => {

  test('Renders', async () => {
    const onHelp = jest.fn();

    render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <FooterLinks>
          <MedplumLink onClick={onHelp}>Help</MedplumLink>
        </FooterLinks>
      </MedplumProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Help'));
    });

    expect(onHelp).toHaveBeenCalled();
  });

});
