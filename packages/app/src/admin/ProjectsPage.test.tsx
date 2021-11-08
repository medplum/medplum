import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { ProjectsPage } from './ProjectsPage';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  let result: any;

  if (options.method === 'GET' && url.endsWith('/admin/projects')) {
    result = {
      projects: [
        { id: '123', name: 'Project 123' },
        { id: '456', name: 'Project 456' }
      ]
    };
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

const setup = () => {
  render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <ProjectsPage />
    </MedplumProvider>
  );
};

describe('ProjectsPage', () => {

  test('Renders', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByText('Project 123'));
    });

    expect(screen.getByText('Project 123')).toBeInTheDocument();
  });

});
