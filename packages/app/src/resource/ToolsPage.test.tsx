import { Notifications } from '@mantine/notifications';
import { allOk, getReferenceString } from '@medplum/core';
import { Agent } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

const medplum = new MockClient();
medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
  allOk,
  { resourceType: 'Parameters', parameter: [{ name: 'status', valueCode: 'disconnected' }] },
]);

describe('ToolsPage', () => {
  let agent: Agent;

  function setup(url: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <AppRoutes />
          <Notifications />
        </MemoryRouter>
      </MedplumProvider>
    );
  }

  beforeAll(async () => {
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente',
    } as Agent);
  });

  test('Get status', async () => {
    await act(async () => {
      setup(`/${getReferenceString(agent)}/tools`);
    });

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Get Status'));
    });

    await expect(screen.findByText('disconnected', { exact: false })).resolves.toBeInTheDocument();
  });

  test('Renders last ping', async () => {
    // load agent page
    await act(async () => {
      setup(`/${getReferenceString(agent)}`);
    });

    const toolsTab = screen.getByRole('tab', { name: 'Tools' });

    // click on Tools tab
    await act(async () => {
      fireEvent.click(toolsTab);
    });

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('IP Address'), { target: { value: '8.8.8.8' } });
      fireEvent.click(screen.getByLabelText('Ping'));
    });

    await expect(screen.findByText('statistics', { exact: false })).resolves.toBeInTheDocument();
  });

  test('Displays error notification whenever invalid IP entered', async () => {
    // load agent tools page
    await act(async () => {
      setup(`/${getReferenceString(agent)}/tools`);
    });

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('IP Address'), { target: { value: 'abc123' } });
      fireEvent.click(screen.getByLabelText('Ping'));
    });

    await expect(screen.findByText('Destination device not found')).resolves.toBeInTheDocument();
  });

  test('Displays error notification whenever agent unreachable', async () => {
    medplum.setAgentAvailable(false);

    // load agent tools page
    await act(async () => {
      setup(`/${getReferenceString(agent)}/tools`);
    });

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('IP Address'), { target: { value: '8.8.8.8' } });
      fireEvent.click(screen.getByLabelText('Ping'));
    });

    await expect(screen.findByText('Timeout')).resolves.toBeInTheDocument();

    medplum.setAgentAvailable(true);
  });
});
