// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanNotifications } from '@mantine/notifications';
import type { LogMessage } from '@medplum/core';
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
import type { Agent } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as ReactDom from 'react-dom';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactDom>();
  return {
    ...actual,
    createPortal: (children: ReactNode) => <>{children}</>,
  };
});

function mockFetch(
  status: number,
  body: Record<string, unknown> | ((url: string, options?: any) => any),
  contentType = ContentType.JSON
): Mock {
  const bodyFn = typeof body === 'function' ? body : () => body;
  return vi.fn((url: string, options?: any) => {
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

const ALL_RELEASE_VERSIONS = [
  '3.2.14',
  '3.2.13',
  '3.2.12',
  '3.2.11',
  '3.2.10',
  '3.2.9',
  '3.2.8',
  '3.2.7',
  '3.2.6',
  '3.2.5',
  '3.2.4',
  '3.2.3',
  '3.2.2',
  '3.2.1',
  '3.2.0',
].map((version) => ({
  tag_name: `v${version}`,
  version,
  published_at: '2024-01-01T00:00:00.000Z',
}));

function mockUpgradeReleasesFetch(): Mock {
  return mockFetch(200, (url) => {
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

    if (url.startsWith(`${MEDPLUM_RELEASES_URL}/all.json`)) {
      return { versions: ALL_RELEASE_VERSIONS };
    }

    throw new Error('Expected Github releases URL to be called');
  });
}

const VERSION_SEARCH_PLACEHOLDER = 'Search versions...';

// The version picker is an AsyncAutocomplete: the currently-selected version renders as a
// removable Pill (hiding the search input) rather than as a native <select> value, so picking a
// different version means removing that pill first to reveal the search input again.
async function removeSelectedVersionPill(): Promise<void> {
  // Mantine marks the Pill's remove button aria-hidden (it's primarily reached via Backspace),
  // so it must be looked up with `hidden: true` to be found by role at all.
  const removeButton = within(screen.getByTestId('selected-items')).getByRole('button', { hidden: true });
  await act(async () => {
    fireEvent.click(removeButton);
  });
}

// Reveals the curated default option list (no search text) by clicking the now-empty input.
async function openDefaultVersionOptions(): Promise<void> {
  await removeSelectedVersionPill();
  const input = screen.getByPlaceholderText(VERSION_SEARCH_PLACEHOLDER);
  await act(async () => {
    fireEvent.click(input);
  });
  // AsyncAutocomplete debounces loadOptions by 100ms.
  await act(async () => {
    await sleep(150);
  });
}

// Removes the current pill, searches, and clicks the matching option in the results dropdown.
async function pickVersion(searchText: string, optionLabel: string): Promise<void> {
  await removeSelectedVersionPill();
  const input = screen.getByPlaceholderText(VERSION_SEARCH_PLACEHOLDER);
  await act(async () => {
    fireEvent.change(input, { target: { value: searchText } });
  });
  await act(async () => {
    await sleep(150);
  });
  const option = within(screen.getByTestId('options')).getByText(optionLabel);
  await act(async () => {
    fireEvent.click(option);
  });
}

describe('ToolsPage', () => {
  let agent: Agent;
  let medplum: MockClient;

  function setup(url: string): void {
    renderAppRoutes(medplum, url);
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
    expect((await screen.findAllByText(MEDPLUM_VERSION))[0]).toBeInTheDocument();
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

    await expect(screen.findByText('ping statistics', { exact: false })).resolves.toBeInTheDocument();
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
    const pushToAgentSpy = vi.spyOn(medplum, 'pushToAgent');

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

    await expect(screen.findByText('ping statistics', { exact: false })).resolves.toBeInTheDocument();
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
    const pushToAgentSpy = vi.spyOn(medplum, 'pushToAgent');

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

    await expect(screen.findByText('ping statistics', { exact: false })).rejects.toThrow();
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
    globalThis.fetch = mockUpgradeReleasesFetch();

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

    // Defaults to the latest version.
    expect(within(screen.getByTestId('selected-items')).getByText('3.2.14 (Latest)')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /confirm upgrade/i }));
    });

    await expect(screen.findByText('Success')).resolves.toBeInTheDocument();
  });

  test('Upgrade -- Select a specific version to upgrade to', async () => {
    clearReleaseCache();
    globalThis.fetch = mockUpgradeReleasesFetch();

    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'status', valueCode: 'connected' },
          { name: 'version', valueString: '3.2.6' },
          { name: 'lastUpdated', valueCode: new Date().toISOString() },
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
      name: 'Agente - Upgrade specific version',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    });

    await act(async () => {
      await sleep(150);
    });

    await expect(
      screen.findByText('Are you sure you want to upgrade this agent from version 3.2.6 to version 3.2.14?')
    ).resolves.toBeInTheDocument();

    await openDefaultVersionOptions();
    const optionsDropdown = screen.getByTestId('options');
    // The latest version is called out in its option label.
    expect(within(optionsDropdown).getByText('3.2.14 (Latest)')).toBeInTheDocument();
    // Of the 8 versions newer than current (3.2.7 .. 3.2.14), only the latest 5 (closest to
    // latest) are offered. Of the 6 versions older than current (3.2.0 .. 3.2.5), only the
    // nearest 5 (closest to current) are offered — 10 curated options total, not all 15 releases.
    for (const version of ['3.2.13', '3.2.12', '3.2.11', '3.2.10', '3.2.5', '3.2.4', '3.2.3', '3.2.2', '3.2.1']) {
      expect(within(optionsDropdown).getByText(version)).toBeInTheDocument();
    }
    // Versions further than 5 away in either direction are not part of the curated default list.
    expect(within(optionsDropdown).queryByText('3.2.9')).not.toBeInTheDocument();
    expect(within(optionsDropdown).queryByText('3.2.0')).not.toBeInTheDocument();

    // Searching filters across the *entire* known version history, not just the curated list.
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(VERSION_SEARCH_PLACEHOLDER), { target: { value: '3.2.0' } });
    });
    await act(async () => {
      await sleep(150);
    });
    expect(within(screen.getByTestId('options')).getByText('3.2.0')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(screen.getByTestId('options')).getByText('3.2.0'));
    });

    await expect(
      screen.findByText('Are you sure you want to downgrade this agent from version 3.2.6 to version 3.2.0?')
    ).resolves.toBeInTheDocument();

    // Switch to picking an upgrade target instead, to exercise the non-downgrade confirm path.
    await pickVersion('3.2.11', '3.2.11');

    await expect(
      screen.findByText('Are you sure you want to upgrade this agent from version 3.2.6 to version 3.2.11?')
    ).resolves.toBeInTheDocument();

    const medplumGetSpy = vi.spyOn(medplum, 'get');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /confirm upgrade/i }));
    });

    const upgradeUrl = medplum.fhirUrl('Agent', agent.id as string, '$upgrade');
    upgradeUrl.searchParams.set('force', 'false');
    upgradeUrl.searchParams.set('version', '3.2.11');
    expect(medplumGetSpy).toHaveBeenCalledWith(upgradeUrl, expect.objectContaining({ cache: 'reload' }));

    await expect(screen.findByText('Success')).resolves.toBeInTheDocument();
    medplumGetSpy.mockRestore();
  });

  test('Upgrade -- Downgrade requires confirmation', async () => {
    clearReleaseCache();
    globalThis.fetch = mockUpgradeReleasesFetch();

    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$status', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'status', valueCode: 'connected' },
          { name: 'version', valueString: '3.2.13' },
          { name: 'lastUpdated', valueCode: new Date().toISOString() },
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
      name: 'Agente - Downgrade confirmation',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /upgrade/i }));
    });

    await act(async () => {
      await sleep(150);
    });

    await pickVersion('3.2.10', '3.2.10');

    await expect(
      screen.findByText('Are you sure you want to downgrade this agent from version 3.2.13 to version 3.2.10?')
    ).resolves.toBeInTheDocument();

    // User declines the downgrade warning: no upgrade request should be sent.
    const medplumGetSpy = vi.spyOn(medplum, 'get');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /confirm upgrade/i }));
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      'The Medplum Agent is frequently patched with new features and bugfixes. Downgrading your agent can result in ' +
        'picking up old bugs or losing features you may be relying on. Are you sure you want to downgrade?'
    );
    expect(medplumGetSpy).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cache: 'reload' }));

    // User accepts the downgrade warning: the upgrade request should now be sent with the older version.
    confirmSpy.mockReturnValueOnce(true);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /confirm upgrade/i }));
    });

    const upgradeUrl = medplum.fhirUrl('Agent', agent.id as string, '$upgrade');
    upgradeUrl.searchParams.set('force', 'false');
    upgradeUrl.searchParams.set('version', '3.2.10');
    expect(medplumGetSpy).toHaveBeenCalledWith(upgradeUrl, expect.objectContaining({ cache: 'reload' }));

    await expect(screen.findByText('Success')).resolves.toBeInTheDocument();

    confirmSpy.mockRestore();
    medplumGetSpy.mockRestore();
  });

  test('Upgrade -- Already up-to-date', async () => {
    clearReleaseCache();
    globalThis.fetch = mockUpgradeReleasesFetch();

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

    await expect(screen.findByText('This agent is already on version 3.2.14.')).resolves.toBeInTheDocument();

    // The version picker (defaulting to latest) and confirm button remain available, so the
    // user can still choose to downgrade even though they're already on the latest version.
    expect(within(screen.getByTestId('selected-items')).getByText('3.2.14 (Latest)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm upgrade/i })).toBeInTheDocument();
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
    globalThis.fetch = mockUpgradeReleasesFetch();

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

    const medplumGetSpy = vi.spyOn(medplum, 'get');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /confirm upgrade/i }));
    });

    const upgradeUrl = medplum.fhirUrl('Agent', agent.id as string, '$upgrade');
    upgradeUrl.searchParams.set('force', 'false');
    upgradeUrl.searchParams.set('version', '3.2.14');

    expect(medplumGetSpy).toHaveBeenCalledWith(upgradeUrl, expect.objectContaining({ cache: 'reload' }));

    await act(async () => {
      await sleep(500);
    });

    expect(await screen.findByText(/something is broken/i)).toBeInTheDocument();
  });

  test('Fetch logs -- Success', async () => {
    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$fetch-logs', async () => {
      return [
        allOk,
        {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'logs',
              valueString: (
                [
                  { level: 'INFO', timestamp: new Date().toISOString(), msg: 'Test 1' },
                  { level: 'INFO', timestamp: new Date().toISOString(), msg: 'Test 2' },
                  { level: 'WARN', timestamp: new Date().toISOString(), msg: 'Test 3' },
                  {
                    level: 'ERROR',
                    timestamp: new Date().toISOString(),
                    msg: 'There is an error',
                    error: 'There is an error',
                  },
                ] as LogMessage[]
              )
                .map((msg) => JSON.stringify(msg))
                .join('\n'),
            },
          ],
        },
      ];
    });
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Fetch logs success',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /fetch logs/i }));
    });

    expect((await screen.findAllByText(/there is an error/i))[0]).toBeInTheDocument();
  });

  test('Fetch logs -- Load More paginates with before cursor', async () => {
    medplum = new MockClient();
    const seenBefore: (string | undefined)[] = [];
    medplum.router.router.add('GET', 'Agent/:id/$fetch-logs', async (req) => {
      const before = req.query.before as string | undefined;
      seenBefore.push(before);
      if (!before) {
        // First page: newest logs, more remain.
        return [
          allOk,
          {
            resourceType: 'Parameters',
            parameter: [
              {
                name: 'logs',
                valueString: JSON.stringify({
                  level: 'INFO',
                  timestamp: '2020-01-02T00:00:00.000Z',
                  msg: 'Newest log',
                }),
              },
              { name: 'hasMore', valueBoolean: true },
              { name: 'nextBefore', valueString: '2020-01-02T00:00:00.000Z' },
            ],
          },
        ];
      }
      // Second page: older logs, nothing left.
      return [
        allOk,
        {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'logs',
              valueString: JSON.stringify({ level: 'INFO', timestamp: '2020-01-01T00:00:00.000Z', msg: 'Older log' }),
            },
            { name: 'hasMore', valueBoolean: false },
          ],
        },
      ];
    });
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Fetch logs load more',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /fetch logs/i }));
    });

    expect((await screen.findAllByText(/newest log/i))[0]).toBeInTheDocument();

    // A "Load More" button should appear because hasMore was true.
    const loadMore = await screen.findByRole('button', { name: /load more logs/i });

    act(() => {
      fireEvent.click(loadMore);
    });

    // Older logs are appended beneath the first page.
    expect((await screen.findAllByText(/older log/i))[0]).toBeInTheDocument();
    expect((await screen.findAllByText(/newest log/i))[0]).toBeInTheDocument();

    // The second request forwarded the cursor from the first response.
    expect(seenBefore).toStrictEqual([undefined, '2020-01-02T00:00:00.000Z']);
  });

  test('Get stats -- Success', async () => {
    medplum = new MockClient();
    const channelRtt = {
      count: 10,
      pendingCount: 1,
      min: 2,
      max: 50,
      average: 12,
      p50: 11,
      p95: 40,
      p99: 48,
    };
    const clientRtt = {
      count: 7,
      pendingCount: 0,
      min: 3,
      max: 33,
      average: 9,
      p50: 8,
      p95: 27,
      p99: 31,
    };
    medplum.router.router.add('GET', 'Agent/:id/$stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'stats',
            valueString: JSON.stringify({
              hl7ConnectionsOpen: 1,
              ping: 5,
              webSocketQueueDepth: 0,
              hl7QueueDepth: 0,
              hl7ClientCount: 0,
              live: true,
              outstandingHeartbeats: 0,
              extraField: 'custom-value',
              channelStats: {
                'channel-A': { rtt: channelRtt },
                'channel-empty': { rtt: undefined },
              },
              clientStats: {
                'client-X': { rtt: clientRtt },
              },
            }),
          },
        ],
      },
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Stats success',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /get stats/i }));
    });

    // Summary table
    expect((await screen.findAllByText(/hl7ConnectionsOpen/i))[0]).toBeInTheDocument();
    expect(screen.getByText('ping')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('live')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    // Extra (unknown) field is rendered
    expect(screen.getByText('extraField')).toBeInTheDocument();
    expect(screen.getByText('custom-value')).toBeInTheDocument();

    // Channel Stats table
    expect(screen.getByRole('heading', { name: 'Channel Stats' })).toBeInTheDocument();
    expect(screen.getByText('channel-A')).toBeInTheDocument();
    // Entries with no rtt are filtered out
    expect(screen.queryByText('channel-empty')).not.toBeInTheDocument();
    expect(screen.getByText(channelRtt.count.toString())).toBeInTheDocument();
    expect(screen.getByText(channelRtt.p95.toString())).toBeInTheDocument();
    expect(screen.getByText(channelRtt.p99.toString())).toBeInTheDocument();

    // Client Stats table
    expect(screen.getByRole('heading', { name: 'Client Stats' })).toBeInTheDocument();
    expect(screen.getByText('client-X')).toBeInTheDocument();
    expect(screen.getByText(clientRtt.average.toString())).toBeInTheDocument();
    expect(screen.getByText(clientRtt.p50.toString())).toBeInTheDocument();
  });

  test('Get stats -- Empty channel and client stats hide tables', async () => {
    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$stats', async () => [
      allOk,
      {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'stats',
            valueString: JSON.stringify({
              hl7ConnectionsOpen: 0,
              ping: 1,
              webSocketQueueDepth: 0,
              hl7QueueDepth: 0,
              hl7ClientCount: 0,
              live: true,
              outstandingHeartbeats: 0,
              channelStats: {},
              clientStats: {},
            }),
          },
        ],
      },
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Stats empty channels',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /get stats/i }));
    });

    expect((await screen.findAllByText(/hl7ConnectionsOpen/i))[0]).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Channel Stats' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Client Stats' })).not.toBeInTheDocument();
  });

  test('Get stats -- Error', async () => {
    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$stats', async () => [serverError(new Error('Something is broken'))]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Stats error',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /get stats/i }));
    });

    await act(async () => {
      await sleep(500);
    });

    expect(await screen.findByText(/something is broken/i)).toBeInTheDocument();
  });

  test('Fetch logs -- Error', async () => {
    medplum = new MockClient();
    medplum.router.router.add('GET', 'Agent/:id/$fetch-logs', async () => [
      serverError(new Error('Something is broken')),
    ]);
    agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Agente - Fetch logs error',
      status: 'active',
    });

    setup(`/${getReferenceString(agent)}/tools`);

    expect((await screen.findAllByText(agent.name))[0]).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /fetch logs/i }));
    });

    await act(async () => {
      await sleep(500);
    });

    expect(await screen.findByText(/something is broken/i)).toBeInTheDocument();
  });
});
