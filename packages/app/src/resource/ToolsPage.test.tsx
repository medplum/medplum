// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, cleanNotifications } from '@mantine/notifications';
import {
  ContentType,
  MEDPLUM_RELEASES_URL,
  MEDPLUM_VERSION,
  allOk,
  clearReleaseCache,
  getReferenceString,
  getStatus,
  isOperationOutcome,
  serverError,
  sleep,
} from '@medplum/core';
import { Agent } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, screen } from '../test-utils/render';

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: ReactNode) => <>{children}</>,
}));

function mockFetch(
  status: number,
  body: Record<string, unknown> | ((url: string, options?: any) => any),
  contentType = ContentType.JSON
): jest.Mock {
  const bodyFn = typeof body === 'function' ? body : () => body;
  return jest.fn((url: string, options?: any) => {
    const response = bodyFn(url, options);
    const responseStatus = isOperationOutcome(response) ? getStatus(response) : status;
    return Promise.resolve({
      ok: responseStatus < 400,
      status: responseStatus,
      headers: new Headers({ 'content-type': contentType }),
      blob: () => Promise.resolve(response),
      json: () => Promise.resolve(response),
    });
  });
}

describe('ToolsPage', () => {
  let agent: Agent;
  let medplum: MockClient;

  function setup(url: string): void {
    act(() => {
      render(<AppRoutes />, {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
              <Notifications />
            </MantineProvider>
          </MemoryRouter>
        ),
      });
    });
  }

  beforeAll(async () => {
    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'status', valueCode: 'disconnected' },
          { name: 'version', valueString: MEDPLUM_VERSION },
        ],
      },
    ]);

    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente',
      status: 'active',
    } satisfies Agent);
  });

  afterEach(() => {
    act(() => {
      cleanNotifications();
    });
  });

  test('Get status', async () => {
    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText('Get Status'));
    });

    await expect(screen.findByText('disconnected', { exact: false })).resolves.toBeInTheDocument();
    expect(screen.getByText(MEDPLUM_VERSION)).toBeInTheDocument();
  });

  test('Renders last ping', async () => {
    // load agent page
    setup(`/${getReferenceString(agent)}`);

    const toolsTab = screen.getByRole('tab', { name: 'Tools' });

    // click on Tools tab
    act(() => {
      fireEvent.click(toolsTab);
    });

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    act(() => {
      fireEvent.change(screen.getByLabelText('IP Address / Hostname'), { target: { value: '8.8.8.8' } });
      fireEvent.click(screen.getByLabelText('Ping'));
    });

    await expect(screen.findByText('statistics', { exact: false })).resolves.toBeInTheDocument();
  });

  test('Displays error notification whenever invalid IP entered', async () => {
    // load agent tools page
    setup(`/${getReferenceString(agent)}/tools`);

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    act(() => {
      fireEvent.change(screen.getByLabelText('IP Address / Hostname'), { target: { value: 'abc123' } });
      fireEvent.click(screen.getByLabelText('Ping'));
    });

    await expect(screen.findByText('Destination device not found')).resolves.toBeInTheDocument();
  });

  test('Displays error notification whenever agent unreachable', async () => {
    medplum.setAgentAvailable(false);

    // load agent tools page
    setup(`/${getReferenceString(agent)}/tools`);

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    act(() => {
      fireEvent.change(screen.getByLabelText('IP Address / Hostname'), { target: { value: '8.8.8.8' } });
      fireEvent.click(screen.getByLabelText('Ping'));
    });

    await expect(screen.findByText('Timeout')).resolves.toBeInTheDocument();

    medplum.setAgentAvailable(true);
  });

  test('Setting count for ping', async () => {
    const pushToAgentSpy = jest.spyOn(medplum, 'pushToAgent');

    // load agent page
    setup(`/${getReferenceString(agent)}`);

    const toolsTab = screen.getByRole('tab', { name: 'Tools' });

    // click on Tools tab
    act(() => {
      fireEvent.click(toolsTab);
    });

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    act(() => {
      fireEvent.change(screen.getByLabelText('IP Address / Hostname'), { target: { value: '8.8.8.8' } });
    });

    act(() => {
      fireEvent.change(screen.getByLabelText('Ping Count'), { target: { value: '2' } });
      fireEvent.click(screen.getByLabelText('Ping'));
    });

    await expect(screen.findByText('statistics', { exact: false })).resolves.toBeInTheDocument();
    expect(pushToAgentSpy).toHaveBeenLastCalledWith(
      { reference: getReferenceString(agent) },
      '8.8.8.8',
      'PING 2',
      ContentType.PING,
      true
    );
    pushToAgentSpy.mockRestore();
  });

  test('No host entered for ping', async () => {
    const pushToAgentSpy = jest.spyOn(medplum, 'pushToAgent');

    // load agent page
    setup(`/${getReferenceString(agent)}`);

    const toolsTab = screen.getByRole('tab', { name: 'Tools' });

    // click on Tools tab
    act(() => {
      fireEvent.click(toolsTab);
    });

    expect(screen.getAllByText(agent.name)[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByLabelText('Ping'));
    });

    await expect(screen.findByText('statistics', { exact: false })).rejects.toThrow();
    expect(pushToAgentSpy).not.toHaveBeenCalled();
    pushToAgentSpy.mockRestore();
  });

  test('Reload config -- Success', async () => {
    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$reload-config', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [],
      },
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Reload success',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload config/i }));
    });

    await expect(screen.findByText('Success')).resolves.toBeInTheDocument();
  });

  test('Reload config -- Error', async () => {
    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$reload-config', async () => [
      serverError(new Error('Something is broken')),
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Reload error',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload config/i }));
    });

    await act(async () => {
      await sleep(500);
    });

    expect(await screen.findByText(/something is broken/i)).toBeInTheDocument();
  });

  test('Upgrade -- Success', async () => {
    clearReleaseCache();
    globalThis.fetch = mockFetch(200, (url) => {
      if (url.startsWith(`${MEDPLUM_RELEASES_URL}/latest`)) {
        return {
          tag_name: 'v3.2.14',
          assets: [
            {
              url: 'https://api.github.com/repos/medplum/medplum/releases/assets/193665170',
              id: 193665170,
              name: 'medplum-agent-3.2.14-linux',
              browser_download_url:
                'https://github.com/medplum/medplum/releases/download/v3.2.14/medplum-agent-3.2.14-linux',
            },
          ],
        };
      }

      throw new Error('Expected Github releases URL to be called');
    });

    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'status',
            valueCode: 'connected',
          },
          {
            name: 'version',
            valueString: '3.2.13',
          },
          {
            name: 'lastUpdated',
            valueCode: new Date().toISOString(),
          },
        ],
      },
    ]);
    medplum.router.router.add('GET', 'Agent/:id/$upgrade', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [],
      },
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Upgrade success',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    });

    // This sleep is load bearing
    // Basically there is some strange behavior around the Mantine Portal implementation where it is initially rendered as `null`
    // The theory is that the above `act` is unable to track the Modal children since they are initially not rendered and therefore their useEffects
    // Are not queued before the end of the `act` block
    // See: https://github.com/mantinedev/mantine/blob/master/packages/%40mantine/core/src/components/Portal/Portal.tsx
    await act(async () => {
      await sleep(150);
    });

    await expect(
      screen.findByText('Are you sure you want to upgrade this agent from version 3.2.13 to version 3.2.14?')
    ).resolves.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /confirm upgrade/i }));
    });

    await expect(screen.findByText('Success')).resolves.toBeInTheDocument();
  });

  test('Upgrade -- Already up-to-date', async () => {
    clearReleaseCache();
    globalThis.fetch = mockFetch(200, (url) => {
      if (url.startsWith(`${MEDPLUM_RELEASES_URL}/latest`)) {
        return {
          tag_name: 'v3.2.14',
          assets: [
            {
              url: 'https://api.github.com/repos/medplum/medplum/releases/assets/193665170',
              id: 193665170,
              name: 'medplum-agent-3.2.14-linux',
              browser_download_url:
                'https://github.com/medplum/medplum/releases/download/v3.2.14/medplum-agent-3.2.14-linux',
            },
          ],
        };
      }

      throw new Error('Expected Github releases URL to be called');
    });

    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'status',
            valueCode: 'connected',
          },
          {
            name: 'version',
            valueString: '3.2.14',
          },
          {
            name: 'lastUpdated',
            valueCode: new Date().toISOString(),
          },
        ],
      },
    ]);
    medplum.router.router.add('GET', 'Agent/:id/$upgrade', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [],
      },
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Upgrade up-to-date',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    });

    // This sleep is load bearing
    // Basically there is some strange behavior around the Mantine Portal implementation where it is initially rendered as `null`
    // The theory is that the above `act` is unable to track the Modal children since they are initially not rendered and therefore their useEffects
    // Are not queued before the end of the `act` block
    // See: https://github.com/mantinedev/mantine/blob/master/packages/%40mantine/core/src/components/Portal/Portal.tsx
    await act(async () => {
      await sleep(150);
    });

    await expect(
      screen.findByText('This agent is already on the latest version (3.2.14).')
    ).resolves.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /confirm upgrade/i })).not.toBeInTheDocument();
  });

  test('Upgrade -- Unable to get version', async () => {
    clearReleaseCache();
    globalThis.fetch = mockFetch(200, (url) => {
      if (url.startsWith(`${MEDPLUM_RELEASES_URL}/latest`)) {
        return {
          tag_name: 'v3.2.14',
          assets: [
            {
              url: 'https://api.github.com/repos/medplum/medplum/releases/assets/193665170',
              id: 193665170,
              name: 'medplum-agent-3.2.14-linux',
              browser_download_url:
                'https://github.com/medplum/medplum/releases/download/v3.2.14/medplum-agent-3.2.14-linux',
            },
          ],
        };
      }

      throw new Error('Expected Github releases URL to be called');
    });

    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'status',
            valueCode: 'unknown',
          },
          {
            name: 'version',
            valueString: 'unknown',
          },
        ],
      },
    ]);
    medplum.router.router.add('GET', 'Agent/:id/$upgrade', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [],
      },
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Upgrade unknown version',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    });

    // This sleep is load bearing
    // Basically there is some strange behavior around the Mantine Portal implementation where it is initially rendered as `null`
    // The theory is that the above `act` is unable to track the Modal children since they are initially not rendered and therefore their useEffects
    // Are not queued before the end of the `act` block
    // See: https://github.com/mantinedev/mantine/blob/master/packages/%40mantine/core/src/components/Portal/Portal.tsx
    await act(async () => {
      await sleep(150);
    });

    expect(
      await screen.findByText(
        'Unable to determine the current version of the agent. Check the network connectivity of the agent.'
      )
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /confirm upgrade/i })).not.toBeInTheDocument();
  });

  test('Upgrade -- Error', async () => {
    clearReleaseCache();
    globalThis.fetch = mockFetch(200, (url) => {
      if (url.startsWith(`${MEDPLUM_RELEASES_URL}/latest`)) {
        return {
          tag_name: 'v3.2.14',
          assets: [
            {
              url: 'https://api.github.com/repos/medplum/medplum/releases/assets/193665170',
              id: 193665170,
              name: 'medplum-agent-3.2.14-linux',
              browser_download_url:
                'https://github.com/medplum/medplum/releases/download/v3.2.14/medplum-agent-3.2.14-linux',
            },
          ],
        };
      }

      throw new Error('Expected Github releases URL to be called');
    });

    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'status',
            valueCode: 'connected',
          },
          {
            name: 'version',
            valueString: '3.2.13',
          },
          {
            name: 'lastUpdated',
            valueCode: new Date().toISOString(),
          },
        ],
      },
    ]);
    medplum.router.router.add('GET', 'Agent/:id/$upgrade', async () => {
      return [serverError(new Error('Something is broken'))];
    });

    const medplumGetSpy = jest.spyOn(medplum, 'get');

    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Upgrade error',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    });

    // This sleep is load bearing
    // Basically there is some strange behavior around the Mantine Portal implementation where it is initially rendered as `null`
    // The theory is that the above `act` is unable to track the Modal children since they are initially not rendered and therefore their useEffects
    // Are not queued before the end of the `act` block
    // See: https://github.com/mantinedev/mantine/blob/master/packages/%40mantine/core/src/components/Portal/Portal.tsx
    await act(async () => {
      await sleep(150);
    });

    await expect(
      screen.findByText('Are you sure you want to upgrade this agent from version 3.2.13 to version 3.2.14?')
    ).resolves.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /confirm upgrade/i }));
    });

    expect(medplumGetSpy).toHaveBeenCalledWith(
      medplum.fhirUrl('Agent', agent.id as string, '$upgrade'),
      expect.objectContaining({ cache: 'reload' })
    );

    await act(async () => {
      await sleep(500);
    });

    expect(await screen.findByText(/something is broken/i)).toBeInTheDocument();
  });
});
