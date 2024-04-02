import { allOk } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { Loading, MedplumProvider } from '@medplum/react';
import { randomUUID } from 'crypto';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { RESOURCE_TYPE_CREATION_PATHS, getDefaultFields } from './HomePage.utils';
import { act, fireEvent, render, screen, waitFor } from './test-utils/render';

async function setup(url = '/Patient', medplum = new MockClient()): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Suspense fallback={<Loading />}>
            <AppRoutes />
          </Suspense>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('HomePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('Renders default page', async () => {
    await setup('/');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Renders with resourceType', async () => {
    await setup('/Patient');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Renders with resourceType and fields', async () => {
    await setup('/Patient?_fields=id,_lastUpdated,name,birthDate,gender');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Next page button', async () => {
    await setup();
    expect(await screen.findByLabelText('Next page')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'));
    });
  });

  test('Prev page button', async () => {
    await setup();
    expect(await screen.findByLabelText('Previous page')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Previous page'));
    });
  });

  test('New button', async () => {
    await setup();
    expect(await screen.findByText('New...')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('New...'));
    });
  });

  test('New button on Bot page', async () => {
    const medplum = new MockClient();
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });

    // check that Bot is still included in RESOURCE_TYPE_CREATION_PATHS
    expect(typeof RESOURCE_TYPE_CREATION_PATHS['Bot']).toBe('string');

    await setup(`/Bot`, medplum);
    expect(await screen.findByText('New...')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('New...'));
    });

    expect(screen.getByText('Create new Bot')).toBeInTheDocument();
  });

  test('Delete button, cancel', async () => {
    window.confirm = jest.fn(() => false);

    await setup();
    expect(await screen.findByText('Delete...')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete...'));
    });
  });

  test('Delete button, ok', async () => {
    const family = randomUUID();

    // Create a practitioner that we can delete
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family }],
    });

    window.confirm = jest.fn(() => true);

    await setup('/Patient', medplum);

    // Make sure the patient is on the screen
    expect(await screen.findByText(family)).toBeInTheDocument();

    expect(await screen.findByText('Delete...')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText(`Checkbox for ${patient.id}`));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete...'));
    });

    // Make sure the patient is *not* on the screen
    await waitFor(() => screen.queryByText(family) === null);
  });

  test('Export CSV button', async () => {
    window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/blob');
    window.open = jest.fn();

    // Mock the export operation
    const medplum = new MockClient();
    medplum.router.router.add('GET', ':resourceType/$csv', async () => [allOk]);

    await setup('/Patient', medplum);
    expect(await screen.findByText('Export...')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Export...'));
    });

    const exportButton = await screen.findByText('Export as CSV');
    await act(async () => {
      fireEvent.click(exportButton);
    });

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalled();
  });

  test('Export Transaction Bundle button', async () => {
    const medplum = new MockClient();
    medplum.router.router.add('GET', ':resourceType/', async () => [allOk]);
    HTMLAnchorElement.prototype.click = jest.fn();

    await setup('/Patient', medplum);
    expect(await screen.findByText('Export...')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Export...'));
    });

    const exportButton = await screen.findByText('Export as Transaction Bundle');
    await act(async () => {
      fireEvent.click(exportButton);
    });
    expect(screen.getByText('Export as Transaction Bundle')).toBeInTheDocument();
  });

  test('Default search fields', () => {
    expect(getDefaultFields('AccessPolicy')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('ClientApplication')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('CodeSystem')).toEqual(['id', '_lastUpdated', 'name', 'title', 'status']);
    expect(getDefaultFields('Condition')).toEqual(['id', '_lastUpdated', 'subject', 'code', 'clinicalStatus']);
    expect(getDefaultFields('Device')).toEqual(['id', '_lastUpdated', 'manufacturer', 'deviceName', 'patient']);
    expect(getDefaultFields('DeviceDefinition')).toEqual(['id', '_lastUpdated', 'manufacturer[x]', 'deviceName']);
    expect(getDefaultFields('DeviceRequest')).toEqual(['id', '_lastUpdated', 'code[x]', 'subject']);
    expect(getDefaultFields('DiagnosticReport')).toEqual(['id', '_lastUpdated', 'subject', 'code', 'status']);
    expect(getDefaultFields('Encounter')).toEqual(['id', '_lastUpdated', 'subject']);
    expect(getDefaultFields('Observation')).toEqual(['id', '_lastUpdated', 'subject', 'code', 'status']);
    expect(getDefaultFields('Organization')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('Patient')).toEqual(['id', '_lastUpdated', 'name', 'birthDate', 'gender']);
    expect(getDefaultFields('Practitioner')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('Project')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('Questionnaire')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('ServiceRequest')).toEqual([
      'id',
      '_lastUpdated',
      'subject',
      'code',
      'status',
      'orderDetail',
    ]);
    expect(getDefaultFields('Subscription')).toEqual(['id', '_lastUpdated', 'criteria']);
    expect(getDefaultFields('User')).toEqual(['id', '_lastUpdated', 'email']);
    expect(getDefaultFields('ValueSet')).toEqual(['id', '_lastUpdated', 'name', 'title', 'status']);
  });

  test('Left click on row', async () => {
    window.open = jest.fn();

    await setup('/Patient');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Homer Simpson'));
    });

    // Change the tab
    expect(screen.getByText('Timeline')).toBeInTheDocument();

    // Do not open a new browser tab
    expect(window.open).not.toHaveBeenCalled();
  });

  test('Middle click on row', async () => {
    window.open = jest.fn();

    await setup('/Patient');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Homer Simpson'), { button: 1 });
    });

    // Should open a new browser tab
    expect(window.open).toHaveBeenCalledWith('/Patient/123', '_blank');

    // Should still be on the home page
    expect(screen.getByTestId('search-control')).toBeInTheDocument();
  });
});
