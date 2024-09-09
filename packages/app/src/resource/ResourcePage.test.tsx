import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { OperationOutcomeError } from '@medplum/core';
import { Bot, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

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
    expect(await screen.findByText('Not found')).toBeInTheDocument();
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });

  test('Details tab renders', async () => {
    await setup('/Practitioner/123/details');
    expect((await screen.findAllByText('Name'))[0]).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });

  test('Delete button confirm', async () => {
    // Create a practitioner that we can delete
    const medplum = new MockClient();
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
    });

    await setup(`/Practitioner/${practitioner.id}/delete`, medplum);
    expect(await screen.findByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    try {
      await medplum.readResource('Practitioner', practitioner.id as string);
      fail('Should have thrown');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('History tab renders', async () => {
    await setup('/Practitioner/123/history');
    expect(await screen.findByText('History')).toBeInTheDocument();
  });

  test('Blame tab renders', async () => {
    await setup('/Practitioner/123/blame');
    expect(await screen.findByText('Blame')).toBeInTheDocument();
  });

  test('Patient timeline', async () => {
    await setup('/Patient/123/timeline');
    expect(await screen.findByText('Timeline')).toBeInTheDocument();

    // Expect identifiers
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  test('Encounter timeline', async () => {
    await setup('/Encounter/123/timeline');
    expect(await screen.findByText('Timeline')).toBeInTheDocument();
  });

  test('Questionnaire preview', async () => {
    await setup('/Questionnaire/123/preview');
    expect(await screen.findByText('Preview')).toBeInTheDocument();

    window.alert = jest.fn();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

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
    expect(await screen.findByText('Connect to bot')).toBeInTheDocument();

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
    expect(await screen.findByText('Editor')).toBeInTheDocument();
  });

  test('DiagnosticReport display', async () => {
    await setup('/DiagnosticReport/123/report');
    expect(await screen.findByText('Report')).toBeInTheDocument();
  });

  test('RequestGroup checklist', async () => {
    await setup('/RequestGroup/workflow-request-group-1/checklist');
    expect(await screen.findByText('Checklist')).toBeInTheDocument();
  });

  test('PlanDefinition apply', async () => {
    await setup('/PlanDefinition/workflow-plan-definition-1/apply');
    expect(await screen.findByText('Subject')).toBeInTheDocument();
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
