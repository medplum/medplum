import { MedplumProvider, MockClient } from '@medplum/ui';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { ProjectsPage } from './ProjectsPage';

const medplum = new MockClient({
  'admin/projects': {
    'GET': {
      projects: [
        { id: '123', name: 'Project 123' },
        { id: '456', name: 'Project 456' }
      ]
    }
  }
});

const setup = () => {
  render(
    <MedplumProvider medplum={medplum}>
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
