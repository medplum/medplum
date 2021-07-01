import { MedplumClient } from '@medplum/core';
import React from 'react';
import ReactDOM from 'react-dom';
import { Header } from './Header';
import { MedplumProvider } from './MedplumProvider';

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'test client id',
  fetch: async (url: string, options: any) => {
    console.log('fetch', url, options);
    return {};
  }
});

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
};

test('Header renders', () => {
  const div = document.createElement('div');
  ReactDOM.render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <Header />
    </MedplumProvider>,
    div);
});

test('Header renders with sidebar links', () => {
  const div = document.createElement('div');
  ReactDOM.render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <Header
        sidebarLinks={[
          { title: 'section 1', links: [{ label: 'label 1', href: 'href1' }] },
          { title: 'section 2', links: [{ label: 'label 2', href: 'href2' }] }
        ]}
      />
    </MedplumProvider>,
    div);
});
