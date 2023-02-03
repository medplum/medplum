import { MantineProvider } from '@mantine/core';
import { NotificationsProvider } from '@mantine/notifications';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bot, Bundle, OperationOutcome, Practitioner, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { Loading } from '../components/Loading';

describe('ResourcePage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <NotificationsProvider>
                <ErrorBoundary>
                  <Suspense fallback={<Loading />}>
                    <AppRoutes />
                  </Suspense>
                </ErrorBoundary>
              </NotificationsProvider>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test.skip('Not found', async () => {
    await setup('/Practitioner/not-found');
    await waitFor(() => screen.getByText('Not found'));
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });

  test('Details tab renders', async () => {
    await setup('/Practitioner/123/details');
    await waitFor(() => screen.queryAllByText('Name'));
    expect(screen.queryAllByText('Name')[0]).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });

  test('Edit tab renders', async () => {
    await setup('/Practitioner/123/edit');
    await waitFor(() => screen.getByText('Edit'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  test('Delete button on edit page', async () => {
    await setup('/Practitioner/123/edit');
    await waitFor(() => screen.getByText('Delete'));
    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    await waitFor(() => screen.getByText('Are you sure you want to delete this Practitioner?'));
    expect(screen.getByText('Are you sure you want to delete this Practitioner?')).toBeInTheDocument();
  });

  test('Delete button confirm', async () => {
    // Create a practitioner that we can delete
    const medplum = new MockClient();
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
    });

    await setup(`/Practitioner/${practitioner.id}/delete`, medplum);
    await waitFor(() => screen.getByText('Delete'));
    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    try {
      await medplum.readResource('Practitioner', practitioner.id as string);
      fail('Should have thrown');
    } catch (err) {
      expect((err as OperationOutcome).id).toEqual('not-found');
    }
  });

  test('History tab renders', async () => {
    await setup('/Practitioner/123/history');
    await waitFor(() => screen.getByText('History'));

    expect(screen.getByText('History')).toBeInTheDocument();
  });

  test('Blame tab renders', async () => {
    await setup('/Practitioner/123/blame');
    await waitFor(() => screen.getByText('Blame'));

    expect(screen.getByText('Blame')).toBeInTheDocument();
  });

  test('JSON tab renders', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('JSON submit', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('resource-json'), {
        target: { value: '{"resourceType":"Practitioner","id":"123"}' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('JSON submit with meta', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('resource-json'), {
        target: {
          value: JSON.stringify({
            resourceType: 'Practitioner',
            id: '123',
            meta: {
              lastUpdated: '2020-01-01T00:00:00.000Z',
              author: {
                reference: 'Practitioner/111',
              },
            },
          }),
        },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('Patient timeline', async () => {
    await setup('/Patient/123/timeline');
    await waitFor(() => screen.getByText('Timeline'));

    expect(screen.getByText('Timeline')).toBeInTheDocument();

    // Expect identifiers
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  test('Encounter timeline', async () => {
    await setup('/Encounter/123/timeline');
    await waitFor(() => screen.getByText('Timeline'));

    expect(screen.getByText('Timeline')).toBeInTheDocument();
  });

  test('Questionnaire builder', async () => {
    await setup('/Questionnaire/123/builder');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Save')).toBeDefined();
  });

  test('Questionnaire preview', async () => {
    await setup('/Questionnaire/123/preview');
    await waitFor(() => screen.getByText('Preview'));

    expect(screen.getByText('Preview')).toBeInTheDocument();

    window.alert = jest.fn();
    fireEvent.click(screen.getByText('OK'));
    expect(window.alert).toHaveBeenCalledWith('You submitted the preview');
  });

  test('Questionnaire bots', async () => {
    const medplum = new MockClient();
    const bot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Test Bot',
    });
    expect(bot.id).toBeDefined();

    await setup('/Questionnaire/123/bots');
    await waitFor(() => screen.getByText('Connect to bot'));

    expect(screen.getByText('Connect to bot')).toBeInTheDocument();

    // Select "Test Bot" in the bot input field

    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    // Click on "Connect"
    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
    });

    // Bot subscription should now be listed
    expect(screen.getByText('Criteria: QuestionnaireResponse?questionnaire=Questionnaire/123')).toBeInTheDocument();
  });

  test('Bot editor', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Editor'));

    expect(screen.getByText('Editor')).toBeInTheDocument();
  });

  test('DiagnosticReport display', async () => {
    await setup('/DiagnosticReport/123/report');
    await waitFor(() => screen.getByText('Report'));

    expect(screen.getByText('Report')).toBeInTheDocument();
  });

  test('RequestGroup checklist', async () => {
    await setup('/RequestGroup/workflow-request-group-1/checklist');
    await waitFor(() => screen.getByText('Checklist'));

    expect(screen.getByText('Checklist')).toBeInTheDocument();
  });

  test('PlanDefinition apply', async () => {
    await setup('/PlanDefinition/workflow-plan-definition-1/apply');
    await waitFor(() => screen.getByText('Subject'));

    expect(screen.getByText('Subject')).toBeInTheDocument();
  });

  test('Left click on tab', async () => {
    window.open = jest.fn();

    await setup('/Practitioner/123/details');

    await act(async () => {
      fireEvent.click(screen.getByText('History'));
    });

    // Change the tab
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');

    // Do not open a new browser tab
    expect(window.open).not.toHaveBeenCalled();
  });

  test('No apps found', async () => {
    await setup('/Bot/123/apps');
    await waitFor(() => screen.getByText('No apps found.', { exact: false }));

    expect(screen.getByText('No apps found.', { exact: false })).toBeInTheDocument();
  });

  test('Patient apps', async () => {
    await setup('/Patient/123/apps');
    await waitFor(() => screen.getByText('Apps'));

    expect(screen.getByText('Apps')).toBeInTheDocument();
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  test('Patient Smart App Launch', async () => {
    global.window = Object.create(window);
    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
      },
      writable: true,
    });

    await setup('/Patient/123/apps');
    await waitFor(() => screen.getByText('Apps'));

    expect(screen.getByText('Inferno Client')).toBeInTheDocument();
    expect(screen.getByText('Client application used for Inferno ONC compliance testing')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Inferno Client'));
    });

    expect(window.location.assign).toBeCalled();
  });

  test('Encounter Smart App Launch', async () => {
    global.window = Object.create(window);
    Object.defineProperty(window, 'location', {
      value: {
        assign: jest.fn(),
      },
      writable: true,
    });

    await setup('/Encounter/123/apps');
    await waitFor(() => screen.getByText('Apps'));

    expect(screen.getByText('Inferno Client')).toBeInTheDocument();
    expect(screen.getByText('Client application used for Inferno ONC compliance testing')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Inferno Client'));
    });

    expect(window.location.assign).toBeCalled();
  });
});
