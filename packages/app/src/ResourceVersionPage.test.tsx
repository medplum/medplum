import { Bundle, MedplumClient, notFound, Practitioner, User } from '@medplum/core';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResourceVersionPage } from './ResourceVersionPage';

const user: User = {
  resourceType: 'User',
  id: '123'
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: '123',
  name: [{ given: ['Medplum'], family: 'Admin' }],
  active: true,
  meta: {
    versionId: '2',
    lastUpdated: '2021-01-02T12:00:00Z',
    author: {
      reference: 'Practitioner/123'
    }
  }
};

const practitionerHistory: Bundle = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: practitioner
    },
    {
      resource: {
        resourceType: 'Practitioner',
        id: '123',
        name: [{ given: ['Medplum'], family: 'Admin' }],
        meta: {
          versionId: '1',
          lastUpdated: '2021-01-01T12:00:00Z',
          author: {
            reference: 'Practitioner/123'
          }
        }
      }
    }
  ]
};

// const practitionerStructureBundle: Bundle = {
//   resourceType: 'Bundle',
//   entry: [{
//     resource: {
//       resourceType: 'StructureDefinition',
//       name: 'Practitioner',
//       snapshot: {
//         element: [
//           {
//             path: 'Practitioner.id',
//             type: [{
//               code: 'code'
//             }]
//           }
//         ]
//       }
//     }
//   }]
// };

// const practitionerSearchParameter: Bundle = {
//   resourceType: 'Bundle',
//   entry: [{
//     resource: {
//       resourceType: 'SearchParameter',
//       id: 'Practitioner-name',
//       code: 'name',
//       name: 'name'
//     }
//   }]
// };

// const patient: Patient = {
//   resourceType: 'Patient',
//   id: '123',
//   identifier: [
//     { system: 'abc', value: '123' },
//     { system: 'def', value: '456' }
//   ],
//   name: [{
//     given: ['Alice'],
//     family: 'Smith'
//   }],
//   birthDate: '1990-01-01'
// };

// const patientSearchBundle: Bundle = {
//   resourceType: 'Bundle',
//   total: 100,
//   entry: [{
//     resource: patient
//   }]
// };

// const questionnaire: Questionnaire = {
//   resourceType: 'Questionnaire',
//   id: '123',
//   item: [{
//     linkId: '1',
//     text: 'Hello',
//     type: 'string'
//   }]
// };

// const bot: Bot = {
//   resourceType: 'Bot',
//   id: '123',
//   name: 'Test Bot',
//   code: 'console.log("hello world");'
// };

// const diagnosticReport: DiagnosticReport = {
//   resourceType: 'DiagnosticReport',
//   id: '123',
//   status: 'final',
//   result: [
//     { reference: 'Observation/123' }
//   ]
// };

function mockFetch(url: string, options: any): Promise<any> {
  const method = options.method ?? 'GET';
  let result: any;

  if (method === 'POST' && url.endsWith('/auth/login')) {
    result = {
      user,
      profile: 'Practitioner/123'
    };
    // } else if (method === 'GET' && url.includes('/fhir/R4/StructureDefinition?name:exact=Practitioner')) {
    //   result = practitionerStructureBundle;
    // } else if (method === 'GET' && url.includes('/fhir/R4/SearchParameter?name=Practitioner')) {
    //   result = practitionerSearchParameter;
    // } else if (method === 'GET' && url.includes('/fhir/R4/Patient?')) {
    //   result = patientSearchBundle;
    // } else if (method === 'GET' && url.includes('/fhir/R4/Patient/123')) {
    //   result = patient;
    // } else if (method === 'GET' && url.includes('/fhir/R4/Patient/123/_history')) {
    //   result = patientSearchBundle;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123')) {
    result = practitioner;
    // } else if (method === 'PUT' && url.endsWith('/fhir/R4/Practitioner/123')) {
    //   result = practitioner;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/123/_history')) {
    result = practitionerHistory;
  } else if (method === 'GET' && url.endsWith('/fhir/R4/Practitioner/not-found/_history')) {
    result = notFound
    // } else if (method === 'GET' && url.endsWith('/fhir/R4/Questionnaire/123')) {
    //   result = questionnaire;
    // } else if (method === 'GET' && url.includes('/fhir/R4/Bot/123')) {
    //   result = bot;
    // } else if (method === 'GET' && url.includes('/fhir/R4/DiagnosticReport/123')) {
    //   result = diagnosticReport;
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

describe('ResourcePage', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (url: string) => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/:resourceType/:id/_history/:versionId/:tab" element={<ResourceVersionPage />} />
            <Route path="/:resourceType/:id/_history/:versionId" element={<ResourceVersionPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  };

  test('Resource not found', async () => {
    await act(async () => {
      setup('/Practitioner/not-found/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource not found'));
    });

    expect(screen.getByText('Resource not found')).toBeInTheDocument();
  });

  test('Version not found', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/3');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Version not found'));
    });

    expect(screen.getByText('Version not found')).toBeInTheDocument();
  });

  test('Diff tab renders', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    expect(screen.getByText('Diff')).toBeInTheDocument();
  });

  test('Diff tab renders last version', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/2');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    expect(screen.getByText('Diff')).toBeInTheDocument();
  });

  test('Raw tab renders', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1/raw');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Raw'));
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
  });

  test('Change tab', async () => {
    await act(async () => {
      setup('/Practitioner/123/_history/1');
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Diff'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Raw'));
    });

    expect(screen.getByText('Raw')).toBeInTheDocument();
  });

});
