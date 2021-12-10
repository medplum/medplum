import { MedplumProvider, MockClient } from '@medplum/ui';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectPage } from './ProjectPage';

const medplum = new MockClient({
  'admin/projects/123': {
    'GET': {
      project: { id: '123', name: 'Project 123' },
      members: [
        { profile: 'Practitioner/456', name: 'Alice Smith' }
      ]
    }
  },
  'fhir/R4/Practitioner/456': {
    'GET': {
      resourceType: 'Practitioner',
      id: '456',
      name: [{
        given: ['Alice'],
        family: 'Smith'
      }]
    }
  }
});

const setup = (url: string) => {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <Routes>
          <Route path="/admin/project" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    </MedplumProvider>
  );
};

describe('ProjectPage', () => {

  test('Renders', async () => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/456'
      },
      project: {
        reference: 'Project/123'
      }
    });

    setup('/admin/project');

    await act(async () => {
      await waitFor(() => screen.getByText('Alice Smith'));
    });

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

});
