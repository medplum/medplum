import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bot, Bundle, Practitioner, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';

describe('ResourcePage', () => {
  async function setup(url: string, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
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

  test('Not found', async () => {
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

    // When deleted button is clicked, confirm Last Updated should appear
    expect(screen.getByText('Last Updated')).toBeInTheDocument();
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

    const input = screen.getByRole('combobox') as HTMLInputElement;

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
});
